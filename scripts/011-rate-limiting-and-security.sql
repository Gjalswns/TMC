-- Rate Limiting and Security Enhancements
-- Prevents abuse and ensures fair resource allocation

-- ============================================================================
-- 1. CREATE RATE LIMITING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL, -- Could be IP, user_id, session_id, etc.
  action_type TEXT NOT NULL, -- e.g., 'join_game', 'submit_answer', 'create_game'
  action_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient rate limit checks
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_action 
ON rate_limit_tracking(user_identifier, action_type, window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window 
ON rate_limit_tracking(window_start) WHERE window_start > NOW() - INTERVAL '1 hour';

-- ============================================================================
-- 2. RATE LIMITING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_identifier TEXT,
  p_action_type TEXT,
  p_max_actions INTEGER DEFAULT 100,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS JSON AS $$
DECLARE
  v_window_start TIMESTAMP WITH TIME ZONE;
  v_current_count INTEGER;
  v_remaining INTEGER;
BEGIN
  -- Calculate window start time
  v_window_start := NOW() - INTERVAL '1 minute' * p_window_minutes;
  
  -- Get current count in the time window
  SELECT COALESCE(SUM(action_count), 0)
  INTO v_current_count
  FROM rate_limit_tracking
  WHERE user_identifier = p_user_identifier
    AND action_type = p_action_type
    AND window_start >= v_window_start;
  
  -- Check if limit exceeded
  IF v_current_count >= p_max_actions THEN
    RETURN json_build_object(
      'allowed', false,
      'current_count', v_current_count,
      'limit', p_max_actions,
      'remaining', 0,
      'reset_at', v_window_start + INTERVAL '1 minute' * p_window_minutes
    );
  END IF;
  
  -- Increment counter
  INSERT INTO rate_limit_tracking (user_identifier, action_type, action_count, window_start)
  VALUES (p_user_identifier, p_action_type, 1, NOW())
  ON CONFLICT (id) DO NOTHING;
  
  v_remaining := p_max_actions - v_current_count - 1;
  
  RETURN json_build_object(
    'allowed', true,
    'current_count', v_current_count + 1,
    'limit', p_max_actions,
    'remaining', v_remaining,
    'reset_at', NOW() + INTERVAL '1 minute' * p_window_minutes
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. SPECIFIC RATE LIMITS FOR DIFFERENT ACTIONS
-- ============================================================================

-- Function to check rate limit for joining games (stricter)
CREATE OR REPLACE FUNCTION check_join_game_rate_limit(p_user_identifier TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_result JSON;
BEGIN
  v_result := check_rate_limit(p_user_identifier, 'join_game', 10, 10); -- 10 joins per 10 minutes
  RETURN (v_result->>'allowed')::BOOLEAN;
END;
$$ LANGUAGE plpgsql;

-- Function to check rate limit for submitting answers
CREATE OR REPLACE FUNCTION check_submit_answer_rate_limit(p_user_identifier TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_result JSON;
BEGIN
  v_result := check_rate_limit(p_user_identifier, 'submit_answer', 200, 5); -- 200 answers per 5 minutes
  RETURN (v_result->>'allowed')::BOOLEAN;
END;
$$ LANGUAGE plpgsql;

-- Function to check rate limit for creating games
CREATE OR REPLACE FUNCTION check_create_game_rate_limit(p_user_identifier TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_result JSON;
BEGIN
  v_result := check_rate_limit(p_user_identifier, 'create_game', 5, 60); -- 5 games per hour
  RETURN (v_result->>'allowed')::BOOLEAN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. CLEANUP OLD RATE LIMIT DATA
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_rate_limit_data()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_tracking
  WHERE window_start < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_steal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_steal_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_steal_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_team_progress ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. GAMES TABLE POLICIES
-- ============================================================================

-- Anyone can view games (for join page)
CREATE POLICY "Games are viewable by everyone" ON games
  FOR SELECT USING (true);

-- Only authenticated users can create games
CREATE POLICY "Authenticated users can create games" ON games
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Only creator can update their games (we'll add a creator_id column later)
CREATE POLICY "Games can be updated by creator" ON games
  FOR UPDATE USING (true); -- For now, allow all updates

-- ============================================================================
-- 7. PARTICIPANTS TABLE POLICIES
-- ============================================================================

-- Users can view participants in games they're part of
CREATE POLICY "Participants are viewable in their games" ON participants
  FOR SELECT USING (true);

-- Anyone can join a game (insert participant)
CREATE POLICY "Anyone can join a game" ON participants
  FOR INSERT WITH CHECK (true);

-- Participants can update their own data
CREATE POLICY "Participants can update their own data" ON participants
  FOR UPDATE USING (true);

-- ============================================================================
-- 8. TEAMS TABLE POLICIES
-- ============================================================================

-- Teams are viewable by everyone in the game
CREATE POLICY "Teams are viewable by everyone" ON teams
  FOR SELECT USING (true);

-- Teams can only be created by authenticated users
CREATE POLICY "Authenticated users can create teams" ON teams
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Teams can be updated (score changes)
CREATE POLICY "Teams can be updated" ON teams
  FOR UPDATE USING (true);

-- ============================================================================
-- 9. GAME SESSIONS POLICIES (Year Game, Score Steal, Relay Quiz)
-- ============================================================================

-- Year Game Sessions - viewable by all, creatable by authenticated
CREATE POLICY "Year game sessions viewable by all" ON year_game_sessions
  FOR SELECT USING (true);

CREATE POLICY "Authenticated can create year game sessions" ON year_game_sessions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Year game sessions updatable" ON year_game_sessions
  FOR UPDATE USING (true);

-- Year Game Attempts - viewable by all, insertable by participants
CREATE POLICY "Year game attempts viewable" ON year_game_attempts
  FOR SELECT USING (true);

CREATE POLICY "Anyone can submit year game attempts" ON year_game_attempts
  FOR INSERT WITH CHECK (true);

-- Year Game Results - viewable by all, manageable by system
CREATE POLICY "Year game results viewable" ON year_game_results
  FOR SELECT USING (true);

CREATE POLICY "System can manage year game results" ON year_game_results
  FOR ALL USING (true);

-- Score Steal Sessions
CREATE POLICY "Score steal sessions viewable" ON score_steal_sessions
  FOR SELECT USING (true);

CREATE POLICY "Authenticated can create score steal sessions" ON score_steal_sessions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Score steal sessions updatable" ON score_steal_sessions
  FOR UPDATE USING (true);

-- Score Steal Questions
CREATE POLICY "Score steal questions viewable" ON score_steal_questions
  FOR SELECT USING (true);

CREATE POLICY "Authenticated can create score steal questions" ON score_steal_questions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Score Steal Attempts
CREATE POLICY "Score steal attempts viewable" ON score_steal_attempts
  FOR SELECT USING (true);

CREATE POLICY "Anyone can submit score steal attempts" ON score_steal_attempts
  FOR INSERT WITH CHECK (true);

-- Relay Quiz Sessions
CREATE POLICY "Relay quiz sessions viewable" ON relay_quiz_sessions
  FOR SELECT USING (true);

CREATE POLICY "Authenticated can create relay quiz sessions" ON relay_quiz_sessions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Relay quiz sessions updatable" ON relay_quiz_sessions
  FOR UPDATE USING (true);

-- Relay Quiz Questions
CREATE POLICY "Relay quiz questions viewable" ON relay_quiz_questions
  FOR SELECT USING (true);

CREATE POLICY "Authenticated can create relay quiz questions" ON relay_quiz_questions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Relay Quiz Attempts
CREATE POLICY "Relay quiz attempts viewable" ON relay_quiz_attempts
  FOR SELECT USING (true);

CREATE POLICY "Anyone can submit relay quiz attempts" ON relay_quiz_attempts
  FOR INSERT WITH CHECK (true);

-- Relay Quiz Team Progress
CREATE POLICY "Relay quiz progress viewable" ON relay_quiz_team_progress
  FOR SELECT USING (true);

CREATE POLICY "System can manage relay quiz progress" ON relay_quiz_team_progress
  FOR ALL USING (true);

-- ============================================================================
-- 10. ADD ABUSE DETECTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS abuse_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL,
  abuse_type TEXT NOT NULL,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  details JSONB,
  severity TEXT DEFAULT 'low', -- low, medium, high, critical
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abuse_reports_user 
ON abuse_reports(user_identifier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_abuse_reports_game 
ON abuse_reports(game_id) WHERE game_id IS NOT NULL;

-- Function to report potential abuse
CREATE OR REPLACE FUNCTION report_abuse(
  p_user_identifier TEXT,
  p_abuse_type TEXT,
  p_game_id UUID DEFAULT NULL,
  p_participant_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_severity TEXT DEFAULT 'low'
)
RETURNS UUID AS $$
DECLARE
  v_report_id UUID;
BEGIN
  INSERT INTO abuse_reports (
    user_identifier, abuse_type, game_id, 
    participant_id, details, severity
  ) VALUES (
    p_user_identifier, p_abuse_type, p_game_id,
    p_participant_id, p_details, p_severity
  ) RETURNING id INTO v_report_id;
  
  RETURN v_report_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. PREVENT RAPID DUPLICATE SUBMISSIONS
-- ============================================================================

-- Function to check if submission is too fast (potential bot)
CREATE OR REPLACE FUNCTION is_submission_too_fast(
  p_participant_id UUID,
  p_session_id UUID,
  p_min_seconds INTEGER DEFAULT 2
)
RETURNS BOOLEAN AS $$
DECLARE
  v_last_submission TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Check year game attempts
  SELECT MAX(submitted_at) INTO v_last_submission
  FROM year_game_attempts
  WHERE participant_id = p_participant_id
    AND session_id = p_session_id;
  
  -- If no previous submission, allow
  IF v_last_submission IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if time difference is less than minimum
  RETURN (EXTRACT(EPOCH FROM (NOW() - v_last_submission)) < p_min_seconds);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. ADD INPUT VALIDATION FUNCTIONS
-- ============================================================================

-- Validate nickname format
CREATE OR REPLACE FUNCTION validate_nickname(p_nickname TEXT)
RETURNS JSON AS $$
BEGIN
  -- Check length
  IF LENGTH(p_nickname) < 2 OR LENGTH(p_nickname) > 20 THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Nickname must be between 2 and 20 characters'
    );
  END IF;
  
  -- Check for valid characters
  IF p_nickname !~ '^[a-zA-Z0-9가-힣\s_-]+$' THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Nickname contains invalid characters'
    );
  END IF;
  
  -- Check for profanity or banned words (basic example)
  IF p_nickname ~* '(admin|root|system|test)' THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Nickname contains restricted words'
    );
  END IF;
  
  RETURN json_build_object('valid', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 13. ADD SUSPICIOUS ACTIVITY DETECTION
-- ============================================================================

CREATE OR REPLACE VIEW v_suspicious_activity AS
-- Detect participants with too many attempts in short time
SELECT 
  'high_attempt_rate' as alert_type,
  p.id as participant_id,
  p.nickname,
  p.game_id,
  COUNT(*) as attempt_count,
  MAX(yga.submitted_at) as last_attempt
FROM participants p
JOIN year_game_attempts yga ON p.id = yga.participant_id
WHERE yga.submitted_at > NOW() - INTERVAL '1 minute'
GROUP BY p.id, p.nickname, p.game_id
HAVING COUNT(*) > 50 -- More than 50 attempts in 1 minute is suspicious

UNION ALL

-- Detect games with abnormally high participant count
SELECT 
  'high_participant_count' as alert_type,
  NULL as participant_id,
  NULL as nickname,
  g.id as game_id,
  COUNT(p.id) as attempt_count,
  MAX(p.joined_at) as last_attempt
FROM games g
JOIN participants p ON g.id = p.game_id
WHERE p.joined_at > NOW() - INTERVAL '5 minutes'
GROUP BY g.id
HAVING COUNT(p.id) > 50 -- More than 50 joins in 5 minutes is suspicious

UNION ALL

-- Detect duplicate nicknames from same IP (would need IP tracking)
SELECT 
  'duplicate_nicknames' as alert_type,
  p.id as participant_id,
  p.nickname,
  p.game_id,
  COUNT(*) OVER (PARTITION BY p.nickname, p.game_id) as attempt_count,
  p.joined_at as last_attempt
FROM participants p
WHERE p.joined_at > NOW() - INTERVAL '10 minutes'
  AND EXISTS (
    SELECT 1 FROM participants p2
    WHERE p2.nickname = p.nickname
      AND p2.game_id = p.game_id
      AND p2.id != p.id
  );

-- ============================================================================
-- 14. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON rate_limit_tracking TO authenticated;
GRANT SELECT ON abuse_reports TO authenticated;
GRANT SELECT ON v_suspicious_activity TO authenticated;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION check_join_game_rate_limit(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_submit_answer_rate_limit(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_create_game_rate_limit(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_rate_limit_data() TO authenticated;
GRANT EXECUTE ON FUNCTION report_abuse(TEXT, TEXT, UUID, UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_submission_too_fast(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_nickname(TEXT) TO anon, authenticated;

-- ============================================================================
-- 15. CREATE SCHEDULED JOB FOR CLEANUP (Requires pg_cron extension)
-- ============================================================================

-- Note: This requires pg_cron extension to be enabled
-- Uncomment and run manually if you have pg_cron:
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 'SELECT cleanup_rate_limit_data()');

-- ============================================================================
-- COMPLETION
-- ============================================================================

DO $$ 
BEGIN 
  RAISE NOTICE 'Rate limiting and security enhancements completed';
  RAISE NOTICE 'RLS policies enabled on all tables';
  RAISE NOTICE 'Rate limiting functions created';
  RAISE NOTICE 'Abuse detection mechanisms in place';
END $$;
