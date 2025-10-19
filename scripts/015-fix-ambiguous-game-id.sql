-- =====================================================
-- 015: Fix Ambiguous game_id Reference
-- =====================================================
-- Use different variable name to avoid ambiguity
-- =====================================================

-- Fix is_game_joinable function with unambiguous parameter name
DROP FUNCTION IF EXISTS is_game_joinable(UUID);

CREATE OR REPLACE FUNCTION is_game_joinable(target_game_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  game_record RECORD;
  participant_count INTEGER;
BEGIN
  -- Get game information
  SELECT * INTO game_record 
  FROM games 
  WHERE id = target_game_id;
  
  -- Check if game exists
  IF game_record IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if game is in waiting status
  IF game_record.status != 'waiting' THEN
    RETURN FALSE;
  END IF;
  
  -- Check if game has expired
  IF game_record.game_expires_at IS NOT NULL AND NOW() > game_record.game_expires_at THEN
    RETURN FALSE;
  END IF;
  
  -- Check if join deadline has passed
  IF game_record.join_deadline_minutes IS NOT NULL THEN
    IF NOW() > (game_record.created_at + INTERVAL '1 minute' * game_record.join_deadline_minutes) THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  -- Count current participants
  SELECT COUNT(*) INTO participant_count 
  FROM participants
  WHERE game_id = target_game_id;
  
  -- Check if max participants reached
  IF participant_count >= game_record.max_participants THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION is_game_joinable(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_game_joinable(UUID) TO anon;


-- Fix validate_participant_join function
DROP FUNCTION IF EXISTS validate_participant_join(UUID, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION validate_participant_join(
  target_game_id UUID,
  player_nickname VARCHAR(100),
  player_student_id VARCHAR(50) DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  game_record RECORD;
  participant_count INTEGER;
BEGIN
  -- Get game information
  SELECT * INTO game_record 
  FROM games 
  WHERE id = target_game_id;
  
  -- Check if game exists
  IF game_record IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Game not found');
  END IF;
  
  -- Check if game is joinable
  IF NOT is_game_joinable(target_game_id) THEN
    RETURN json_build_object('valid', false, 'error', 'Game is not available for joining');
  END IF;
  
  -- Check nickname uniqueness
  IF EXISTS (
    SELECT 1 FROM participants 
    WHERE game_id = target_game_id 
    AND nickname = player_nickname
  ) THEN
    RETURN json_build_object('valid', false, 'error', 'Nickname already taken in this game');
  END IF;
  
  -- Check student_id uniqueness (if provided)
  IF player_student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM participants 
    WHERE game_id = target_game_id 
    AND student_id = player_student_id
  ) THEN
    RETURN json_build_object('valid', false, 'error', 'Student ID already registered in this game');
  END IF;
  
  -- Count current participants
  SELECT COUNT(*) INTO participant_count 
  FROM participants
  WHERE game_id = target_game_id;
  
  -- Check if max participants reached
  IF participant_count >= game_record.max_participants THEN
    RETURN json_build_object('valid', false, 'error', 'Game is full');
  END IF;
  
  RETURN json_build_object('valid', true, 'participant_count', participant_count);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION validate_participant_join(UUID, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_participant_join(UUID, VARCHAR, VARCHAR) TO anon;

-- Migration complete

