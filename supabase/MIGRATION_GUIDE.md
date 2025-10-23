# 🔄 데이터베이스 마이그레이션 가이드

## 현재 상황

기존 `scripts/` 폴더에 30개 이상의 마이그레이션 파일이 있어 복잡했습니다.
이제 `supabase/migrations/` 폴더에 3개의 깔끔한 파일로 정리했습니다.

## 변경 사항

### Before (기존)
```
scripts/
├── 001-create-tables.sql
├── 002-add-timeout-to-games.sql
├── 003-flexible-rounds.sql
├── 004-year-game-tables.sql
├── 005-score-steal-tables.sql
├── 006-relay-quiz-tables.sql
├── 007-add-score-functions.sql
├── ... (30개 이상의 파일)
└── 031-enable-score-steal-realtime.sql
```

### After (새로운)
```
supabase/migrations/
├── 00_fresh_start.sql          # 모든 테이블
├── 01_essential_functions.sql  # 모든 함수
└── 02_enable_realtime.sql      # Realtime 설정
```

## 포함된 기능

### ✅ 유지된 기능
- 게임 생성 및 관리
- 팀 및 참가자 관리
- 사전 등록 선수 시스템
- 2자리 게임 코드
- Higher/Lower 브래킷
- Year Game (Round 1)
- Score Steal (Round 2)
- Relay Quiz (Round 3 & 4)
- 중앙 문제 관리
- Realtime 구독
- RLS 정책
- 모든 인덱스

### ❌ 제거된 것
- 중복된 마이그레이션
- 사용하지 않는 테이블
- 테스트용 샘플 데이터
- 불필요한 함수들

## 마이그레이션 절차

### 🔴 주의: 기존 데이터가 모두 삭제됩니다!

### 1. 백업 (필수!)

```bash
# Supabase CLI로 백업
supabase db dump -f backup_$(date +%Y%m%d).sql

# 또는 대시보드에서
# Database > Backups > Create Backup
```

### 2. 기존 데이터베이스 확인

```sql
-- 현재 테이블 목록
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- 현재 데이터 개수
SELECT 
  (SELECT COUNT(*) FROM games) as games,
  (SELECT COUNT(*) FROM teams) as teams,
  (SELECT COUNT(*) FROM participants) as participants,
  (SELECT COUNT(*) FROM preregistered_players) as players;
```

### 3. 새 마이그레이션 실행

#### 옵션 A: Supabase 대시보드
1. SQL Editor 열기
2. `00_fresh_start.sql` 실행
3. `01_essential_functions.sql` 실행
4. `02_enable_realtime.sql` 실행

#### 옵션 B: Supabase CLI
```bash
cd supabase
supabase db push
```

### 4. 검증

```sql
-- 테이블 개수 (16개)
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- 함수 개수 (10개 이상)
SELECT COUNT(*) FROM information_schema.routines 
WHERE routine_schema = 'public';

-- 카테고리 (5개)
SELECT COUNT(*) FROM question_categories;

-- Realtime 테이블 (12개)
SELECT COUNT(*) FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

## 데이터 복원

### 선수 데이터 복원

백업한 CSV가 있다면:

```sql
SELECT bulk_register_players('[
  {"player_name": "...", "team_name": "...", "bracket": "higher", "player_number": 1},
  ...
]'::jsonb);
```

### 문제 데이터 복원

Admin 페이지 (`/admin/questions`)에서:
1. Score Steal 문제 업로드
2. Relay Quiz P, Q, R, S 세트 업로드

## 롤백 방법

문제가 생기면 백업으로 복원:

```bash
# CLI로 복원
psql -h db.xxx.supabase.co -U postgres -d postgres -f backup_20250124.sql

# 또는 대시보드에서
# Database > Backups > Restore
```

## 테스트 체크리스트

마이그레이션 후 테스트:

- [ ] 게임 생성 가능
- [ ] 선수 등록 가능
- [ ] 게임 참가 가능
- [ ] Year Game 플레이 가능
- [ ] Score Steal 플레이 가능
- [ ] Relay Quiz 플레이 가능
- [ ] 점수 업데이트 정상
- [ ] Realtime 동기화 정상
- [ ] 스코어보드 표시 정상

## FAQ

### Q: 기존 게임 데이터를 유지할 수 있나요?
A: 아니요. 이 마이그레이션은 완전히 새로 시작합니다. 데이터를 유지하려면 수동으로 백업/복원해야 합니다.

### Q: 프로덕션 환경에서 실행해도 되나요?
A: 게임이 진행 중이 아니고 백업이 있다면 가능합니다. 하지만 테스트 환경에서 먼저 시도하세요.

### Q: 얼마나 걸리나요?
A: 보통 1-2분이면 완료됩니다.

### Q: 기존 scripts 폴더는 어떻게 하나요?
A: 백업용으로 남겨두거나 `scripts/old/`로 이동하세요.

## 다음 단계

1. ✅ 마이그레이션 완료
2. 📝 선수 데이터 등록
3. 📸 문제 이미지 업로드
4. 🎮 테스트 게임 실행
5. 🚀 프로덕션 배포

## 지원

문제가 있으면:
1. `QUICK_START.md` 확인
2. `README.md` 확인
3. Supabase 로그 확인
4. GitHub Issues 생성
