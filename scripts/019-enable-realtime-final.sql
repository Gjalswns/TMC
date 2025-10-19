-- =====================================================
-- 019: Enable Realtime (Final Version)
-- =====================================================
-- Enable Realtime without IF NOT EXISTS
-- =====================================================

-- =========================
-- 1. DROP TABLES FROM PUBLICATION (if exists)
-- =========================

-- This prevents "already exists" errors
DO $$ 
BEGIN
  -- Try to drop, ignore if doesn't exist
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS games;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS teams;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS participants;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS year_game_sessions;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS year_game_results;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS year_game_attempts;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS relay_quiz_sessions;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS relay_quiz_questions;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS relay_quiz_team_progress;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS relay_quiz_attempts;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS score_steal_sessions;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS score_steal_questions;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS score_steal_attempts;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;


-- =========================
-- 2. ADD TABLES TO PUBLICATION
-- =========================

-- Core tables
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;

-- Year Game tables
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_results;
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_attempts;

-- Relay Quiz tables
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_team_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_attempts;

-- Score Steal tables
ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_attempts;


-- =========================
-- 3. VERIFY REALTIME ENABLED
-- =========================

SELECT 
  schemaname,
  tablename
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Expected: 13+ tables listed above

-- Migration complete

