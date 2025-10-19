# 🚀 빠른 시작 가이드 (내일 아침)

## ⚡ 5분 안에 시작하기

### 1️⃣ Supabase 스크립트 실행 (필수)

```bash
# Supabase Dashboard → SQL Editor 열기
```

**복사 & 붙여넣기 & 실행:**

#### A. Score Steal 업데이트
```sql
-- 파일: scripts/022-score-steal-realtime-competition.sql
-- 전체 복사해서 실행
```

#### B. 보안 경고 제거
```sql
-- 파일: scripts/023-remove-security-definer-views.sql
-- 전체 복사해서 실행
```

#### C. Realtime 수정
```sql
-- 파일: scripts/024-fix-realtime-participants.sql
-- 전체 복사해서 실행
```

### 2️⃣ Realtime 활성화 (필수)

**Supabase Dashboard → Database → Replication**

클릭으로 활성화:
- ✅ games
- ✅ teams  
- ✅ participants
- ✅ year_game_sessions
- ✅ year_game_results
- ✅ year_game_attempts
- ✅ score_steal_sessions
- ✅ score_steal_attempts
- ✅ score_steal_questions
- ✅ score_steal_protected_teams
- ✅ relay_quiz_sessions
- ✅ relay_quiz_questions
- ✅ relay_quiz_team_progress
- ✅ relay_quiz_attempts

### 3️⃣ 테스트 (권장)

브라우저 F12 → Console 확인:
```
✅ "Successfully subscribed to participants table"
❌ 오류 메시지 없음
```

게임 생성 버튼 클릭 → 작동 확인

---

## 📋 빠른 체크리스트

- [ ] Supabase 스크립트 3개 실행
- [ ] Realtime 14개 테이블 활성화
- [ ] 게임 생성 테스트
- [ ] 콘솔 오류 확인

**완료 예상 시간**: 15분

---

## 🎯 주요 변경사항

### 1. Year Game 점수 시스템 변경
- 1~9: **10점**
- 10~19: **20점**
- 20~29: **30점**
- ...
- 90~99: **100점**
- 100: **100점**

### 2. Score Steal - 실시간 경쟁 모드
- 🏁 모든 팀이 **같은 문제** 동시에 풀기
- ⚡ 가장 **빠른 정답자**가 승리
- 🎯 승자가 타겟 선택해서 점수 뺏기
- 🛡️ 피해 팀은 다음 라운드 **자동 보호**

### 3. 버그 수정
- ✅ 게임 생성 버튼 작동
- ✅ Year Game 타이머 화면 전환해도 유지
- ✅ Realtime 구독 오류 해결

---

## 📖 자세한 내용

- 전체 작업 목록: `TODO.md`
- Supabase 오류 해결: `SUPABASE_FIXES.md`
- 구현 상세: `IMPLEMENTATION_NOTES.md`
- 타이머 수정: `TIMER_FIX.md`

---

**시작하세요!** 🚀

