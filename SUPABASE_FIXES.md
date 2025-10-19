# Supabase 오류 해결 가이드

## 발생한 오류들

### 1. ❌ SECURITY DEFINER View 경고
```
View public.v_lock_conflicts is defined with the SECURITY DEFINER property
```

### 2. ❌ Realtime 구독 실패
```
Failed to subscribe to participants table
```

---

## 해결 방법

### 단계 1: Supabase 대시보드 접속

1. [Supabase Dashboard](https://app.supabase.com) 접속
2. 프로젝트 선택
3. 좌측 메뉴에서 **SQL Editor** 클릭

---

### 단계 2: SECURITY DEFINER 문제 해결

**스크립트 실행**: `scripts/023-remove-security-definer-views.sql`

```sql
-- Supabase SQL Editor에서 다음 파일의 내용을 복사하여 실행:
scripts/023-remove-security-definer-views.sql
```

**결과 확인**:
```sql
-- SECURITY DEFINER가 남아있는 뷰 확인
SELECT 
  viewname, 
  definition 
FROM pg_views 
WHERE schemaname = 'public' 
  AND definition LIKE '%SECURITY DEFINER%';
-- 결과가 없으면 성공!
```

---

### 단계 3: Realtime 문제 해결

**3-1. 스크립트 실행**

`scripts/024-fix-realtime-participants.sql` 파일 내용을 SQL Editor에서 실행

**3-2. Supabase Dashboard에서 Realtime 활성화**

1. **Database** → **Replication** 메뉴로 이동
2. 다음 테이블들의 Realtime을 **활성화**:

#### 필수 테이블:
- ✅ `games`
- ✅ `teams`
- ✅ `participants`

#### Year Game:
- ✅ `year_game_sessions`
- ✅ `year_game_results`
- ✅ `year_game_attempts`

#### Score Steal:
- ✅ `score_steal_sessions`
- ✅ `score_steal_attempts`
- ✅ `score_steal_questions`
- ✅ `score_steal_protected_teams`

#### Relay Quiz:
- ✅ `relay_quiz_sessions`
- ✅ `relay_quiz_questions`
- ✅ `relay_quiz_team_progress`
- ✅ `relay_quiz_attempts`

**3-3. Realtime 활성화 확인**

SQL Editor에서 다음 쿼리 실행:
```sql
-- Realtime이 활성화된 테이블 확인
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```

---

### 단계 4: 점수 뺏기 게임 마이그레이션 (아직 안했다면)

`scripts/022-score-steal-realtime-competition.sql` 파일을 SQL Editor에서 실행

---

## 테스트

### 1. 브라우저 콘솔 확인 (F12)

오류 메시지가 사라졌는지 확인:
- ❌ ~~"Failed to subscribe to participants table"~~ → 사라짐
- ✅ "Successfully subscribed to participants table" → 표시됨

### 2. 게임 생성 테스트

1. Admin 페이지에서 게임 생성
2. 콘솔에서 다음 로그 확인:
   ```
   🎮 Button clicked, form state: ...
   🎮 Form submit event triggered
   🎮 Creating game with values: ...
   🎮 Game creation result: { success: true, gameId: "...", gameCode: "..." }
   ```

### 3. Realtime 테스트

1. 게임 생성 후 참가 코드로 다른 브라우저/탭에서 접속
2. 참가자가 추가되면 Admin 페이지에서 실시간으로 표시되는지 확인

---

## 문제 해결 (Troubleshooting)

### 여전히 Realtime 오류가 발생하는 경우

#### 방법 1: RLS 정책 재설정
```sql
-- 모든 테이블에 대해 실행
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on participants" ON participants;
CREATE POLICY "Allow all operations on participants" 
ON participants 
FOR ALL 
USING (true) 
WITH CHECK (true);
```

#### 방법 2: Supabase API Key 확인
`.env.local` 파일 확인:
```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

#### 방법 3: 브라우저 캐시 클리어
1. Chrome/Edge: Ctrl + Shift + Delete
2. "캐시된 이미지 및 파일" 선택
3. "데이터 삭제" 클릭
4. 페이지 새로고침 (Ctrl + F5)

#### 방법 4: Realtime 연결 상태 확인
브라우저 콘솔에서:
```javascript
// Supabase Realtime 연결 상태 확인
console.log(supabase.realtime.channels)
```

---

## 추가 정보

### Realtime이 작동하지 않을 때 Fallback

코드에 폴링(polling) 메커니즘이 구현되어 있어 Realtime이 실패해도 자동으로 폴링으로 전환됩니다:
- Admin 페이지: 2초마다 업데이트
- Player 페이지: 1초마다 업데이트

### SECURITY DEFINER란?

- PostgreSQL의 함수/뷰 실행 권한 설정
- `SECURITY DEFINER`: 함수 생성자의 권한으로 실행
- `SECURITY INVOKER`: 호출자의 권한으로 실행 (권장)
- Supabase는 보안상 `SECURITY DEFINER` 사용을 권장하지 않음

---

## 도움이 필요한 경우

1. **Supabase 로그 확인**: Dashboard → Logs
2. **브라우저 콘솔 로그 확인**: F12 → Console 탭
3. **Network 탭 확인**: WebSocket 연결 상태 확인

---

## 체크리스트

실행한 스크립트에 체크:
- [ ] `scripts/022-score-steal-realtime-competition.sql`
- [ ] `scripts/023-remove-security-definer-views.sql`
- [ ] `scripts/024-fix-realtime-participants.sql`

Realtime 활성화한 테이블:
- [ ] participants, games, teams
- [ ] year_game_* (3개 테이블)
- [ ] score_steal_* (4개 테이블)
- [ ] relay_quiz_* (4개 테이블)

테스트 완료:
- [ ] 게임 생성 버튼 작동
- [ ] Realtime 구독 오류 사라짐
- [ ] SECURITY DEFINER 경고 사라짐

