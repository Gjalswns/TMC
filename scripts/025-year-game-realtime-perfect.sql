-- =====================================================
-- 025: Year Game Realtime Perfect Setup
-- =====================================================
-- Year Game 실시간 통신을 완벽하게 설정
-- =====================================================

-- =========================
-- 1. DROP AND RE-ADD TO PUBLICATION (Clean slate)
-- =========================

-- Remove if exists (ignore errors)
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS year_game_sessions;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS year_game_results;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS year_game_attempts;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add tables to publication
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_results;
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_attempts;

-- =========================
-- 2. VERIFY RLS POLICIES
-- =========================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all operations on year_game_sessions" ON year_game_sessions;
DROP POLICY IF EXISTS "Allow all operations on year_game_results" ON year_game_results;
DROP POLICY IF EXISTS "Allow all operations on year_game_attempts" ON year_game_attempts;

-- Recreate permissive policies
CREATE POLICY "Allow all operations on year_game_sessions" 
ON year_game_sessions FOR ALL 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on year_game_results" 
ON year_game_results FOR ALL 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on year_game_attempts" 
ON year_game_attempts FOR ALL 
USING (true)
WITH CHECK (true);

-- =========================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- =========================

-- Drop existing indexes if they exist
DROP INDEX IF EXISTS idx_year_game_sessions_game_status;
DROP INDEX IF EXISTS idx_year_game_results_session_team;
DROP INDEX IF EXISTS idx_year_game_results_updated_at;
DROP INDEX IF EXISTS idx_year_game_attempts_session_team;
DROP INDEX IF EXISTS idx_year_game_attempts_submitted_at;

-- Create optimized indexes
CREATE INDEX idx_year_game_sessions_game_status 
ON year_game_sessions(game_id, status, round_number);

CREATE INDEX idx_year_game_results_session_team 
ON year_game_results(session_id, team_id);

CREATE INDEX idx_year_game_results_updated_at 
ON year_game_results(updated_at DESC);

CREATE INDEX idx_year_game_attempts_session_team 
ON year_game_attempts(session_id, team_id, submitted_at DESC);

CREATE INDEX idx_year_game_attempts_submitted_at 
ON year_game_attempts(submitted_at DESC);

-- =========================
-- 4. CREATE TRIGGER FOR AUTO-UPDATE TIMESTAMPS
-- =========================

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS year_game_results_updated_at ON year_game_results;
DROP FUNCTION IF EXISTS update_year_game_results_updated_at();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_year_game_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER year_game_results_updated_at
BEFORE UPDATE ON year_game_results
FOR EACH ROW
EXECUTE FUNCTION update_year_game_results_updated_at();

-- =========================
-- 5. VERIFY SETUP
-- =========================

-- Check if tables are in publication
SELECT tablename, schemaname
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename IN ('year_game_sessions', 'year_game_results', 'year_game_attempts')
ORDER BY tablename;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('year_game_sessions', 'year_game_results', 'year_game_attempts');

-- Check policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('year_game_sessions', 'year_game_results', 'year_game_attempts')
ORDER BY tablename, policyname;

-- Check indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('year_game_sessions', 'year_game_results', 'year_game_attempts')
ORDER BY tablename, indexname;

-- Migration complete
-- ✅ Year Game Realtime is now perfectly configured!

