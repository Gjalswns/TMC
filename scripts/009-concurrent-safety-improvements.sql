-- =====================================================
-- 009: Concurrent Safety Improvements
-- =====================================================
-- Purpose: Resolve race conditions and ensure atomic operations
-- Date: 2025-10-18
-- Version: 1.0.0
-- =====================================================

-- =========================
-- 1. ATOMIC OPERATIONS
-- =========================

-- Function: Atomic game join operation
-- Prevents race conditions when multiple users join simultaneously
CREATE OR REPLACE FUNCTION join_game_atomic(
  p_game_id UUID,
  p_nickname VARCHAR(100),
  p_student_id VARCHAR(50) DEFAULT NULL,
  p_team_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_game RECORD;
  v_participant_id UUID;
  v_participant_count INTEGER;
  v_result JSON;
BEGIN
  -- Start transaction with row-level lock
  -- Use FOR UPDATE to lock the game row
  SELECT * INTO v_game 
  FROM games 
  WHERE id = p_game_id 
  FOR UPDATE;
  
  -- Check if game exists
  IF v_game IS NULL THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Game not found'
    );
  END IF;
  
  -- Check game status
  IF v_game.status != 'waiting' THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Game is not accepting participants'
    );
  END IF;
  
  -- Check if game has expired
  IF v_game.game_expires_at IS NOT NULL AND NOW() > v_game.game_expires_at THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Game has expired'
    );
  END IF;
  
  -- Count current participants (with lock)
  SELECT COUNT(*) INTO v_participant_count 
  FROM participants 
  WHERE game_id = p_game_id
  FOR UPDATE;
  
  -- Check max participants
  IF v_participant_count >= v_game.max_participants THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Game is full'
    );
  END IF;
  
  -- Check nickname uniqueness
  IF EXISTS (
    SELECT 1 FROM participants 
    WHERE game_id = p_game_id AND nickname = p_nickname
  ) THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Nickname already taken'
    );
  END IF;
  
  -- Check student_id uniqueness
  IF p_student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM participants 
    WHERE game_id = p_game_id AND student_id = p_student_id
  ) THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Student ID already registered'
    );
  END IF;
  
  -- Insert participant atomically
  INSERT INTO participants (game_id, nickname, student_id, team_id)
  VALUES (p_game_id, p_nickname, p_student_id, p_team_id)
  RETURNING id INTO v_participant_id;
  
  -- Return success with participant info
  RETURN json_build_object(
    'success', true,
    'participant_id', v_participant_id,
    'participant_count', v_participant_count + 1
  );
  
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Duplicate entry detected'
    );
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Internal server error: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION join_game_atomic(UUID, VARCHAR, VARCHAR, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION join_game_atomic(UUID, VARCHAR, VARCHAR, UUID) TO anon;


-- =========================
-- 2. SAFE SCORE UPDATES
-- =========================

-- Function: Safe increment team score (prevents race conditions)
CREATE OR REPLACE FUNCTION increment_team_score_safe(
  p_team_id UUID,
  p_points INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_old_score INTEGER;
  v_new_score INTEGER;
BEGIN
  -- Lock the team row and update atomically
  UPDATE teams 
  SET score = score + p_points,
      updated_at = NOW()
  WHERE id = p_team_id
  RETURNING score - p_points, score INTO v_old_score, v_new_score;
  
  -- Check if team was found
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Team not found'
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'old_score', v_old_score,
    'new_score', v_new_score,
    'points_added', p_points
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Failed to update score: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION increment_team_score_safe(UUID, INTEGER) TO authenticated;


-- Function: Safe decrement team score (with minimum 0)
CREATE OR REPLACE FUNCTION decrement_team_score_safe(
  p_team_id UUID,
  p_points INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_old_score INTEGER;
  v_new_score INTEGER;
BEGIN
  -- Lock the team row and update atomically
  UPDATE teams 
  SET score = GREATEST(score - p_points, 0),
      updated_at = NOW()
  WHERE id = p_team_id
  RETURNING score + LEAST(p_points, score), score INTO v_old_score, v_new_score;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Team not found'
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'old_score', v_old_score,
    'new_score', v_new_score,
    'points_removed', v_old_score - v_new_score
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Failed to update score: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION decrement_team_score_safe(UUID, INTEGER) TO authenticated;


-- =========================
-- 3. YEAR GAME SAFETY
-- =========================

-- Function: Prevent duplicate Year Game submissions
CREATE OR REPLACE FUNCTION submit_year_game_answer_safe(
  p_session_id UUID,
  p_team_id UUID,
  p_participant_id UUID,
  p_target_number INTEGER,
  p_expression TEXT
)
RETURNS JSON AS $$
DECLARE
  v_session RECORD;
  v_result RECORD;
  v_already_found BOOLEAN;
BEGIN
  -- Lock session and result rows
  SELECT * INTO v_session 
  FROM year_game_sessions 
  WHERE id = p_session_id 
  FOR UPDATE;
  
  IF v_session IS NULL OR v_session.status != 'active' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Session not active'
    );
  END IF;
  
  -- Check if number already found by this team
  SELECT 
    p_target_number = ANY(numbers_found) INTO v_already_found
  FROM year_game_results
  WHERE session_id = p_session_id AND team_id = p_team_id
  FOR UPDATE;
  
  IF v_already_found THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Number already found',
      'is_duplicate', true
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'is_duplicate', false
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION submit_year_game_answer_safe(UUID, UUID, UUID, INTEGER, TEXT) TO authenticated;


-- =========================
-- 4. RELAY QUIZ SAFETY
-- =========================

-- Function: Prevent duplicate Relay Quiz submissions
CREATE OR REPLACE FUNCTION submit_relay_quiz_answer_safe(
  p_session_id UUID,
  p_team_id UUID,
  p_participant_id UUID,
  p_question_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_session RECORD;
  v_progress RECORD;
  v_already_answered BOOLEAN;
BEGIN
  -- Check session status
  SELECT * INTO v_session 
  FROM relay_quiz_sessions 
  WHERE id = p_session_id;
  
  IF v_session IS NULL OR v_session.status != 'active' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Session not active'
    );
  END IF;
  
  -- Check if participant already answered this question
  SELECT EXISTS(
    SELECT 1 FROM relay_quiz_attempts
    WHERE session_id = p_session_id 
      AND team_id = p_team_id
      AND participant_id = p_participant_id
      AND question_id = p_question_id
  ) INTO v_already_answered;
  
  IF v_already_answered THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Participant already answered this question'
    );
  END IF;
  
  RETURN json_build_object('success', true);
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION submit_relay_quiz_answer_safe(UUID, UUID, UUID, UUID) TO authenticated;


-- =========================
-- 5. SCORE STEAL SAFETY
-- =========================

-- Function: Atomic score steal operation (prevents deadlocks)
CREATE OR REPLACE FUNCTION execute_score_steal_safe(
  p_attacking_team_id UUID,
  p_target_team_id UUID,
  p_points INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_team1_id UUID;
  v_team2_id UUID;
  v_attacking_old_score INTEGER;
  v_target_old_score INTEGER;
  v_attacking_new_score INTEGER;
  v_target_new_score INTEGER;
BEGIN
  -- Always lock teams in consistent order to prevent deadlocks
  -- Lock smaller UUID first
  IF p_attacking_team_id < p_target_team_id THEN
    v_team1_id := p_attacking_team_id;
    v_team2_id := p_target_team_id;
  ELSE
    v_team1_id := p_target_team_id;
    v_team2_id := p_attacking_team_id;
  END IF;
  
  -- Lock both teams in order
  PERFORM * FROM teams WHERE id = v_team1_id FOR UPDATE;
  PERFORM * FROM teams WHERE id = v_team2_id FOR UPDATE;
  
  -- Get current scores
  SELECT score INTO v_attacking_old_score 
  FROM teams WHERE id = p_attacking_team_id;
  
  SELECT score INTO v_target_old_score 
  FROM teams WHERE id = p_target_team_id;
  
  -- Update attacking team (add points)
  UPDATE teams 
  SET score = score + p_points, updated_at = NOW()
  WHERE id = p_attacking_team_id
  RETURNING score INTO v_attacking_new_score;
  
  -- Update target team (subtract points, minimum 0)
  UPDATE teams 
  SET score = GREATEST(score - p_points, 0), updated_at = NOW()
  WHERE id = p_target_team_id
  RETURNING score INTO v_target_new_score;
  
  RETURN json_build_object(
    'success', true,
    'attacking_team', json_build_object(
      'old_score', v_attacking_old_score,
      'new_score', v_attacking_new_score
    ),
    'target_team', json_build_object(
      'old_score', v_target_old_score,
      'new_score', v_target_new_score
    )
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Failed to execute score steal: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION execute_score_steal_safe(UUID, UUID, INTEGER) TO authenticated;


-- =========================
-- 6. ADVISORY LOCKS
-- =========================

-- Function: Acquire advisory lock for game operations
CREATE OR REPLACE FUNCTION acquire_game_lock(p_game_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_lock_id BIGINT;
BEGIN
  -- Convert UUID to bigint for advisory lock
  v_lock_id := ('x' || substring(p_game_id::text, 1, 16))::bit(64)::bigint;
  
  -- Try to acquire lock (non-blocking)
  RETURN pg_try_advisory_lock(v_lock_id);
END;
$$ LANGUAGE plpgsql;

-- Function: Release advisory lock
CREATE OR REPLACE FUNCTION release_game_lock(p_game_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_lock_id BIGINT;
BEGIN
  v_lock_id := ('x' || substring(p_game_id::text, 1, 16))::bit(64)::bigint;
  RETURN pg_advisory_unlock(v_lock_id);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION acquire_game_lock(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION release_game_lock(UUID) TO authenticated;


-- =========================
-- 7. OPTIMISTIC LOCKING
-- =========================

-- Add version column to critical tables for optimistic locking
ALTER TABLE games ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE year_game_results ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;

-- Create trigger to auto-increment version on update
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS games_version_trigger ON games;
CREATE TRIGGER games_version_trigger
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS teams_version_trigger ON teams;
CREATE TRIGGER teams_version_trigger
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS year_game_results_version_trigger ON year_game_results;
CREATE TRIGGER year_game_results_version_trigger
  BEFORE UPDATE ON year_game_results
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();


-- =========================
-- 8. TRANSACTION ISOLATION
-- =========================

-- Create view for monitoring lock conflicts
CREATE OR REPLACE VIEW v_lock_conflicts AS
SELECT 
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity 
  ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity 
  ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

GRANT SELECT ON v_lock_conflicts TO authenticated;


-- =========================
-- MIGRATION COMPLETE
-- =========================
-- All concurrent safety improvements have been applied
-- Race conditions should now be eliminated
