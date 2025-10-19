-- =====================================================
-- 024: Fix Realtime for Participants Table
-- =====================================================
-- Ensure participants table is properly configured for Realtime
-- =====================================================

-- 1. Ensure RLS is enabled
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to recreate them
DROP POLICY IF EXISTS "Participants are viewable by everyone" ON participants;
DROP POLICY IF EXISTS "Participants can be created by anyone" ON participants;
DROP POLICY IF EXISTS "Participants can be updated by anyone" ON participants;
DROP POLICY IF EXISTS "Allow all operations on participants" ON participants;

-- 3. Create permissive policies (allow all for classroom game)
CREATE POLICY "Allow all operations on participants" 
ON participants 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 4. Add to realtime publication (if not already added)
-- Note: This might fail if already in publication, which is fine
DO $$ 
BEGIN
    -- Try to add participants to supabase_realtime publication
    ALTER PUBLICATION supabase_realtime ADD TABLE participants;
    RAISE NOTICE 'Added participants to realtime publication';
EXCEPTION 
    WHEN duplicate_object THEN
        RAISE NOTICE 'participants already in realtime publication';
    WHEN undefined_object THEN
        RAISE NOTICE 'supabase_realtime publication does not exist - will be created automatically';
END $$;

-- 5. Grant necessary permissions
GRANT ALL ON participants TO authenticated;
GRANT ALL ON participants TO anon;

-- 6. Ensure the table has REPLICA IDENTITY
-- This is required for realtime updates
ALTER TABLE participants REPLICA IDENTITY FULL;

-- 7. Verify realtime is enabled for the table
-- You can check this in Supabase Dashboard > Database > Replication

-- =====================================================
-- Apply same fixes to all game tables
-- =====================================================

-- Teams table
ALTER TABLE teams REPLICA IDENTITY FULL;
DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE teams;
EXCEPTION 
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

-- Games table
ALTER TABLE games REPLICA IDENTITY FULL;
DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE games;
EXCEPTION 
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

-- Year Game tables
ALTER TABLE year_game_sessions REPLICA IDENTITY FULL;
ALTER TABLE year_game_results REPLICA IDENTITY FULL;
ALTER TABLE year_game_attempts REPLICA IDENTITY FULL;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE year_game_sessions;
    ALTER PUBLICATION supabase_realtime ADD TABLE year_game_results;
    ALTER PUBLICATION supabase_realtime ADD TABLE year_game_attempts;
EXCEPTION 
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

-- Score Steal tables
ALTER TABLE score_steal_sessions REPLICA IDENTITY FULL;
ALTER TABLE score_steal_attempts REPLICA IDENTITY FULL;
ALTER TABLE score_steal_questions REPLICA IDENTITY FULL;
ALTER TABLE score_steal_protected_teams REPLICA IDENTITY FULL;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_sessions;
    ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_attempts;
    ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_questions;
    ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_protected_teams;
EXCEPTION 
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

-- Relay Quiz tables
ALTER TABLE relay_quiz_sessions REPLICA IDENTITY FULL;
ALTER TABLE relay_quiz_questions REPLICA IDENTITY FULL;
ALTER TABLE relay_quiz_team_progress REPLICA IDENTITY FULL;
ALTER TABLE relay_quiz_attempts REPLICA IDENTITY FULL;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_sessions;
    ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_questions;
    ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_team_progress;
    ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_attempts;
EXCEPTION 
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

-- =====================================================
-- Verification
-- =====================================================
-- Check which tables are in the realtime publication:
-- SELECT schemaname, tablename 
-- FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime';

-- =====================================================
-- Migration Complete
-- =====================================================

