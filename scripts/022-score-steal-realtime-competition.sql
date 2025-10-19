-- Score Steal Game - Realtime Competition Mode
-- This migration updates the Score Steal game to work as a real-time competition
-- where all teams answer the same question simultaneously

-- 1. Add question_broadcast_at to track when question was shown to teams
ALTER TABLE score_steal_sessions ADD COLUMN IF NOT EXISTS current_question_id UUID REFERENCES score_steal_questions(id);
ALTER TABLE score_steal_sessions ADD COLUMN IF NOT EXISTS question_broadcast_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE score_steal_sessions ADD COLUMN IF NOT EXISTS winner_team_id UUID REFERENCES teams(id);
ALTER TABLE score_steal_sessions ADD COLUMN IF NOT EXISTS phase VARCHAR(20) DEFAULT 'waiting' CHECK (phase IN ('waiting', 'question_active', 'waiting_for_target', 'completed'));

-- 2. Update score_steal_attempts to track response time and winner status
ALTER TABLE score_steal_attempts ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;
ALTER TABLE score_steal_attempts ADD COLUMN IF NOT EXISTS is_winner BOOLEAN DEFAULT FALSE;
ALTER TABLE score_steal_attempts ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES score_steal_sessions(id);

-- 3. Create score_steal_protected_teams table to track teams that can't be targeted
CREATE TABLE IF NOT EXISTS score_steal_protected_teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    reason VARCHAR(50) DEFAULT 'victim_last_round',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_id, team_id, round_number)
);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_score_steal_protected_teams_game ON score_steal_protected_teams(game_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_protected_teams_team ON score_steal_protected_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_protected_teams_round ON score_steal_protected_teams(round_number);
CREATE INDEX IF NOT EXISTS idx_score_steal_attempts_session ON score_steal_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_attempts_response_time ON score_steal_attempts(response_time_ms);

-- Enable RLS
ALTER TABLE score_steal_protected_teams ENABLE ROW LEVEL SECURITY;

-- Create policy
DROP POLICY IF EXISTS "Allow all operations on score_steal_protected_teams" ON score_steal_protected_teams;
CREATE POLICY "Allow all operations on score_steal_protected_teams" ON score_steal_protected_teams FOR ALL USING (true);

-- 5. Function to submit answer in race mode
CREATE OR REPLACE FUNCTION submit_answer_race(
    p_session_id UUID,
    p_game_id UUID,
    p_round_number INTEGER,
    p_team_id UUID,
    p_question_id UUID,
    p_answer TEXT,
    p_correct_answer TEXT,
    p_broadcast_time TIMESTAMPTZ
) RETURNS jsonb AS $$
DECLARE
    v_is_correct BOOLEAN;
    v_response_time_ms INTEGER;
    v_attempt_id UUID;
    v_existing_attempt UUID;
BEGIN
    -- Check if team already submitted
    SELECT id INTO v_existing_attempt
    FROM score_steal_attempts
    WHERE session_id = p_session_id
    AND team_id = p_team_id
    AND question_id = p_question_id;
    
    IF v_existing_attempt IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Already submitted answer for this question'
        );
    END IF;
    
    -- Calculate response time in milliseconds
    v_response_time_ms := EXTRACT(EPOCH FROM (NOW() - p_broadcast_time)) * 1000;
    
    -- Check if answer is correct (case-insensitive trim)
    v_is_correct := LOWER(TRIM(p_answer)) = LOWER(TRIM(p_correct_answer));
    
    -- Insert attempt
    INSERT INTO score_steal_attempts (
        game_id,
        round_number,
        session_id,
        team_id,
        question_id,
        target_team_id,
        answer,
        is_correct,
        response_time_ms,
        is_winner
    ) VALUES (
        p_game_id,
        p_round_number,
        p_session_id,
        p_team_id,
        p_question_id,
        NULL, -- Will be set by winner selection
        p_answer,
        v_is_correct,
        v_response_time_ms,
        FALSE
    ) RETURNING id INTO v_attempt_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'attempt_id', v_attempt_id,
        'is_correct', v_is_correct,
        'response_time_ms', v_response_time_ms
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to determine winner (fastest correct answer)
CREATE OR REPLACE FUNCTION determine_round_winner(
    p_session_id UUID
) RETURNS jsonb AS $$
DECLARE
    v_winner_attempt RECORD;
    v_winner_team_name TEXT;
BEGIN
    -- Find fastest correct answer
    SELECT a.id, a.team_id, a.response_time_ms, t.team_name
    INTO v_winner_attempt
    FROM score_steal_attempts a
    JOIN teams t ON t.id = a.team_id
    WHERE a.session_id = p_session_id
    AND a.is_correct = TRUE
    ORDER BY a.response_time_ms ASC
    LIMIT 1;
    
    IF v_winner_attempt IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No correct answers found'
        );
    END IF;
    
    -- Mark the winner
    UPDATE score_steal_attempts
    SET is_winner = TRUE
    WHERE id = v_winner_attempt.id;
    
    -- Update session with winner
    UPDATE score_steal_sessions
    SET winner_team_id = v_winner_attempt.team_id,
        phase = 'waiting_for_target'
    WHERE id = p_session_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'winner_team_id', v_winner_attempt.team_id,
        'winner_team_name', v_winner_attempt.team_name,
        'response_time_ms', v_winner_attempt.response_time_ms
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to execute score steal with protection logic
CREATE OR REPLACE FUNCTION execute_score_steal_safe(
    p_session_id UUID,
    p_game_id UUID,
    p_round_number INTEGER,
    p_winner_team_id UUID,
    p_target_team_id UUID,
    p_question_id UUID,
    p_points INTEGER
) RETURNS jsonb AS $$
DECLARE
    v_target_score INTEGER;
    v_winner_score INTEGER;
    v_points_stolen INTEGER;
    v_is_protected BOOLEAN;
BEGIN
    -- Check if target team is protected
    SELECT EXISTS(
        SELECT 1 FROM score_steal_protected_teams
        WHERE game_id = p_game_id
        AND team_id = p_target_team_id
        AND round_number = p_round_number
    ) INTO v_is_protected;
    
    IF v_is_protected THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Target team is protected this round'
        );
    END IF;
    
    -- Get current scores
    SELECT score INTO v_target_score FROM teams WHERE id = p_target_team_id FOR UPDATE;
    SELECT score INTO v_winner_score FROM teams WHERE id = p_winner_team_id FOR UPDATE;
    
    -- Calculate points to steal (can't go below 0)
    v_points_stolen := LEAST(p_points, v_target_score);
    
    -- Update scores
    UPDATE teams SET score = score - v_points_stolen WHERE id = p_target_team_id;
    UPDATE teams SET score = score + v_points_stolen WHERE id = p_winner_team_id;
    
    -- Get updated scores
    SELECT score INTO v_target_score FROM teams WHERE id = p_target_team_id;
    SELECT score INTO v_winner_score FROM teams WHERE id = p_winner_team_id;
    
    -- Update the winner's attempt with target team
    UPDATE score_steal_attempts
    SET target_team_id = p_target_team_id,
        points_gained = v_points_stolen,
        points_lost = v_points_stolen
    WHERE session_id = p_session_id
    AND team_id = p_winner_team_id
    AND question_id = p_question_id
    AND is_winner = TRUE;
    
    -- Protect the target team in next round
    INSERT INTO score_steal_protected_teams (game_id, team_id, round_number, reason)
    VALUES (p_game_id, p_target_team_id, p_round_number + 1, 'victim_last_round')
    ON CONFLICT (game_id, team_id, round_number) DO NOTHING;
    
    -- Mark session as completed
    UPDATE score_steal_sessions
    SET phase = 'completed',
        ended_at = NOW()
    WHERE id = p_session_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'points_stolen', v_points_stolen,
        'winner_score', v_winner_score,
        'target_score', v_target_score
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to get protected teams for a round
CREATE OR REPLACE FUNCTION get_protected_teams(
    p_game_id UUID,
    p_round_number INTEGER
) RETURNS TABLE (
    team_id UUID,
    team_name TEXT,
    reason VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.team_id,
        t.team_name,
        p.reason
    FROM score_steal_protected_teams p
    JOIN teams t ON t.id = p.team_id
    WHERE p.game_id = p_game_id
    AND p.round_number = p_round_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Function to broadcast question (update session)
CREATE OR REPLACE FUNCTION broadcast_question(
    p_session_id UUID,
    p_question_id UUID
) RETURNS jsonb AS $$
BEGIN
    UPDATE score_steal_sessions
    SET current_question_id = p_question_id,
        question_broadcast_at = NOW(),
        phase = 'question_active'
    WHERE id = p_session_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'broadcast_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

