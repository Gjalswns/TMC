-- Improve participant logic and add constraints (SAFE VERSION)
-- This version cleans up duplicates before adding constraints

-- ============================================
-- STEP 1: Clean up duplicate nicknames
-- ============================================

-- Remove duplicate nicknames (keep oldest entry)
DELETE FROM participants a
USING participants b
WHERE a.id > b.id 
  AND a.game_id = b.game_id 
  AND a.nickname = b.nickname;

-- Remove duplicate student_ids (keep oldest entry)
DELETE FROM participants a
USING participants b
WHERE a.id > b.id 
  AND a.game_id = b.game_id 
  AND a.student_id = b.student_id
  AND a.student_id IS NOT NULL;

-- ============================================
-- STEP 2: Add unique constraints
-- ============================================

-- Add unique constraint for nickname per game
ALTER TABLE participants 
DROP CONSTRAINT IF EXISTS unique_nickname_per_game;

ALTER TABLE participants 
ADD CONSTRAINT unique_nickname_per_game 
UNIQUE (game_id, nickname);

-- Add unique constraint for student_id per game (if provided)
ALTER TABLE participants 
DROP CONSTRAINT IF EXISTS unique_student_id_per_game;

ALTER TABLE participants 
ADD CONSTRAINT unique_student_id_per_game 
UNIQUE (game_id, student_id);

-- ============================================
-- STEP 3: Add check constraints
-- ============================================

-- Add check constraint for nickname length and format
ALTER TABLE participants 
DROP CONSTRAINT IF EXISTS check_nickname_format;

ALTER TABLE participants 
ADD CONSTRAINT check_nickname_format 
CHECK (
  LENGTH(nickname) >= 2 AND 
  LENGTH(nickname) <= 20 AND 
  nickname ~ '^[a-zA-Z0-9가-힣\s_-]+$'
);

-- Add check constraint for student_id format (if provided)
ALTER TABLE participants 
DROP CONSTRAINT IF EXISTS check_student_id_format;

ALTER TABLE participants 
ADD CONSTRAINT check_student_id_format 
CHECK (
  student_id IS NULL OR 
  (LENGTH(student_id) >= 3 AND LENGTH(student_id) <= 20)
);

-- ============================================
-- STEP 4: Add game table columns
-- ============================================

-- Add max_participants column to games table
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT 20;

-- Add check constraint for max_participants
ALTER TABLE games 
DROP CONSTRAINT IF EXISTS check_max_participants;

ALTER TABLE games 
ADD CONSTRAINT check_max_participants 
CHECK (max_participants > 0 AND max_participants <= 100);

-- Add game_expires_at column to games table
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS game_expires_at TIMESTAMP WITH TIME ZONE;

-- Add join_deadline_minutes column to games table
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS join_deadline_minutes INTEGER DEFAULT 30;

-- ============================================
-- STEP 5: Create functions
-- ============================================

-- Create function to check if game is joinable
CREATE OR REPLACE FUNCTION is_game_joinable(game_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  game_record RECORD;
  participant_count INTEGER;
BEGIN
  -- Get game information
  SELECT * INTO game_record FROM games WHERE id = game_id;
  
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
  WHERE participants.game_id = game_id;
  
  -- Check if max participants reached
  IF participant_count >= game_record.max_participants THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate participant join
CREATE OR REPLACE FUNCTION validate_participant_join(
  p_game_id UUID,
  p_nickname VARCHAR(100),
  p_student_id VARCHAR(50) DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  game_record RECORD;
  participant_count INTEGER;
  result JSON;
BEGIN
  -- Get game information
  SELECT * INTO game_record FROM games WHERE id = p_game_id;
  
  -- Check if game exists
  IF game_record IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Game not found');
  END IF;
  
  -- Check if game is joinable
  IF NOT is_game_joinable(p_game_id) THEN
    RETURN json_build_object('valid', false, 'error', 'Game is not available for joining');
  END IF;
  
  -- Check nickname uniqueness
  IF EXISTS (SELECT 1 FROM participants WHERE game_id = p_game_id AND nickname = p_nickname) THEN
    RETURN json_build_object('valid', false, 'error', 'Nickname already taken in this game');
  END IF;
  
  -- Check student_id uniqueness (if provided)
  IF p_student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM participants 
    WHERE game_id = p_game_id AND student_id = p_student_id
  ) THEN
    RETURN json_build_object('valid', false, 'error', 'Student ID already registered in this game');
  END IF;
  
  -- Count current participants
  SELECT COUNT(*) INTO participant_count 
  FROM participants 
  WHERE participants.game_id = p_game_id;
  
  -- Check if max participants reached
  IF participant_count >= game_record.max_participants THEN
    RETURN json_build_object('valid', false, 'error', 'Game is full');
  END IF;
  
  RETURN json_build_object('valid', true, 'participant_count', participant_count);
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_game_joinable(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_game_joinable(UUID) TO anon;
GRANT EXECUTE ON FUNCTION validate_participant_join(UUID, VARCHAR(100), VARCHAR(50)) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_participant_join(UUID, VARCHAR(100), VARCHAR(50)) TO anon;

-- ============================================
-- DONE! Migration 008 completed safely
-- ============================================

