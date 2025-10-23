# 🚀 빠른 시작 가이드

## 1분 안에 데이터베이스 초기화하기

### 방법 1: Supabase 대시보드 (가장 쉬움)

1. https://app.supabase.com 접속
2. 프로젝트 선택
3. 왼쪽 메뉴 **SQL Editor** 클릭
4. **New Query** 클릭
5. 아래 3개 파일 내용을 **순서대로** 복사해서 실행:

#### Step 1: 테이블 생성
```
파일: 00_fresh_start.sql
내용 전체 복사 → 붙여넣기 → Run 클릭
```

#### Step 2: 함수 생성
```
파일: 01_essential_functions.sql
내용 전체 복사 → 붙여넣기 → Run 클릭
```

#### Step 3: Realtime 활성화
```
파일: 02_enable_realtime.sql
내용 전체 복사 → 붙여넣기 → Run 클릭
```

### 방법 2: Supabase CLI (개발자용)

```bash
# 1. CLI 설치 (없는 경우)
npm install -g supabase

# 2. 로그인
supabase login

# 3. 프로젝트 연결
supabase link --project-ref your-project-ref

# 4. 마이그레이션 실행
supabase db push
```

## ✅ 완료 확인

SQL Editor에서 실행:

```sql
-- 테이블 개수 확인 (16개여야 함)
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- 함수 개수 확인 (10개 이상)
SELECT COUNT(*) FROM information_schema.routines 
WHERE routine_schema = 'public';

-- 카테고리 확인 (5개여야 함)
SELECT * FROM question_categories;
```

## 🎮 다음 단계

### 1. 선수 등록 (CSV)

```sql
SELECT bulk_register_players('[
  {
    "player_name": "홍길동",
    "team_name": "팀A",
    "bracket": "higher",
    "player_number": 1
  },
  {
    "player_name": "김철수",
    "team_name": "팀A",
    "bracket": "higher",
    "player_number": 2
  }
]'::jsonb);
```

### 2. 게임 생성

```sql
INSERT INTO games (
  title, 
  grade_class, 
  duration, 
  team_count, 
  join_code, 
  uses_brackets
) VALUES (
  'TMC 2025',
  '고등부',
  120,
  8,
  generate_two_digit_code(),
  true
);
```

### 3. 문제 업로드

Admin 페이지 (`/admin/questions`)에서:
- Score Steal 문제 업로드
- Relay Quiz P, Q, R, S 세트 업로드

## 🆘 문제 발생 시

### "relation already exists" 에러
→ 이미 테이블이 있습니다. `00_fresh_start.sql`이 기존 테이블을 삭제합니다.

### "permission denied" 에러
→ Service Role Key를 사용하거나 대시보드에서 실행하세요.

### Realtime이 작동하지 않음
→ `02_enable_realtime.sql`을 다시 실행하세요.

## 📞 도움말

더 자세한 내용은 `README.md`를 참고하세요.
