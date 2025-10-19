-- =====================================================
-- 020: Enable Realtime (Simplest Version)
-- =====================================================
-- Just add tables to Realtime publication
-- Ignore "already exists" errors
-- =====================================================

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

-- Verify all tables are in publication
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Migration complete
-- NOTE: If you get "relation already exists in publication" errors, that's OK!
-- It means Realtime is already enabled for those tables.

