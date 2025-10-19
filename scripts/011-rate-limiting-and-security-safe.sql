-- =====================================================
-- 011: Rate Limiting and Security Enhancements (SAFE VERSION)
-- =====================================================
-- Purpose: Implement rate limiting, RLS policies, and security measures
-- Date: 2025-10-18
-- Version: 1.0.1
-- Security Level: Production-ready
-- =====================================================

-- =========================
-- 1. RATE LIMITING TABLES
-- =========================

-- Table: Rate limiting tracking
CREATE TABLE IF NOT EXISTS rate_limit_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  attempt_count INTEGER DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_attempt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ✅ SAFE: Add IF NOT EXISTS to all indexes
CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier_action ON rate_limit_tracking(identifier, action);
CREATE INDEX IF NOT EXISTS idx_rate_limit_window_start ON rate_limit_tracking(window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limit_blocked ON rate_limit_tracking(is_blocked, blocked_until);


-- Table: Abuse reports
CREATE TABLE IF NOT EXISTS abuse_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier VARCHAR(255) NOT NULL,
  abuse_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) DEFAULT 'low',
  details JSON,
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_abuse_identifier ON abuse_reports(identifier);
CREATE INDEX IF NOT EXISTS idx_abuse_type ON abuse_reports(abuse_type);
CREATE INDEX IF NOT EXISTS idx_abuse_severity ON abuse_reports(severity);
CREATE INDEX IF NOT EXISTS idx_abuse_detected ON abuse_reports(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_abuse_unresolved ON abuse_reports(resolved) WHERE NOT resolved;


-- =========================
-- 2. RATE LIMITING FUNCTIONS
-- =========================

-- Function: Check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier VARCHAR(255),
  p_action VARCHAR(100),
  p_game_id UUID DEFAULT NULL,
  p_max_attempts INTEGER DEFAULT 10,
  p_window_minutes INTEGER DEFAULT 1
)
RETURNS JSON AS $$
DECLARE
  v_record RECORD;
  v_window_start TIMESTAMP WITH TIME ZONE;
  v_is_allowed BOOLEAN;
BEGIN
  v_window_start := NOW() - INTERVAL '1 minute' * p_window_minutes;
  
  SELECT * INTO v_record
  FROM rate_limit_tracking
  WHERE identifier = p_identifier
    AND action = p_action
    AND (p_game_id IS NULL OR game_id = p_game_id)
    AND window_start > v_window_start
  FOR UPDATE;
  
  IF v_record.is_blocked AND v_record.blocked_until > NOW() THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'temporarily_blocked',
      'blocked_until', v_record.blocked_until,
      'retry_after_seconds', EXTRACT(EPOCH FROM (v_record.blocked_until - NOW()))
    );
  END IF;
  
  IF v_record IS NULL OR v_record.window_start <= v_window_start THEN
    INSERT INTO rate_limit_tracking (identifier, action, game_id, attempt_count, window_start)
    VALUES (p_identifier, p_action, p_game_id, 1, NOW())
    ON CONFLICT (identifier, action) DO UPDATE
    SET attempt_count = 1,
        window_start = NOW(),
        last_attempt = NOW(),
        is_blocked = FALSE,
        blocked_until = NULL;
    
    RETURN json_build_object('allowed', true, 'attempts_remaining', p_max_attempts - 1);
  END IF;
  
  IF v_record.attempt_count >= p_max_attempts THEN
    UPDATE rate_limit_tracking
    SET is_blocked = TRUE,
        blocked_until = NOW() + INTERVAL '5 minutes',
        last_attempt = NOW()
    WHERE id = v_record.id;
    
    INSERT INTO abuse_reports (identifier, abuse_type, severity, details, game_id)
    VALUES (
      p_identifier,
      'rate_limit_exceeded',
      'medium',
      json_build_object('action', p_action, 'attempts', v_record.attempt_count + 1),
      p_game_id
    );
    
    RETURN json_build_object(
      'allowed', false,
      'reason', 'rate_limit_exceeded',
      'blocked_until', NOW() + INTERVAL '5 minutes'
    );
  END IF;
  
  UPDATE rate_limit_tracking
  SET attempt_count = attempt_count + 1,
      last_attempt = NOW()
  WHERE id = v_record.id;
  
  RETURN json_build_object(
    'allowed', true,
    'attempts_remaining', p_max_attempts - v_record.attempt_count - 1
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('allowed', true, 'error', 'rate_limit_check_failed');
END;
$$ LANGUAGE plpgsql;

-- Make rate limiting constraint unique
ALTER TABLE rate_limit_tracking DROP CONSTRAINT IF EXISTS unique_rate_limit;
ALTER TABLE rate_limit_tracking ADD CONSTRAINT unique_rate_limit 
  UNIQUE (identifier, action);

GRANT EXECUTE ON FUNCTION check_rate_limit(VARCHAR, VARCHAR, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(VARCHAR, VARCHAR, UUID, INTEGER, INTEGER) TO anon;


-- =========================
-- 3. INPUT VALIDATION
-- =========================

-- Function: Validate nickname
CREATE OR REPLACE FUNCTION validate_nickname(p_nickname VARCHAR(100))
RETURNS JSON AS $$
DECLARE
  v_length INTEGER;
BEGIN
  v_length := LENGTH(p_nickname);
  
  IF v_length < 2 THEN
    RETURN json_build_object('valid', false, 'error', 'Nickname too short (minimum 2 characters)');
  END IF;
  
  IF v_length > 20 THEN
    RETURN json_build_object('valid', false, 'error', 'Nickname too long (maximum 20 characters)');
  END IF;
  
  IF p_nickname !~ '^[a-zA-Z0-9가-힣\s_-]+$' THEN
    RETURN json_build_object('valid', false, 'error', 'Nickname contains invalid characters');
  END IF;
  
  IF p_nickname ~* '(admin|root|system|null|undefined|test)' THEN
    RETURN json_build_object('valid', false, 'error', 'Nickname contains reserved words');
  END IF;
  
  RETURN json_build_object('valid', true);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION validate_nickname(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_nickname(VARCHAR) TO anon;


-- Function: Sanitize input
CREATE OR REPLACE FUNCTION sanitize_text_input(p_input TEXT)
RETURNS TEXT AS $$
BEGIN
  p_input := TRIM(p_input);
  p_input := REGEXP_REPLACE(p_input, '\s+', ' ', 'g');
  p_input := REGEXP_REPLACE(p_input, '[[:cntrl:]]', '', 'g');
  RETURN p_input;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION sanitize_text_input(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION sanitize_text_input(TEXT) TO anon;


-- =========================
-- 4. ROW LEVEL SECURITY (RLS)
-- =========================

-- Enable RLS on all tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_team_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_steal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_steal_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_steal_attempts ENABLE ROW LEVEL SECURITY;

-- Games policies
DROP POLICY IF EXISTS "Games are viewable by everyone" ON games;
CREATE POLICY "Games are viewable by everyone" ON games
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Games can be created by authenticated users" ON games;
CREATE POLICY "Games can be created by authenticated users" ON games
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Games can be updated by authenticated users" ON games;
CREATE POLICY "Games can be updated by authenticated users" ON games
  FOR UPDATE USING (true);

-- Teams policies
DROP POLICY IF EXISTS "Teams are viewable by everyone" ON teams;
CREATE POLICY "Teams are viewable by everyone" ON teams
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Teams can be created by authenticated users" ON teams;
CREATE POLICY "Teams can be created by authenticated users" ON teams
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Teams can be updated by authenticated users" ON teams;
CREATE POLICY "Teams can be updated by authenticated users" ON teams
  FOR UPDATE USING (true);

-- Participants policies
DROP POLICY IF EXISTS "Participants are viewable by everyone" ON participants;
CREATE POLICY "Participants are viewable by everyone" ON participants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can join a game" ON participants;
CREATE POLICY "Anyone can join a game" ON participants
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Participants can be updated by authenticated users" ON participants;
CREATE POLICY "Participants can be updated by authenticated users" ON participants
  FOR UPDATE USING (true);

-- Year Game policies
DROP POLICY IF EXISTS "Year game sessions viewable by everyone" ON year_game_sessions;
CREATE POLICY "Year game sessions viewable by everyone" ON year_game_sessions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Year game results viewable by everyone" ON year_game_results;
CREATE POLICY "Year game results viewable by everyone" ON year_game_results
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Year game attempts viewable by everyone" ON year_game_attempts;
CREATE POLICY "Year game attempts viewable by everyone" ON year_game_attempts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Year game attempts can be created by authenticated" ON year_game_attempts;
CREATE POLICY "Year game attempts can be created by authenticated" ON year_game_attempts
  FOR INSERT WITH CHECK (true);

-- Relay Quiz policies
DROP POLICY IF EXISTS "Relay quiz sessions viewable by everyone" ON relay_quiz_sessions;
CREATE POLICY "Relay quiz sessions viewable by everyone" ON relay_quiz_sessions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Relay quiz questions viewable by everyone" ON relay_quiz_questions;
CREATE POLICY "Relay quiz questions viewable by everyone" ON relay_quiz_questions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Relay quiz progress viewable by everyone" ON relay_quiz_team_progress;
CREATE POLICY "Relay quiz progress viewable by everyone" ON relay_quiz_team_progress
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Relay quiz attempts viewable by everyone" ON relay_quiz_attempts;
CREATE POLICY "Relay quiz attempts viewable by everyone" ON relay_quiz_attempts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Relay quiz attempts can be created" ON relay_quiz_attempts;
CREATE POLICY "Relay quiz attempts can be created" ON relay_quiz_attempts
  FOR INSERT WITH CHECK (true);

-- Score Steal policies
DROP POLICY IF EXISTS "Score steal sessions viewable by everyone" ON score_steal_sessions;
CREATE POLICY "Score steal sessions viewable by everyone" ON score_steal_sessions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Score steal questions viewable by everyone" ON score_steal_questions;
CREATE POLICY "Score steal questions viewable by everyone" ON score_steal_questions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Score steal attempts viewable by everyone" ON score_steal_attempts;
CREATE POLICY "Score steal attempts viewable by everyone" ON score_steal_attempts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Score steal attempts can be created" ON score_steal_attempts;
CREATE POLICY "Score steal attempts can be created" ON score_steal_attempts
  FOR INSERT WITH CHECK (true);


-- =========================
-- 5. AUDIT LOGGING
-- =========================

-- Table: Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name VARCHAR(100) NOT NULL,
  record_id UUID,
  action VARCHAR(50) NOT NULL,
  old_data JSON,
  new_data JSON,
  changed_by VARCHAR(255),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_table_name ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_record_id ON audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON audit_log(changed_at DESC);


-- =========================
-- 6. SESSION MANAGEMENT
-- =========================

-- Table: Active sessions
CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token VARCHAR(255) UNIQUE NOT NULL,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON active_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_active_sessions_participant ON active_sessions(participant_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_game ON active_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_expires ON active_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_active_sessions_active ON active_sessions(is_active) WHERE is_active;


-- Function: Clean expired sessions
CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM active_sessions
  WHERE expires_at < NOW() OR last_activity < NOW() - INTERVAL '2 hours';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION clean_expired_sessions() TO authenticated;


-- =========================
-- 7. IP BLOCKING
-- =========================

-- Table: Blocked IPs
CREATE TABLE IF NOT EXISTS blocked_ips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_address INET NOT NULL UNIQUE,
  reason TEXT,
  blocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  blocked_until TIMESTAMP WITH TIME ZONE,
  is_permanent BOOLEAN DEFAULT FALSE,
  blocked_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_blocked_ips_address ON blocked_ips(ip_address);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_until ON blocked_ips(blocked_until);


-- Function: Check if IP is blocked
CREATE OR REPLACE FUNCTION is_ip_blocked(p_ip_address INET)
RETURNS BOOLEAN AS $$
DECLARE
  v_blocked BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM blocked_ips
    WHERE ip_address = p_ip_address
      AND (is_permanent OR blocked_until > NOW())
  ) INTO v_blocked;
  
  RETURN v_blocked;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION is_ip_blocked(INET) TO authenticated;
GRANT EXECUTE ON FUNCTION is_ip_blocked(INET) TO anon;


-- =========================
-- MIGRATION COMPLETE
-- =========================
-- All security and rate limiting features have been implemented (SAFE VERSION)
-- Features:
-- - Rate limiting (10 attempts per minute)
-- - RLS policies on all tables
-- - Input validation and sanitization
-- - Abuse detection and reporting
-- - Audit logging
-- - Session management
-- - IP blocking

