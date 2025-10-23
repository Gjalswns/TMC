# ✅ 데이터베이스 초기화 완료!

## 🎉 무엇이 바뀌었나요?

### Before (기존)
```
scripts/
├── 001-create-tables.sql
├── 002-add-timeout-to-games.sql
├── 003-flexible-rounds.sql
├── ... (30개 이상의 파일)
└── 031-enable-score-steal-realtime.sql
```
❌ 복잡함
❌ 중복된 내용
❌ 관리 어려움

### After (새로운)
```
supabase/migrations/
├── 00_fresh_start.sql          # 모든 테이블 (300줄)
├── 01_essential_functions.sql  # 모든 함수 (250줄)
└── 02_enable_realtime.sql      # Realtime (20줄)
```
✅ 깔끔함
✅ 명확한 구조
✅ 쉬운 관리

## 📁 새로운 파일 구조

```
supabase/
├── migrations/
│   ├── 00_fresh_start.sql          # 테이블 생성
│   ├── 01_essential_functions.sql  # 함수 생성
│   ├── 02_enable_realtime.sql      # Realtime 활성화
│   ├── README.md                   # 상세 문서
│   ├── QUICK_START.md              # 빠른 시작 가이드
│   └── MIGRATION_GUIDE.md          # 마이그레이션 가이드
└── MIGRATION_GUIDE.md              # 이 파일

scripts/
└── DEPRECATED.md                   # 기존 폴더 안내
```

## 🚀 지금 바로 시작하기

### 1분 안에 데이터베이스 초기화

#### 방법 1: Supabase 대시보드 (추천)

1. https://app.supabase.com 접속
2. 프로젝트 선택
3. SQL Editor 열기
4. 아래 파일들을 순서대로 실행:

```
✅ supabase/migrations/00_fresh_start.sql
✅ supabase/migrations/01_essential_functions.sql
✅ supabase/migrations/02_enable_realtime.sql
```

#### 방법 2: Supabase CLI

```bash
cd supabase
supabase db push
```

### 완료 확인

```sql
-- 테이블 개수 (16개)
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- 함수 개수 (10개 이상)
SELECT COUNT(*) FROM information_schema.routines 
WHERE routine_schema = 'public';

-- 카테고리 (5개)
SELECT * FROM question_categories;
```

## 📊 포함된 내용

### 테이블 (16개)
- ✅ `games` - 게임 정보
- ✅ `teams` - 팀 정보
- ✅ `participants` - 참가자
- ✅ `preregistered_players` - 사전 등록 선수
- ✅ `question_categories` - 문제 카테고리
- ✅ `central_questions` - 중앙 문제
- ✅ `game_question_assignments` - 문제 할당
- ✅ `year_game_sessions` - Year Game 세션
- ✅ `year_game_attempts` - Year Game 시도
- ✅ `year_game_results` - Year Game 결과
- ✅ `score_steal_sessions` - Score Steal 세션
- ✅ `score_steal_attempts` - Score Steal 시도
- ✅ `score_steal_protected_teams` - 보호된 팀
- ✅ `relay_quiz_sessions` - Relay Quiz 세션
- ✅ `relay_quiz_attempts` - Relay Quiz 시도
- ✅ `relay_quiz_team_progress` - 팀 진행 상황

### 함수 (10개)
- ✅ `generate_two_digit_code()` - 게임 코드 생성
- ✅ `increment_team_score_safe()` - 점수 증가
- ✅ `bulk_register_players()` - 선수 일괄 등록
- ✅ `get_preregistered_teams()` - 팀 목록 조회
- ✅ `join_game_with_preregistered_player()` - 게임 참가
- ✅ `get_questions_by_category()` - 문제 조회
- ✅ `assign_questions_to_game()` - 문제 할당
- ✅ `update_year_game_result()` - Year Game 결과
- ✅ `is_team_protected()` - 팀 보호 확인
- ✅ `protect_team()` - 팀 보호 설정
- ✅ `get_current_question_for_team()` - 현재 문제

### 기능
- ✅ Row Level Security (RLS)
- ✅ Realtime 구독
- ✅ 인덱스 최적화
- ✅ 외래키 제약조건
- ✅ 자동 타임스탬프

## 🎮 다음 단계

### 1. 선수 등록

```sql
SELECT bulk_register_players('[
  {
    "player_name": "홍길동",
    "team_name": "팀A",
    "bracket": "higher",
    "player_number": 1
  }
]'::jsonb);
```

### 2. 게임 생성

```sql
INSERT INTO games (
  title, grade_class, duration, team_count, 
  join_code, uses_brackets
) VALUES (
  'TMC 2025', '고등부', 120, 8,
  generate_two_digit_code(), true
);
```

### 3. 문제 업로드

Admin 페이지 (`/admin/questions`)에서:
- Score Steal 문제 업로드
- Relay Quiz P, Q, R, S 세트 업로드

### 4. 테스트 게임

1. 게임 생성
2. 참가자 입장
3. 각 라운드 테스트
4. 점수 확인

## 📚 문서

### 빠른 시작
```bash
cat supabase/migrations/QUICK_START.md
```

### 상세 가이드
```bash
cat supabase/migrations/README.md
```

### 마이그레이션 가이드
```bash
cat supabase/MIGRATION_GUIDE.md
```

## ⚠️ 주의사항

### 기존 데이터 삭제
`00_fresh_start.sql`은 **모든 기존 테이블을 삭제**합니다!

### 백업 필수
```bash
# 백업
supabase db dump -f backup.sql

# 복원 (필요시)
psql -h db.xxx.supabase.co -U postgres -d postgres -f backup.sql
```

## 🆘 문제 해결

### "relation already exists" 에러
→ `00_fresh_start.sql`이 기존 테이블을 삭제합니다.

### "permission denied" 에러
→ Service Role Key를 사용하거나 대시보드에서 실행하세요.

### Realtime이 작동하지 않음
→ `02_enable_realtime.sql`을 다시 실행하세요.

## ✨ 개선 사항

### 코드 품질
- 30개 파일 → 3개 파일 (90% 감소)
- 중복 제거
- 명확한 구조
- 쉬운 유지보수

### 성능
- 최적화된 인덱스
- 효율적인 함수
- 빠른 쿼리

### 개발자 경험
- 명확한 문서
- 빠른 시작 가이드
- 쉬운 마이그레이션

## 🎯 결론

이제 깔끔하고 관리하기 쉬운 데이터베이스 구조를 갖게 되었습니다!

### 다음 작업
1. ✅ 데이터베이스 초기화 완료
2. 📝 선수 데이터 등록
3. 📸 문제 이미지 업로드
4. 🎮 테스트 게임 실행
5. 🚀 프로덕션 배포

## 📞 지원

문제가 있으면:
1. `supabase/migrations/QUICK_START.md` 확인
2. `supabase/migrations/README.md` 확인
3. `supabase/MIGRATION_GUIDE.md` 확인
4. GitHub Issues 생성

---

**작성일**: 2025-01-24
**버전**: 1.0.0
**상태**: ✅ 완료
