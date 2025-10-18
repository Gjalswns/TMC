-- Concurrent Safety Improvements for Multi-User Scalability
-- This script addresses race conditions and improves data integrity

-- ============================================================================
-- 1. ADD ADVISORY LOCKS FOR CRITICAL OPERATIONS
-- ============================================================================

-- Function to safely increment team score with row-level locking
CREATE OR REPLACE FUNCTION increment_team_score_safe(p_team_id UUID, p_points INTEGER)
RETURNS TABLE(new_score INTEGER) AS $$
DECLARE
  v_new_score INTEGER;
BEGIN
  -- Use SELECT FOR UPDATE to lock the row
  UPDATE teams 
  SET score = score + p_points 
  WHERE id = p_team_id
  RETURNING score INTO v_new_score;
  
  RETURN QUERY SELECT v_new_score;
END;
$$ LANGUAGE plpgsql;

-- Function to safely decrement team score with row-level locking
CREATE OR REPLACE FUNCTION decrement_team_score_safe(p_team_id UUID, p_points INTEGER)
RETURNS TABLE(new_score INTEGER) AS $$
DECLARE
  v_new_score INTEGER;
BEGIN
  -- Use SELECT FOR UPDATE to lock the row, ensure score doesn't go negative
  UPDATE teams 
  SET score = GREATEST(score - p_points, 0)
  WHERE id = p_team_id
  RETURNING score INTO v_new_score;
  
  RETURN QUERY SELECT v_new_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. YEAR GAME: PREVENT DUPLICATE NUMBER SUBMISSIONS
-- ============================================================================

-- Add unique constraint to prevent same team from submitting same number twice
ALTER TABLE year_game_attempts 
DROP CONSTRAINT IF EXISTS unique_team_target_number;

ALTER TABLE year_game_attempts
ADD CONSTRAINT unique_team_target_number 
UNIQUE (session_id, team_id, target_number, is_correct)
WHERE (is_correct = true);

-- Create index for faster duplicate checking
CREATE INDEX IF NOT EXISTS idx_year_game_attempts_duplicate_check 
ON year_game_attempts(session_id, team_id, target_number, is_correct)
WHERE is_correct = true;

-- Function to submit Year Game attempt with atomic duplicate checking
CREATE OR REPLACE FUNCTION submit_year_game_attempt_safe(
  p_session_id UUID,
  p_team_id UUID,
  p_participant_id UUID,
  p_expression TEXT,
  p_target_number INTEGER,
  p_is_valid BOOLEAN,
  p_is_correct BOOLEAN
)
RETURNS JSON AS $$
DECLARE
  v_result RECORD;
  v_is_duplicate BOOLEAN := FALSE;
  v_numbers_found INTEGER[];
  v_new_score INTEGER;
  v_attempt_id UUID;
BEGIN
  -- Start transaction with serializable isolation
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  
  -- Check if this is a duplicate correct answer
  IF p_is_correct THEN
    SELECT EXISTS(
      SELECT 1 FROM year_game_attempts
      WHERE session_id = p_session_id
        AND team_id = p_team_id
        AND target_number = p_target_number
        AND is_correct = true
    ) INTO v_is_duplicate;
  END IF;
  
  -- Insert the attempt
  INSERT INTO year_game_attempts (
    session_id, team_id, participant_id, 
    expression, target_number, 
    is_valid, is_correct, is_duplicate
  ) VALUES (
    p_session_id, p_team_id, p_participant_id,
    p_expression, p_target_number,
    p_is_valid, p_is_correct, v_is_duplicate
  ) RETURNING id INTO v_attempt_id;
  
  -- If correct and not duplicate, update team results
  IF p_is_correct AND NOT v_is_duplicate THEN
    -- Lock the result row and update
    UPDATE year_game_results
    SET 
      numbers_found = array_append(numbers_found, p_target_number),
      total_found = array_length(array_append(numbers_found, p_target_number), 1),
      updated_at = NOW()
    WHERE session_id = p_session_id AND team_id = p_team_id
    RETURNING numbers_found INTO v_numbers_found;
    
    -- Calculate new score (100 points per number found)
    v_new_score := array_length(v_numbers_found, 1) * 100;
    
    -- Update team score in teams table
    UPDATE year_game_results
    SET score = v_new_score
    WHERE session_id = p_session_id AND team_id = p_team_id;
    
    -- Update team's overall score
    PERFORM increment_team_score_safe(p_team_id, 100);
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'is_duplicate', v_is_duplicate,
    'new_score', v_new_score
  );
  
EXCEPTION
  WHEN unique_violation THEN
    -- Another transaction beat us to it
    RETURN json_build_object(
      'success', true,
      'attempt_id', NULL,
      'is_duplicate', true,
      'new_score', NULL
    );
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. RELAY QUIZ: PREVENT MULTIPLE SUBMISSIONS FROM SAME PARTICIPANT
-- ============================================================================

-- Add unique constraint
ALTER TABLE relay_quiz_attempts
DROP CONSTRAINT IF EXISTS unique_participant_question;

ALTER TABLE relay_quiz_attempts
ADD CONSTRAINT unique_participant_question
UNIQUE (session_id, team_id, participant_id, question_id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_relay_quiz_attempts_participant_check
ON relay_quiz_attempts(session_id, team_id, participant_id, question_id);

-- Function to submit relay quiz answer with atomic checking
CREATE OR REPLACE FUNCTION submit_relay_quiz_answer_safe(
  p_session_id UUID,
  p_team_id UUID,
  p_participant_id UUID,
  p_question_id UUID,
  p_answer TEXT,
  p_correct_answer TEXT,
  p_points INTEGER,
  p_previous_answer TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_is_correct BOOLEAN;
  v_points_earned INTEGER;
  v_team_progress RECORD;
  v_question_order INTEGER;
  v_attempt_id UUID;
BEGIN
  -- Check if answer is correct
  v_is_correct := LOWER(TRIM(p_answer)) = LOWER(TRIM(p_correct_answer));
  v_points_earned := CASE WHEN v_is_correct THEN p_points ELSE 0 END;
  
  -- Lock team progress row
  SELECT * INTO v_team_progress
  FROM relay_quiz_team_progress
  WHERE session_id = p_session_id AND team_id = p_team_id
  FOR UPDATE;
  
  -- Get question order
  SELECT question_order INTO v_question_order
  FROM relay_quiz_questions
  WHERE id = p_question_id;
  
  -- Verify this is the correct question for the team
  IF v_team_progress.current_question_order != v_question_order THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Wrong question order'
    );
  END IF;
  
  -- Insert attempt (will fail if duplicate due to unique constraint)
  INSERT INTO relay_quiz_attempts (
    session_id, team_id, participant_id, question_id,
    answer, is_correct, previous_answer, points_earned
  ) VALUES (
    p_session_id, p_team_id, p_participant_id, p_question_id,
    p_answer, v_is_correct, p_previous_answer, v_points_earned
  ) RETURNING id INTO v_attempt_id;
  
  -- Update team progress
  UPDATE relay_quiz_team_progress
  SET 
    questions_completed = questions_completed + 1,
    total_score = total_score + v_points_earned,
    current_question_order = current_question_order + 1,
    last_participant_id = p_participant_id,
    updated_at = NOW()
  WHERE session_id = p_session_id AND team_id = p_team_id;
  
  -- Update team score if correct
  IF v_is_correct THEN
    PERFORM increment_team_score_safe(p_team_id, v_points_earned);
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'is_correct', v_is_correct,
    'points_earned', v_points_earned,
    'next_question_order', v_team_progress.current_question_order + 1
  );
  
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Participant already answered this question'
    );
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. SCORE STEAL: PREVENT RACE CONDITIONS IN SCORE TRANSFERS
-- ============================================================================

-- Add constraint to prevent duplicate attempts
CREATE UNIQUE INDEX IF NOT EXISTS idx_score_steal_attempts_unique
ON score_steal_attempts(game_id, round_number, team_id, question_id, target_team_id)
WHERE is_correct = true;

-- Function to handle score steal with atomic score transfer
CREATE OR REPLACE FUNCTION submit_score_steal_attempt_safe(
  p_game_id UUID,
  p_round_number INTEGER,
  p_team_id UUID,
  p_question_id UUID,
  p_target_team_id UUID,
  p_answer TEXT,
  p_correct_answer TEXT,
  p_points INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_is_correct BOOLEAN;
  v_points_gained INTEGER;
  v_points_lost INTEGER;
  v_attempt_id UUID;
  v_attacking_score INTEGER;
  v_target_score INTEGER;
BEGIN
  -- Check if answer is correct
  v_is_correct := LOWER(TRIM(p_answer)) = LOWER(TRIM(p_correct_answer));
  
  -- Calculate points
  IF v_is_correct THEN
    v_points_gained := p_points;
    v_points_lost := p_points;
  ELSE
    v_points_gained := -FLOOR(p_points / 2);
    v_points_lost := 0;
  END IF;
  
  -- Lock both team rows in consistent order (by UUID) to prevent deadlock
  IF p_team_id < p_target_team_id THEN
    PERFORM 1 FROM teams WHERE id = p_team_id FOR UPDATE;
    PERFORM 1 FROM teams WHERE id = p_target_team_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM teams WHERE id = p_target_team_id FOR UPDATE;
    PERFORM 1 FROM teams WHERE id = p_team_id FOR UPDATE;
  END IF;
  
  -- Insert attempt
  INSERT INTO score_steal_attempts (
    game_id, round_number, team_id, question_id, target_team_id,
    answer, is_correct, points_gained, points_lost
  ) VALUES (
    p_game_id, p_round_number, p_team_id, p_question_id, p_target_team_id,
    p_answer, v_is_correct, v_points_gained, v_points_lost
  ) RETURNING id INTO v_attempt_id;
  
  -- Update scores atomically
  IF v_is_correct THEN
    -- Attacking team gains points
    SELECT new_score INTO v_attacking_score 
    FROM increment_team_score_safe(p_team_id, v_points_gained);
    
    -- Target team loses points
    SELECT new_score INTO v_target_score
    FROM decrement_team_score_safe(p_target_team_id, v_points_lost);
  ELSE
    -- Attacking team loses points (penalty)
    SELECT new_score INTO v_attacking_score
    FROM decrement_team_score_safe(p_team_id, ABS(v_points_gained));
    
    v_target_score := NULL;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'is_correct', v_is_correct,
    'points_gained', v_points_gained,
    'points_lost', v_points_lost,
    'attacking_team_score', v_attacking_score,
    'target_team_score', v_target_score
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. PARTICIPANT JOIN: ATOMIC VALIDATION AND INSERTION
-- ============================================================================

-- Function to join game atomically
CREATE OR REPLACE FUNCTION join_game_atomic(
  p_game_id UUID,
  p_nickname VARCHAR(100),
  p_student_id VARCHAR(50) DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_game RECORD;
  v_participant_count INTEGER;
  v_participant_id UUID;
BEGIN
  -- Lock game row to prevent concurrent joins exceeding max
  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;
  
  -- Validate game exists
  IF v_game IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Game not found');
  END IF;
  
  -- Check if game is joinable
  IF v_game.status != 'waiting' THEN
    RETURN json_build_object('success', false, 'error', 'Game is not in waiting status');
  END IF;
  
  -- Count current participants (within same transaction)
  SELECT COUNT(*) INTO v_participant_count
  FROM participants
  WHERE game_id = p_game_id;
  
  -- Check if game is full
  IF v_participant_count >= v_game.max_participants THEN
    RETURN json_build_object('success', false, 'error', 'Game is full');
  END IF;
  
  -- Check game expiry
  IF v_game.game_expires_at IS NOT NULL AND NOW() > v_game.game_expires_at THEN
    RETURN json_build_object('success', false, 'error', 'Game has expired');
  END IF;
  
  -- Check join deadline
  IF v_game.join_deadline_minutes IS NOT NULL THEN
    IF NOW() > (v_game.created_at + INTERVAL '1 minute' * v_game.join_deadline_minutes) THEN
      RETURN json_build_object('success', false, 'error', 'Join deadline has passed');
    END IF;
  END IF;
  
  -- Insert participant
  INSERT INTO participants (game_id, nickname, student_id)
  VALUES (p_game_id, p_nickname, p_student_id)
  RETURNING id INTO v_participant_id;
  
  RETURN json_build_object(
    'success', true,
    'participant_id', v_participant_id,
    'participant_count', v_participant_count + 1
  );
  
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%unique_nickname_per_game%' THEN
      RETURN json_build_object('success', false, 'error', 'Nickname already taken in this game');
    ELSIF SQLERRM LIKE '%unique_student_id_per_game%' THEN
      RETURN json_build_object('success', false, 'error', 'Student ID already registered in this game');
    ELSE
      RETURN json_build_object('success', false, 'error', 'Duplicate entry detected');
    END IF;
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. ADD TIMESTAMPS FOR OPTIMISTIC LOCKING
-- ============================================================================

-- Add updated_at trigger to teams table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at column to teams if not exists
ALTER TABLE teams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create trigger
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION increment_team_score_safe(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_team_score_safe(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_year_game_attempt_safe(UUID, UUID, UUID, TEXT, INTEGER, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_relay_quiz_answer_safe(UUID, UUID, UUID, UUID, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_score_steal_attempt_safe(UUID, INTEGER, UUID, UUID, UUID, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION join_game_atomic(UUID, VARCHAR(100), VARCHAR(50)) TO authenticated;

-- Also grant to anon for public game joining
GRANT EXECUTE ON FUNCTION join_game_atomic(UUID, VARCHAR(100), VARCHAR(50)) TO anon;

-- ============================================================================
-- 8. CREATE MONITORING VIEW FOR CONCURRENT ISSUES
-- ============================================================================

CREATE OR REPLACE VIEW v_concurrent_activity AS
SELECT 
  g.id as game_id,
  g.title as game_title,
  g.status as game_status,
  COUNT(DISTINCT p.id) as total_participants,
  COUNT(DISTINCT yga.id) as year_game_attempts_count,
  COUNT(DISTINCT rqa.id) as relay_quiz_attempts_count,
  COUNT(DISTINCT ssa.id) as score_steal_attempts_count,
  MAX(yga.submitted_at) as last_year_game_activity,
  MAX(rqa.submitted_at) as last_relay_quiz_activity,
  MAX(ssa.submitted_at) as last_score_steal_activity
FROM games g
LEFT JOIN participants p ON g.id = p.game_id
LEFT JOIN year_game_attempts yga ON yga.session_id IN (
  SELECT id FROM year_game_sessions WHERE game_id = g.id
)
LEFT JOIN relay_quiz_attempts rqa ON rqa.session_id IN (
  SELECT id FROM relay_quiz_sessions WHERE game_id = g.id
)
LEFT JOIN score_steal_attempts ssa ON ssa.game_id = g.id
WHERE g.created_at > NOW() - INTERVAL '24 hours'
GROUP BY g.id, g.title, g.status;

-- Grant select on view
GRANT SELECT ON v_concurrent_activity TO authenticated;

-- ============================================================================
-- COMPLETION
-- ============================================================================

-- Log completion
DO $$ 
BEGIN 
  RAISE NOTICE 'Concurrent safety improvements completed successfully';
END $$;
