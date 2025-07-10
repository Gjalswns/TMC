-- Add total_rounds column to games table
ALTER TABLE games ADD COLUMN total_rounds INTEGER DEFAULT 3;

-- Remove the hardcoded check constraint from current_round
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_current_round_check;
