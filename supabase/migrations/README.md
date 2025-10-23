# TMC 데이터베이스 마이그레이션

## 🎯 개요

이 폴더에는 TMC 게임 플랫폼의 깔끔하게 정리된 데이터베이스 스키마가 있습니다.
기존의 복잡한 마이그레이션 파일들을 정리하고 필요한 것만 남겼습니다.

## 📁 파일 구조

```
supabase/migrations/
├── 00_fresh_start.sql          # 모든 테이블 생성
├── 01_essential_functions.sql  # 필수 함수들
├── 02_enable_realtime.sql      # Realtime 활성화
└── README.md                   # 이 파일
```

## 🚀 사용 방법

### 1. Supabase 대시보드에서 실행

1. [Supabase Dashboard](https://app.supabase.com) 접속
2. 프로젝트 선택
3. 왼쪽 메뉴에서 **SQL Editor** 클릭
4. 아래 파일들을 **순서대로** 복사해서 실행:

```sql
-- 1단계: 테이블 생성
-- 00_fresh_start.sql 내용 복사 & 실행

-- 2단계: 함수 생성
-- 01_essential_functions.sql 내용 복사 & 실행

-- 3단계: Realtime 활성화
-- 02_enable_realtime.sql 내용 복사 & 실행
```

### 2. Supabase CLI 사용 (권장)

```bash
# Supabase CLI 설치 (없는 경우)
npm install -g supabase

# 로그인
supabase login

# 프로젝트 연결
supabase link --project-ref your-project-ref

# 마이그레이션 실행
supabase db push
```

## 📊 데이터베이스 구조

### 핵심 테이블

#### 게임 관리
- `games` - 게임 정보
- `teams` - 팀 정보
- `participants` - 참가자 정보
- `preregistered_players` - 사전 등록 선수

#### 문제 관리
- `question_categories` - 문제 카테고리
- `central_questions` - 중앙 문제 저장소
- `game_question_assignments` - 게임별 문제 할당

#### Round 1: Year Game
- `year_game_sessions` - 게임 세션
- `year_game_attempts` - 시도 기록
- `year_game_results` - 결과

#### Round 2: Score Steal
- `score_steal_sessions` - 게임 세션
- `score_steal_attempts` - 시도 기록
- `score_steal_protected_teams` - 보호된 팀

#### Round 3 & 4: Relay Quiz
- `relay_quiz_sessions` - 게임 세션
- `relay_quiz_attempts` - 시도 기록
- `relay_quiz_team_progress` - 팀 진행 상황

### 주요 함수

```sql
-- 게임 코드 생성
generate_two_digit_code()

-- 팀 점수 증가
increment_team_score_safe(team_id, points)

-- 선수 일괄 등록
bulk_register_players(players_json)

-- 게임 참가
join_game_with_preregistered_player(game_code, player_id)

-- 문제 할당
assign_questions_to_game(game_id, score_steal_count, relay_questions_per_set)

-- 카테고리별 문제 조회
get_questions_by_category(category_name)

-- Year Game 결과 업데이트
update_year_game_result(session_id, team_id, number)

-- 팀 보호 확인/설정
is_team_protected(game_id, round_number, team_id)
protect_team(game_id, round_number, team_id, duration_seconds)

-- Relay Quiz 현재 문제
get_current_question_for_team(session_id, team_id)
```

## ⚠️ 주의사항

### 기존 데이터 삭제

`00_fresh_start.sql`은 **모든 기존 테이블을 삭제**합니다!

```sql
DROP TABLE IF EXISTS ... CASCADE;
```

프로덕션 환경에서는 반드시 백업 후 실행하세요.

### 백업 방법

```bash
# Supabase CLI로 백업
supabase db dump -f backup.sql

# 또는 대시보드에서
# Database > Backups > Create Backup
```

## 🔄 마이그레이션 후 확인

### 1. 테이블 확인

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

### 2. 함수 확인

```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public'
ORDER BY routine_name;
```

### 3. Realtime 확인

```sql
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

## 📝 기본 데이터

마이그레이션 후 자동으로 생성되는 데이터:

### 문제 카테고리
- `score_steal` - 점수 뺏기 게임
- `relay_p` - 릴레이 퀴즈 P 세트
- `relay_q` - 릴레이 퀴즈 Q 세트
- `relay_r` - 릴레이 퀴즈 R 세트
- `relay_s` - 릴레이 퀴즈 S 세트

## 🎮 게임 플로우

### 1. 게임 생성
```sql
INSERT INTO games (title, grade_class, duration, team_count, join_code, uses_brackets)
VALUES ('TMC 2025', '고등부', 120, 8, generate_two_digit_code(), true);
```

### 2. 선수 등록
```sql
SELECT bulk_register_players('[
  {"player_name": "홍길동", "team_name": "팀A", "bracket": "higher", "player_number": 1},
  {"player_name": "김철수", "team_name": "팀A", "bracket": "higher", "player_number": 2}
]'::jsonb);
```

### 3. 게임 참가
```sql
SELECT * FROM join_game_with_preregistered_player('42', 'player-uuid');
```

### 4. 문제 할당
```sql
SELECT assign_questions_to_game('game-uuid', 10, 4);
```

## 🛠️ 문제 해결

### 마이그레이션 실패 시

1. 에러 메시지 확인
2. 이전 단계가 성공했는지 확인
3. 테이블/함수 이름 충돌 확인
4. 권한 확인

### Realtime이 작동하지 않을 때

```sql
-- Publication 확인
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 다시 추가
ALTER PUBLICATION supabase_realtime ADD TABLE your_table;
```

## 📚 추가 리소스

- [Supabase 문서](https://supabase.com/docs)
- [PostgreSQL 문서](https://www.postgresql.org/docs/)
- [프로젝트 README](../../README.md)

## ✅ 체크리스트

마이그레이션 완료 후 확인:

- [ ] 모든 테이블 생성됨
- [ ] 모든 함수 생성됨
- [ ] Realtime 활성화됨
- [ ] 기본 카테고리 데이터 존재
- [ ] RLS 정책 활성화됨
- [ ] 인덱스 생성됨

## 🎉 완료!

이제 깔끔하게 정리된 데이터베이스로 TMC 게임을 시작할 수 있습니다!
