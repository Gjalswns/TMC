-- =====================================================
-- 016: Fix join_game_atomic Function
-- =====================================================
-- Fix "FOR UPDATE is not allowed with aggregate functions" error
-- =====================================================

DROP FUNCTION IF EXISTS join_game_atomic(UUID, VARCHAR, VARCHAR, UUID);

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
  -- Start transaction with row-level lock on game
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
  
  -- Count current participants (WITHOUT FOR UPDATE on aggregate)
  SELECT COUNT(*) INTO v_participant_count 
  FROM participants 
  WHERE game_id = p_game_id;
  
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
  -- The game row lock prevents race conditions
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

-- Migration complete

