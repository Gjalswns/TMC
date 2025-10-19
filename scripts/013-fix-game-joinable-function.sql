-- =====================================================
-- 013: Fix is_game_joinable Function
-- =====================================================
-- Fix ambiguous column reference error
-- =====================================================

-- Drop and recreate the function with proper table aliases
DROP FUNCTION IF EXISTS is_game_joinable(UUID);

CREATE OR REPLACE FUNCTION is_game_joinable(p_game_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  game_record RECORD;
  participant_count INTEGER;
BEGIN
  -- Get game information (use alias to avoid ambiguity)
  SELECT * INTO game_record 
  FROM games g 
  WHERE g.id = p_game_id;
  
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
  
  -- Count current participants (use proper column reference)
  SELECT COUNT(*) INTO participant_count 
  FROM participants p
  WHERE p.game_id = p_game_id;
  
  -- Check if max participants reached
  IF participant_count >= game_record.max_participants THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_game_joinable(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_game_joinable(UUID) TO anon;

-- Migration complete

