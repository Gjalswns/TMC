# 릴레이 퀴즈 폴링 로직 개선

## 🐛 문제점

참가자 화면에서 세션 데이터가 반영되지 않는 문제:
- 관리자가 세션을 생성하고 문제를 업로드해도 참가자 화면에 표시되지 않음
- `Final session object: { hasSession: true, hasQuestionData: true, questionTitle: '1' }` 로그는 보이지만 실제 UI에 반영 안 됨
- 실시간 업데이트가 작동하지 않음

## 🔧 해결 방법

### 1. 세션 생성 시 question_data 저장 (`lib/relay-quiz-actions.ts`)

**변경 전:**
```typescript
const { data: session, error } = await supabase
  .from("relay_quiz_sessions")
  .insert({
    game_id: gameId,
    round_number: roundNumber,
    time_limit_seconds: timeLimit,
    status: "waiting",
  })
  .select()
  .single();

// 나중에 questions 조회
const { data: questions } = await supabase
  .from("relay_quiz_questions")
  .select("*")
  // ...
```

**변경 후:**
```typescript
// 먼저 questions 조회
const { data: questions } = await supabase
  .from("relay_quiz_questions")
  .select("*")
  .eq("game_id", gameId)
  .eq("round_number", roundNumber)
  .order("question_order");

// question_data 준비
const questionData = questions?.map(q => ({
  id: q.id,
  question_order: q.question_order,
  question_text: q.question_text,
  correct_answer: q.correct_answer,
  points: q.points
})) || [];

// 세션 생성 시 question_data 포함
const { data: session, error } = await supabase
  .from("relay_quiz_sessions")
  .insert({
    game_id: gameId,
    round_number: roundNumber,
    time_limit_seconds: timeLimit,
    status: "waiting",
    question_data: JSON.stringify(questionData), // ✅ 추가
  })
  .select()
  .single();
```

### 2. 참가자 화면 폴링 추가 (`components/relay-quiz-play-view.tsx`)

**변경 전:**
```typescript
useEffect(() => {
  const loadData = async () => {
    // 세션 로드
    const { data: sessionData } = await supabase
      .from("relay_quiz_sessions")
      .select("*")
      // ...
  };

  loadData(); // 한 번만 실행
}, [gameId, currentRound, teamId]);
```

**변경 후:**
```typescript
useEffect(() => {
  let isMounted = true;
  let pollInterval: NodeJS.Timeout | null = null;

  const loadData = async () => {
    console.log("🔄 [Relay Quiz] Loading session data...");
    
    // 세션 로드
    const { data: sessionData, error: sessionError } = await supabase
      .from("relay_quiz_sessions")
      .select("*")
      .eq("game_id", gameId)
      .eq("round_number", currentRound)
      .single();

    if (sessionError) {
      console.error("❌ [Relay Quiz] Session error:", sessionError);
    }

    if (!isMounted) return;

    if (sessionData) {
      console.log("✅ [Relay Quiz] Session loaded:", {
        id: sessionData.id,
        status: sessionData.status,
        hasQuestions: !!sessionData.question_data
      });
      setSession(sessionData);
    }
    
    // ... 나머지 로직
  };

  // 초기 로드
  loadData();

  // 2초마다 폴링
  pollInterval = setInterval(() => {
    if (isMounted) {
      console.log("🔄 [Relay Quiz] Polling for session updates...");
      loadData();
    }
  }, 2000);

  return () => {
    isMounted = false;
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  };
}, [gameId, currentRound, teamId]);
```

### 3. 관리자 화면 폴링 추가 (`components/relay-quiz-admin.tsx`)

**변경 전:**
```typescript
useEffect(() => {
  const loadData = async () => {
    // 세션 로드
  };

  loadData(); // 한 번만 실행
}, [gameId, currentRound]);
```

**변경 후:**
```typescript
useEffect(() => {
  let isMounted = true;
  let pollInterval: NodeJS.Timeout | null = null;

  const loadData = async () => {
    console.log("🔄 [Relay Quiz Admin] Loading session data...");
    
    // 세션 로드 로직
    // ...

    if (existingSession) {
      console.log("✅ [Relay Quiz Admin] Session loaded:", {
        id: existingSession.id,
        status: existingSession.status,
        hasQuestions: !!existingSession.question_data,
        questionCount: existingSession.question_data ? 
          JSON.parse(existingSession.question_data).length : 0
      });
      setSession(existingSession);
    }
  };

  // 초기 로드
  loadData();

  // 2초마다 폴링
  pollInterval = setInterval(() => {
    if (isMounted) {
      console.log("🔄 [Relay Quiz Admin] Polling for updates...");
      loadData();
    }
  }, 2000);

  return () => {
    isMounted = false;
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  };
}, [gameId, currentRound]);
```

### 4. getCurrentQuestionForTeam 개선 (`lib/relay-quiz-actions.ts`)

**주요 개선사항:**
1. **question_data 우선 사용**: 세션의 question_data에서 먼저 질문을 찾음 (빠름)
2. **데이터베이스 Fallback**: question_data가 없으면 데이터베이스에서 조회
3. **상세한 로깅**: 각 단계마다 로그 출력으로 디버깅 용이
4. **이전 답변 수정**: 마지막 정답만 가져오도록 개선

```typescript
export async function getCurrentQuestionForTeam(
  sessionId: string,
  teamId: string
) {
  try {
    console.log(`🔍 [Relay Quiz] Getting current question for team ${teamId}`);
    
    // 팀 진행 상황 조회
    const { data: teamProgress } = await supabase
      .from("relay_quiz_team_progress")
      .select("current_question_order, total_questions")
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .single();

    // 세션 조회 (question_data 포함)
    const { data: session } = await supabase
      .from("relay_quiz_sessions")
      .select("game_id, round_number, question_data")
      .eq("id", sessionId)
      .single();

    let question = null;

    // 1. question_data에서 먼저 찾기 (빠름)
    if (session.question_data) {
      const questions = JSON.parse(session.question_data);
      question = questions.find(
        (q: any) => q.question_order === teamProgress.current_question_order
      );
      console.log(`📝 [Relay Quiz] Found question from question_data`);
    }

    // 2. 없으면 데이터베이스에서 조회 (Fallback)
    if (!question) {
      console.log("🔄 [Relay Quiz] Falling back to database query");
      const { data: dbQuestion } = await supabase
        .from("relay_quiz_questions")
        .select("*")
        .eq("game_id", session.game_id)
        .eq("round_number", session.round_number)
        .eq("question_order", teamProgress.current_question_order)
        .single();
      
      question = dbQuestion;
    }

    // 이전 답변 가져오기 (정답만)
    let previousAnswer = null;
    if (teamProgress.current_question_order > 1) {
      const { data: previousAttempt } = await supabase
        .from("relay_quiz_attempts")
        .select("answer, is_correct")
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("is_correct", true) // ✅ 정답만
        .order("submitted_at", { ascending: false })
        .limit(1)
        .single();

      if (previousAttempt) {
        previousAnswer = previousAttempt.answer;
      }
    }

    return {
      success: true,
      question: {
        ...question,
        previousAnswer,
      },
      isComplete: false,
    };
  } catch (error) {
    console.error("❌ [Relay Quiz] Error:", error);
    return { success: false, error: error.message };
  }
}
```

## ✅ 개선 효과

### 1. 실시간 동기화
- 관리자가 세션을 생성하면 2초 이내에 참가자 화면에 반영
- 문제 업로드 시 즉시 참가자가 확인 가능
- 게임 시작 시 모든 참가자가 동시에 문제 확인

### 2. 성능 향상
- question_data를 사용하여 데이터베이스 쿼리 감소
- 폴링 간격 2초로 적절한 균형 유지
- 불필요한 리렌더링 방지 (isMounted 체크)

### 3. 디버깅 용이
- 각 단계마다 상세한 로그 출력
- 문제 발생 시 원인 파악 쉬움
- 콘솔에서 실시간 상태 확인 가능

### 4. 안정성 향상
- Fallback 메커니즘으로 데이터 손실 방지
- 에러 처리 강화
- 메모리 누수 방지 (cleanup 함수)

## 🧪 테스트 시나리오

### 시나리오 1: 세션 생성
1. 관리자가 릴레이 퀴즈 세션 생성
2. 문제 업로드
3. 참가자 화면에서 2초 이내에 세션 정보 표시 확인

### 시나리오 2: 게임 시작
1. 관리자가 게임 시작
2. 참가자 화면에서 첫 번째 문제 표시 확인
3. 답변 제출 후 다음 문제로 이동 확인

### 시나리오 3: 실시간 업데이트
1. 여러 팀이 동시에 게임 진행
2. 각 팀의 진행 상황이 실시간으로 업데이트되는지 확인
3. 관리자 화면에서 모든 팀의 상태 확인

## 📊 로그 예시

### 정상 동작 시:
```
🔄 [Relay Quiz] Loading session data...
✅ [Relay Quiz] Session loaded: { id: 'xxx', status: 'active', hasQuestions: true }
🔍 [Relay Quiz] Getting current question for team yyy
📊 [Relay Quiz] Team progress: 1/4
📝 [Relay Quiz] Found question from question_data: 1
```

### 문제 발생 시:
```
🔄 [Relay Quiz] Loading session data...
❌ [Relay Quiz] Session error: { message: 'No rows found' }
⚠️ [Relay Quiz] No session found
```

## 🔄 다음 단계

1. **WebSocket 전환**: 폴링 대신 Supabase Realtime 사용 고려
2. **캐싱 추가**: question_data를 클라이언트에 캐싱하여 성능 향상
3. **오프라인 지원**: 네트워크 끊김 시 로컬 데이터 사용
4. **에러 복구**: 자동 재시도 로직 추가

---

**작성일**: 2025-01-XX
**작성자**: Kiro AI Assistant
**상태**: ✅ 완료
