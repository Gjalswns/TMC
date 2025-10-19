-- =====================================================
-- 017: Enable Realtime for All Tables
-- =====================================================
-- Enable Supabase Realtime on all game tables
-- =====================================================

-- Enable Realtime replication for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_results;
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_team_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_attempts;

-- Verify
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Migration complete

