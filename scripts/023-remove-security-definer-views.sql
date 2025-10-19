-- =====================================================
-- 023: Remove SECURITY DEFINER from Views
-- =====================================================
-- This script removes SECURITY DEFINER from all views
-- to address Supabase security warnings
-- =====================================================

-- Drop and recreate v_lock_conflicts without SECURITY DEFINER
DROP VIEW IF EXISTS v_lock_conflicts CASCADE;

CREATE OR REPLACE VIEW v_lock_conflicts AS
SELECT 
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity 
  ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity 
  ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- Grant read-only access to authenticated users
GRANT SELECT ON v_lock_conflicts TO authenticated;

-- Drop and recreate v_suspicious_activity without SECURITY DEFINER
DROP VIEW IF EXISTS v_suspicious_activity CASCADE;

CREATE OR REPLACE VIEW v_suspicious_activity AS
SELECT 
  'multiple_games' AS activity_type,
  identifier,
  COUNT(DISTINCT game_id) AS game_count,
  MAX(last_attempt) AS last_activity,
  'high' AS severity
FROM rate_limit_tracking
WHERE window_start > NOW() - INTERVAL '1 hour'
GROUP BY identifier
HAVING COUNT(DISTINCT game_id) > 5

UNION ALL

SELECT 
  'excessive_attempts' AS activity_type,
  identifier,
  SUM(attempt_count) AS attempt_count,
  MAX(last_attempt) AS last_activity,
  'medium' AS severity
FROM rate_limit_tracking
WHERE window_start > NOW() - INTERVAL '1 hour'
GROUP BY identifier
HAVING SUM(attempt_count) > 50

UNION ALL

SELECT 
  'blocked_user' AS activity_type,
  identifier,
  COUNT(*) AS block_count,
  MAX(blocked_until) AS last_activity,
  'high' AS severity
FROM rate_limit_tracking
WHERE is_blocked
GROUP BY identifier

ORDER BY severity DESC, last_activity DESC;

-- Grant read-only access (admin/monitoring only)
GRANT SELECT ON v_suspicious_activity TO authenticated;

-- =====================================================
-- Verification Query
-- =====================================================
-- Run this to verify no SECURITY DEFINER views remain:
-- SELECT 
--   viewname, 
--   definition 
-- FROM pg_views 
-- WHERE schemaname = 'public' 
--   AND definition LIKE '%SECURITY DEFINER%';

-- =====================================================
-- Migration Complete
-- =====================================================

