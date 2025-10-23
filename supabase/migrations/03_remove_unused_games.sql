-- ============================================================
-- Remove Relay Quiz and Score Steal Game Tables
-- ============================================================
-- 릴레이 퀴즈와 점수 뺏기 게임 관련 테이블 및 함수 제거
-- ============================================================

-- 1. 테이블 삭제 (외래키 의존성 순서대로)
DROP TABLE IF EXISTS relay_quiz_team_progress CASCADE;
DROP TABLE IF EXISTS relay_quiz_attempts CASCADE;
DROP TABLE IF EXISTS relay_quiz_sessions CASCADE;

DROP TABLE IF EXISTS score_steal_protected_teams CASCADE;
DROP TABLE IF EXISTS score_steal_attempts CASCADE;
DROP TABLE IF EXISTS score_steal_sessions CASCADE;

DROP TABLE IF EXISTS game_question_assignments CASCADE;
DROP TABLE IF EXISTS central_questions CASCADE;
DROP TABLE IF EXISTS question_categories CASCADE;

-- 2. 관련 함수 삭제
DROP FUNCTION IF EXISTS get_questions_by_category(TEXT);
DROP FUNCTION IF EXISTS assign_questions_to_game(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS is_team_protected(UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS protect_team(UUID, INTEGER, UUID, INTEGER);
DROP FUNCTION IF EXISTS get_current_question_for_team(UUID, UUID);

-- ============================================================
-- 완료
-- ============================================================

COMMENT ON SCHEMA public IS 'Year Game만 남김 - 릴레이 퀴즈와 점수 뺏기 게임 제거 완료';
