# 🗄️ 데이터베이스 초기화 가이드

## 📋 단계별 설정 방법

### 1️⃣ Supabase 프로젝트 생성

1. [Supabase Dashboard](https://supabase.com/dashboard)에 로그인
2. "New Project" 클릭
3. 프로젝트 이름: `TMC Classroom Games`
4. 데이터베이스 비밀번호 설정
5. 지역 선택 (가장 가까운 지역)
6. "Create new project" 클릭

### 2️⃣ 데이터베이스 스키마 생성

1. Supabase Dashboard에서 프로젝트 선택
2. 왼쪽 메뉴에서 **SQL Editor** 클릭
3. **New Query** 클릭
4. `scripts/000-database-init-complete.sql` 파일의 내용을 복사
5. SQL Editor에 붙여넣기
6. **Run** 버튼 클릭

### 3️⃣ 환경 변수 설정

프로젝트 루트에 `.env.local` 파일 생성:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Optional: Service Role Key (for server-side operations)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**값 찾는 방법:**
1. Supabase Dashboard → Settings → API
2. **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
3. **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

### 4️⃣ Realtime 활성화

1. Supabase Dashboard → **Database** → **Replication**
2. 다음 테이블들에 대해 **Enable** 클릭:

```
✅ games
✅ teams  
✅ participants
✅ year_game_sessions
✅ year_game_results
✅ year_game_attempts
✅ score_steal_sessions
✅ score_steal_attempts
✅ score_steal_questions
✅ score_steal_protected_teams
✅ relay_quiz_sessions
✅ relay_quiz_questions
✅ relay_quiz_team_progress
✅ relay_quiz_attempts
```

### 5️⃣ 테스트

1. 개발 서버 재시작:
   ```bash
   # Ctrl+C로 서버 중지 후
   npm run dev
   ```

2. 브라우저에서 `http://localhost:3000/admin` 접속

3. 게임 생성 버튼 클릭하여 테스트

4. 브라우저 F12 → Console에서 오류 확인:
   ```
   ✅ "Successfully subscribed to participants table"
   ❌ 오류 메시지 없음
   ```

## 🔧 문제 해결

### 게임 생성 버튼이 작동하지 않는 경우

1. **환경 변수 확인**: `.env.local` 파일이 올바르게 설정되었는지 확인
2. **Supabase 연결 확인**: 브라우저 콘솔에서 네트워크 오류 확인
3. **데이터베이스 권한 확인**: Supabase Dashboard에서 RLS 정책 확인

### Realtime이 작동하지 않는 경우

1. **Realtime 활성화 확인**: Database → Replication에서 모든 테이블 활성화
2. **브라우저 콘솔 확인**: "Successfully subscribed" 메시지 확인
3. **네트워크 확인**: 방화벽이나 프록시 설정 확인

## 📊 데이터베이스 구조

### 주요 테이블

- **games**: 게임 기본 정보
- **teams**: 팀 정보
- **participants**: 참가자 정보
- **year_game_***: Year Game 관련 테이블들
- **score_steal_***: Score Steal 게임 관련 테이블들
- **relay_quiz_***: Relay Quiz 게임 관련 테이블들

### 주요 함수

- **join_game_atomic()**: 안전한 게임 참가
- **is_game_joinable()**: 게임 참가 가능 여부 확인
- **increment_team_score()**: 팀 점수 증가
- **decrement_team_score()**: 팀 점수 감소

## 🎯 완료 확인

설정이 완료되면 다음이 정상 작동해야 합니다:

- ✅ 게임 생성 버튼 클릭 가능
- ✅ 게임 참가 기능 작동
- ✅ 실시간 업데이트 (Realtime)
- ✅ 모든 게임 타입 (Year Game, Score Steal, Relay Quiz)

---

**문제가 있으면 `QUICK_START.md` 파일을 참고하거나 오류 메시지를 확인해주세요!** 🚀
