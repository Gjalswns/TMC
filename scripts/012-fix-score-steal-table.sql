-- =====================================================
-- 012: Fix Score Steal Questions Table
-- =====================================================
-- Add missing round_number column to score_steal_questions
-- =====================================================

-- Add round_number column if it doesn't exist
ALTER TABLE score_steal_questions 
ADD COLUMN IF NOT EXISTS round_number INTEGER NOT NULL DEFAULT 2;

-- Add index for the new column
CREATE INDEX IF NOT EXISTS idx_score_steal_questions_round ON score_steal_questions(round_number);
CREATE INDEX IF NOT EXISTS idx_score_steal_questions_game_round ON score_steal_questions(game_id, round_number);

-- Update existing records to have round_number = 2 (default for Score Steal)
UPDATE score_steal_questions
SET round_number = 2
WHERE round_number IS NULL;

-- Migration complete

