-- Performance Optimizations for Multi-User Scalability
-- This script adds indexes, materialized views, and query optimizations

-- ============================================================================
-- 1. ADD CRITICAL INDEXES FOR FREQUENTLY QUERIED COLUMNS
-- ============================================================================

-- Games table indexes
CREATE INDEX IF NOT EXISTS idx_games_status 
ON games(status) WHERE status IN ('waiting', 'started');

CREATE INDEX IF NOT EXISTS idx_games_code_status 
ON games(game_code, status);

CREATE INDEX IF NOT EXISTS idx_games_created_at 
ON games(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_games_expires_at 
ON games(game_expires_at) WHERE game_expires_at IS NOT NULL;

-- Participants table indexes
CREATE INDEX IF NOT EXISTS idx_participants_game_id 
ON participants(game_id);

CREATE INDEX IF NOT EXISTS idx_participants_team_id 
ON participants(team_id) WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_participants_game_team 
ON participants(game_id, team_id);

CREATE INDEX IF NOT EXISTS idx_participants_joined_at 
ON participants(game_id, joined_at DESC);

-- Teams table indexes
CREATE INDEX IF NOT EXISTS idx_teams_game_id 
ON teams(game_id);

CREATE INDEX IF NOT EXISTS idx_teams_score 
ON teams(game_id, score DESC);

-- Year Game indexes
CREATE INDEX IF NOT EXISTS idx_year_game_sessions_game_status 
ON year_game_sessions(game_id, status);

CREATE INDEX IF NOT EXISTS idx_year_game_sessions_round 
ON year_game_sessions(game_id, round_number);

CREATE INDEX IF NOT EXISTS idx_year_game_attempts_session_team 
ON year_game_attempts(session_id, team_id);

CREATE INDEX IF NOT EXISTS idx_year_game_attempts_submitted 
ON year_game_attempts(session_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_year_game_results_session 
ON year_game_results(session_id);

CREATE INDEX IF NOT EXISTS idx_year_game_results_team 
ON year_game_results(session_id, team_id);

-- Score Steal indexes
CREATE INDEX IF NOT EXISTS idx_score_steal_sessions_game_round 
ON score_steal_sessions(game_id, round_number);

CREATE INDEX IF NOT EXISTS idx_score_steal_sessions_status 
ON score_steal_sessions(game_id, status);

CREATE INDEX IF NOT EXISTS idx_score_steal_questions_game_round 
ON score_steal_questions(game_id, round_number);

CREATE INDEX IF NOT EXISTS idx_score_steal_attempts_game_round 
ON score_steal_attempts(game_id, round_number);

CREATE INDEX IF NOT EXISTS idx_score_steal_attempts_team 
ON score_steal_attempts(game_id, team_id);

-- Relay Quiz indexes
CREATE INDEX IF NOT EXISTS idx_relay_quiz_sessions_game_round 
ON relay_quiz_sessions(game_id, round_number);

CREATE INDEX IF NOT EXISTS idx_relay_quiz_sessions_status 
ON relay_quiz_sessions(game_id, status);

CREATE INDEX IF NOT EXISTS idx_relay_quiz_questions_game_round_order 
ON relay_quiz_questions(game_id, round_number, question_order);

CREATE INDEX IF NOT EXISTS idx_relay_quiz_attempts_session_team 
ON relay_quiz_attempts(session_id, team_id);

CREATE INDEX IF NOT EXISTS idx_relay_quiz_attempts_participant 
ON relay_quiz_attempts(session_id, participant_id);

CREATE INDEX IF NOT EXISTS idx_relay_quiz_progress_session 
ON relay_quiz_team_progress(session_id);

CREATE INDEX IF NOT EXISTS idx_relay_quiz_progress_team 
ON relay_quiz_team_progress(session_id, team_id);

-- ============================================================================
-- 2. CREATE MATERIALIZED VIEW FOR GAME STATISTICS
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_game_statistics AS
SELECT 
  g.id as game_id,
  g.title,
  g.game_code,
  g.status,
  g.current_round,
  g.total_rounds,
  g.created_at,
  g.updated_at,
  COUNT(DISTINCT p.id) as participant_count,
  COUNT(DISTINCT t.id) as team_count,
  COALESCE(SUM(t.score), 0) as total_points,
  MAX(t.score) as highest_team_score,
  MIN(t.score) as lowest_team_score,
  COUNT(DISTINCT p.id) FILTER (WHERE p.team_id IS NOT NULL) as assigned_participants,
  COUNT(DISTINCT p.id) FILTER (WHERE p.team_id IS NULL) as unassigned_participants
FROM games g
LEFT JOIN participants p ON g.id = p.game_id
LEFT JOIN teams t ON g.id = t.game_id
GROUP BY g.id, g.title, g.game_code, g.status, g.current_round, 
         g.total_rounds, g.created_at, g.updated_at;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_game_stats_id 
ON mv_game_statistics(game_id);

CREATE INDEX IF NOT EXISTS idx_mv_game_stats_status 
ON mv_game_statistics(status);

-- Function to refresh game statistics
CREATE OR REPLACE FUNCTION refresh_game_statistics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_game_statistics;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. ADD PARTIAL INDEXES FOR ACTIVE SESSIONS
-- ============================================================================

-- Active year game sessions
CREATE INDEX IF NOT EXISTS idx_year_game_sessions_active 
ON year_game_sessions(game_id, started_at) 
WHERE status = 'active';

-- Active score steal sessions
CREATE INDEX IF NOT EXISTS idx_score_steal_sessions_active 
ON score_steal_sessions(game_id, started_at) 
WHERE status = 'active';

-- Active relay quiz sessions
CREATE INDEX IF NOT EXISTS idx_relay_quiz_sessions_active 
ON relay_quiz_sessions(game_id, started_at) 
WHERE status = 'active';

-- ============================================================================
-- 4. OPTIMIZE GAME LEADERBOARD QUERY
-- ============================================================================

CREATE OR REPLACE VIEW v_game_leaderboard AS
SELECT 
  g.id as game_id,
  g.title as game_title,
  t.id as team_id,
  t.team_name,
  t.team_number,
  t.score,
  COUNT(p.id) as member_count,
  RANK() OVER (PARTITION BY g.id ORDER BY t.score DESC) as rank
FROM games g
JOIN teams t ON g.id = t.game_id
LEFT JOIN participants p ON t.id = p.team_id
GROUP BY g.id, g.title, t.id, t.team_name, t.team_number, t.score
ORDER BY g.id, t.score DESC;

-- ============================================================================
-- 5. OPTIMIZE GAME STATE QUERY WITH SINGLE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_game_state(p_game_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'game', (
      SELECT row_to_json(g)
      FROM games g
      WHERE g.id = p_game_id
    ),
    'teams', (
      SELECT json_agg(row_to_json(t) ORDER BY t.team_number)
      FROM teams t
      WHERE t.game_id = p_game_id
    ),
    'participants', (
      SELECT json_agg(
        json_build_object(
          'id', p.id,
          'nickname', p.nickname,
          'student_id', p.student_id,
          'team_id', p.team_id,
          'joined_at', p.joined_at
        ) ORDER BY p.joined_at
      )
      FROM participants p
      WHERE p.game_id = p_game_id
    ),
    'participant_count', (
      SELECT COUNT(*)
      FROM participants p
      WHERE p.game_id = p_game_id
    ),
    'assigned_count', (
      SELECT COUNT(*)
      FROM participants p
      WHERE p.game_id = p_game_id AND p.team_id IS NOT NULL
    ),
    'year_game_session', (
      SELECT row_to_json(ygs)
      FROM year_game_sessions ygs
      WHERE ygs.game_id = p_game_id AND ygs.status IN ('waiting', 'active')
      ORDER BY ygs.created_at DESC
      LIMIT 1
    ),
    'score_steal_session', (
      SELECT row_to_json(sss)
      FROM score_steal_sessions sss
      WHERE sss.game_id = p_game_id AND sss.status IN ('waiting', 'active')
      ORDER BY sss.created_at DESC
      LIMIT 1
    ),
    'relay_quiz_session', (
      SELECT row_to_json(rqs)
      FROM relay_quiz_sessions rqs
      WHERE rqs.game_id = p_game_id AND rqs.status IN ('waiting', 'active')
      ORDER BY rqs.created_at DESC
      LIMIT 1
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 6. ADD FUNCTION TO GET TEAM PERFORMANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION get_team_performance(p_game_id UUID, p_team_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'team', (
      SELECT row_to_json(t)
      FROM teams t
      WHERE t.id = p_team_id
    ),
    'members', (
      SELECT json_agg(
        json_build_object(
          'id', p.id,
          'nickname', p.nickname,
          'student_id', p.student_id
        )
      )
      FROM participants p
      WHERE p.team_id = p_team_id
    ),
    'year_game_results', (
      SELECT json_agg(
        json_build_object(
          'session_id', ygr.session_id,
          'numbers_found', ygr.numbers_found,
          'total_found', ygr.total_found,
          'score', ygr.score
        )
      )
      FROM year_game_results ygr
      JOIN year_game_sessions ygs ON ygr.session_id = ygs.id
      WHERE ygr.team_id = p_team_id AND ygs.game_id = p_game_id
    ),
    'relay_quiz_progress', (
      SELECT json_agg(
        json_build_object(
          'session_id', rqp.session_id,
          'questions_completed', rqp.questions_completed,
          'total_questions', rqp.total_questions,
          'total_score', rqp.total_score
        )
      )
      FROM relay_quiz_team_progress rqp
      JOIN relay_quiz_sessions rqs ON rqp.session_id = rqs.id
      WHERE rqp.team_id = p_team_id AND rqs.game_id = p_game_id
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 7. ADD QUERY TO GET RECENT ACTIVITY
-- ============================================================================

CREATE OR REPLACE VIEW v_recent_activity AS
SELECT 
  'year_game' as activity_type,
  yga.id as activity_id,
  ygs.game_id,
  yga.team_id,
  yga.participant_id,
  p.nickname as participant_nickname,
  t.team_name,
  yga.target_number,
  yga.is_correct,
  yga.submitted_at as timestamp
FROM year_game_attempts yga
JOIN year_game_sessions ygs ON yga.session_id = ygs.id
JOIN participants p ON yga.participant_id = p.id
JOIN teams t ON yga.team_id = t.id
WHERE yga.submitted_at > NOW() - INTERVAL '5 minutes'

UNION ALL

SELECT 
  'relay_quiz' as activity_type,
  rqa.id as activity_id,
  rqs.game_id,
  rqa.team_id,
  rqa.participant_id,
  p.nickname as participant_nickname,
  t.team_name,
  NULL as target_number,
  rqa.is_correct,
  rqa.submitted_at as timestamp
FROM relay_quiz_attempts rqa
JOIN relay_quiz_sessions rqs ON rqa.session_id = rqs.id
JOIN participants p ON rqa.participant_id = p.id
JOIN teams t ON rqa.team_id = t.id
WHERE rqa.submitted_at > NOW() - INTERVAL '5 minutes'

UNION ALL

SELECT 
  'score_steal' as activity_type,
  ssa.id as activity_id,
  ssa.game_id,
  ssa.team_id,
  NULL as participant_id,
  NULL as participant_nickname,
  t.team_name,
  NULL as target_number,
  ssa.is_correct,
  ssa.submitted_at as timestamp
FROM score_steal_attempts ssa
JOIN teams t ON ssa.team_id = t.id
WHERE ssa.submitted_at > NOW() - INTERVAL '5 minutes'

ORDER BY timestamp DESC;

-- ============================================================================
-- 8. CREATE FUNCTION FOR EFFICIENT BATCH OPERATIONS
-- ============================================================================

-- Function to assign multiple participants to teams
CREATE OR REPLACE FUNCTION assign_participants_batch(
  p_assignments JSONB
)
RETURNS JSON AS $$
DECLARE
  v_assignment JSONB;
  v_success_count INTEGER := 0;
  v_error_count INTEGER := 0;
BEGIN
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    BEGIN
      UPDATE participants
      SET team_id = (v_assignment->>'team_id')::UUID
      WHERE id = (v_assignment->>'participant_id')::UUID;
      
      v_success_count := v_success_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'updated', v_success_count,
    'failed', v_error_count
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. ADD CLEANUP FUNCTION FOR OLD GAMES
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_games(days_to_keep INTEGER DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete games older than specified days and in finished status
  DELETE FROM games
  WHERE status = 'finished' 
    AND created_at < NOW() - INTERVAL '1 day' * days_to_keep
  RETURNING id;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'deleted_games', v_deleted_count
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. ADD VACUUM AND ANALYZE RECOMMENDATIONS
-- ============================================================================

-- Create function to analyze table statistics
CREATE OR REPLACE FUNCTION analyze_table_stats()
RETURNS TABLE(
  table_name TEXT,
  row_count BIGINT,
  total_size TEXT,
  index_size TEXT,
  toast_size TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname || '.' || tablename as table_name,
    n_live_tup as row_count,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size,
    pg_size_pretty(pg_indexes_size(schemaname || '.' || tablename)) as index_size,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename) - 
                   pg_relation_size(schemaname || '.' || tablename) - 
                   pg_indexes_size(schemaname || '.' || tablename)) as toast_size
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON v_game_leaderboard TO authenticated, anon;
GRANT SELECT ON v_recent_activity TO authenticated;
GRANT EXECUTE ON FUNCTION get_game_state(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_team_performance(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION refresh_game_statistics() TO authenticated;
GRANT EXECUTE ON FUNCTION assign_participants_batch(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_games(INTEGER) TO authenticated;

-- ============================================================================
-- 12. CREATE TRIGGER TO AUTO-REFRESH STATS
-- ============================================================================

-- Create function to refresh stats on game update
CREATE OR REPLACE FUNCTION trigger_refresh_game_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Schedule a refresh (non-blocking)
  PERFORM refresh_game_statistics();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger is disabled by default as it can be expensive
-- Enable manually if needed:
-- CREATE TRIGGER after_game_update_refresh_stats
--   AFTER UPDATE ON games
--   FOR EACH STATEMENT
--   EXECUTE FUNCTION trigger_refresh_game_stats();

-- ============================================================================
-- COMPLETION
-- ============================================================================

-- Analyze all tables to update statistics
ANALYZE;

-- Log completion
DO $$ 
BEGIN 
  RAISE NOTICE 'Performance optimizations completed successfully';
  RAISE NOTICE 'Total indexes created: %', (
    SELECT COUNT(*) 
    FROM pg_indexes 
    WHERE schemaname = 'public'
  );
END $$;
