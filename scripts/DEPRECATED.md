# ⚠️ DEPRECATED - 이 폴더는 더 이상 사용되지 않습니다

## 새로운 위치

마이그레이션 파일이 새로운 위치로 이동했습니다:

```
supabase/migrations/
├── 00_fresh_start.sql          # 모든 테이블
├── 01_essential_functions.sql  # 모든 함수
├── 02_enable_realtime.sql      # Realtime 설정
├── README.md                   # 상세 가이드
├── QUICK_START.md              # 빠른 시작
└── MIGRATION_GUIDE.md          # 마이그레이션 가이드
```

## 왜 변경했나요?

### 문제점
- 30개 이상의 마이그레이션 파일
- 중복된 내용
- 순서 관리 어려움
- 새로운 개발자가 이해하기 어려움

### 해결책
- 3개의 깔끔한 파일로 통합
- 명확한 구조
- 쉬운 유지보수
- 빠른 초기화

## 이 폴더는 어떻게 하나요?

### 옵션 1: 백업용으로 보관
```bash
# 이름 변경
mv scripts scripts_old_backup
```

### 옵션 2: 삭제
```bash
# 완전히 삭제 (주의!)
rm -rf scripts
```

### 옵션 3: 그냥 두기
- 이 폴더는 더 이상 사용되지 않지만
- 참고용으로 남겨둘 수 있습니다

## 새로운 마이그레이션 사용법

### 빠른 시작
```bash
cd supabase/migrations
# QUICK_START.md 참고
```

### 상세 가이드
```bash
cd supabase/migrations
# README.md 참고
```

### 마이그레이션 가이드
```bash
cd supabase
# MIGRATION_GUIDE.md 참고
```

## 기존 파일 매핑

| 기존 파일 | 새 위치 |
|----------|---------|
| 001-create-tables.sql | 00_fresh_start.sql |
| 004-year-game-tables.sql | 00_fresh_start.sql |
| 005-score-steal-tables.sql | 00_fresh_start.sql |
| 006-relay-quiz-tables.sql | 00_fresh_start.sql |
| 007-add-score-functions.sql | 01_essential_functions.sql |
| 012-centralized-questions.sql | 00_fresh_start.sql + 01_essential_functions.sql |
| 026-participant-preregistration.sql | 00_fresh_start.sql + 01_essential_functions.sql |
| 017-enable-realtime.sql | 02_enable_realtime.sql |
| 기타 모든 파일 | 통합됨 |

## 질문?

`supabase/MIGRATION_GUIDE.md`를 확인하세요!
