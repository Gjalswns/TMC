# Supabase 마이그레이션 적용 가이드

## 실행해야 할 마이그레이션

Supabase 대시보드 → SQL Editor에서 다음 파일들을 순서대로 실행하세요:

### 1. 03_remove_unused_games.sql
**목적**: Relay Quiz와 Score Steal 게임 관련 테이블 및 함수 제거

```sql
-- 릴레이 퀴즈 테이블 삭제
DROP TABLE IF EXISTS relay_quiz_team_progress CASCADE;
DROP TABLE IF EXISTS relay_quiz_attempts CASCADE;
DROP TABLE IF EXISTS relay_quiz_sessions CASCADE;

-- 점수 뺏기 테이블 삭제
DROP TABLE IF EXISTS score_steal_protected_teams CASCADE;
DROP TABLE IF EXISTS score_steal_attempts CASCADE;
DROP TABLE IF EXISTS score_steal_sessions CASCADE;

-- 문제 관리 테이블 삭제
DROP TABLE IF EXISTS game_question_assignments CASCADE;
DROP TABLE IF EXISTS central_questions CASCADE;
DROP TABLE IF EXISTS question_categories CASCADE;

-- 관련 함수 삭제
DROP FUNCTION IF EXISTS get_questions_by_category(TEXT);
DROP FUNCTION IF EXISTS assign_questions_to_game(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS is_team_protected(UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS protect_team(UUID, INTEGER, UUID, INTEGER);
DROP FUNCTION IF EXISTS get_current_question_for_team(UUID, UUID);
```

### 2. 04_add_missing_functions.sql
**목적**: 누락된 헬퍼 함수 추가

```sql
-- 게임 참가 가능 여부 확인 함수
CREATE OR REPLACE FUNCTION is_game_joinable(target_game_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    game_status TEXT;
BEGIN
    SELECT status INTO game_status
    FROM games
    WHERE id = target_game_id;
    
    IF game_status IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN game_status IN ('waiting', 'in_progress', 'started');
END;
$$;

-- 게임 코드로 게임 정보 조회
CREATE OR REPLACE FUNCTION get_game_by_code(game_code TEXT)
RETURNS TABLE (
    id UUID,
    title VARCHAR(255),
    grade_class VARCHAR(100),
    status VARCHAR(20),
    current_round INTEGER,
    team_count INTEGER,
    uses_brackets BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        g.id,
        g.title,
        g.grade_class,
        g.status,
        g.current_round,
        g.team_count,
        g.uses_brackets
    FROM games g
    WHERE g.join_code = game_code
    AND g.status IN ('waiting', 'in_progress', 'started');
END;
$$;
```

## 실행 방법

1. https://supabase.com/dashboard 접속
2. 프로젝트 선택
3. 왼쪽 메뉴에서 "SQL Editor" 클릭
4. "New query" 버튼 클릭
5. 위의 SQL 코드를 복사해서 붙여넣기
6. "Run" 버튼 클릭

## 실행 순서
1. 먼저 `03_remove_unused_games.sql` 실행
2. 그 다음 `04_add_missing_functions.sql` 실행

## 확인 방법

마이그레이션 실행 후 다음 쿼리로 확인:

```sql
-- 남아있는 테이블 확인
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 함수 확인
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION'
ORDER BY routine_name;
```

## 예상 결과

### 남아있어야 할 테이블:
- games
- teams
- preregistered_players
- participants
- year_game_sessions
- year_game_attempts
- year_game_results

### 삭제되어야 할 테이블:
- relay_quiz_* (모든 릴레이 퀴즈 테이블)
- score_steal_* (모든 점수 뺏기 테이블)
- question_categories
- central_questions
- game_question_assignments
