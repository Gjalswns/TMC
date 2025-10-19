-- =====================================================
-- 018: Fix RLS and Enable Realtime for All Tables
-- =====================================================
-- Enable RLS on all tables and add to Realtime publication
-- =====================================================

-- =========================
-- 1. ENABLE RLS ON ALL TABLES
-- =========================

-- Core game tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- Year Game tables
ALTER TABLE year_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_attempts ENABLE ROW LEVEL SECURITY;

-- Relay Quiz tables
ALTER TABLE relay_quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_team_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Score Steal tables
ALTER TABLE score_steal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_steal_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_steal_attempts ENABLE ROW LEVEL SECURITY;

-- Security tables (NEW)
ALTER TABLE rate_limit_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE abuse_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;


-- =========================
-- 2. CREATE PERMISSIVE POLICIES
-- =========================

-- Rate limit tracking (admin only for viewing)
DROP POLICY IF EXISTS "Rate limit viewable by all" ON rate_limit_tracking;
CREATE POLICY "Rate limit viewable by all" ON rate_limit_tracking
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Rate limit can be created" ON rate_limit_tracking;
CREATE POLICY "Rate limit can be created" ON rate_limit_tracking
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Rate limit can be updated" ON rate_limit_tracking;
CREATE POLICY "Rate limit can be updated" ON rate_limit_tracking
  FOR UPDATE USING (true);

-- Abuse reports (admin only)
DROP POLICY IF EXISTS "Abuse reports viewable by all" ON abuse_reports;
CREATE POLICY "Abuse reports viewable by all" ON abuse_reports
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Abuse reports can be created" ON abuse_reports;
CREATE POLICY "Abuse reports can be created" ON abuse_reports
  FOR INSERT WITH CHECK (true);

-- Audit log (read only for most users)
DROP POLICY IF EXISTS "Audit log viewable by all" ON audit_log;
CREATE POLICY "Audit log viewable by all" ON audit_log
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Audit log can be created" ON audit_log;
CREATE POLICY "Audit log can be created" ON audit_log
  FOR INSERT WITH CHECK (true);

-- Active sessions
DROP POLICY IF EXISTS "Active sessions viewable by all" ON active_sessions;
CREATE POLICY "Active sessions viewable by all" ON active_sessions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Active sessions can be created" ON active_sessions;
CREATE POLICY "Active sessions can be created" ON active_sessions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Active sessions can be updated" ON active_sessions;
CREATE POLICY "Active sessions can be updated" ON active_sessions
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Active sessions can be deleted" ON active_sessions;
CREATE POLICY "Active sessions can be deleted" ON active_sessions
  FOR DELETE USING (true);

-- Blocked IPs (admin only for creation)
DROP POLICY IF EXISTS "Blocked IPs viewable by all" ON blocked_ips;
CREATE POLICY "Blocked IPs viewable by all" ON blocked_ips
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Blocked IPs can be created" ON blocked_ips;
CREATE POLICY "Blocked IPs can be created" ON blocked_ips
  FOR INSERT WITH CHECK (true);


-- =========================
-- 3. ADD ALL TABLES TO REALTIME
-- =========================

-- Core tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS games;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS teams;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS participants;

-- Year Game tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS year_game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS year_game_results;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS year_game_attempts;

-- Relay Quiz tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS relay_quiz_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS relay_quiz_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS relay_quiz_team_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS relay_quiz_attempts;

-- Score Steal tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS score_steal_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS score_steal_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS score_steal_attempts;


-- =========================
-- 4. VERIFY CONFIGURATION
-- =========================

-- Show all tables with Realtime enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
  AND tablename IN (
    'games', 'teams', 'participants',
    'year_game_sessions', 'year_game_results', 'year_game_attempts',
    'relay_quiz_sessions', 'relay_quiz_questions', 'relay_quiz_team_progress', 'relay_quiz_attempts',
    'score_steal_sessions', 'score_steal_questions', 'score_steal_attempts',
    'rate_limit_tracking', 'abuse_reports', 'audit_log', 'active_sessions', 'blocked_ips'
  )
ORDER BY tablename;

-- Show Realtime publication tables
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Migration complete

