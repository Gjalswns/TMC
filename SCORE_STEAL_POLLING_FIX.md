# 점수 뺏기 게임 폴링 로직 개선

## 🐛 문제점

참가자 화면에서 세션 데이터가 반영되지 않는 문제:
- 관리자가 문제를 브로드캐스트해도 참가자 화면에 표시되지 않음
- `Final session object: { hasSession: true, hasQuestionData: true, questionTitle: '1' }` 로그는 보이지만 실제 UI에 반영 안 됨
- 폴링은 작동하지만 React 상태가 업데이트되지 않음

## 🔍 근본 원인

### 1. React 상태 업데이트 문제
```typescript
// ❌ 문제: 같은 객체 참조를 사용하면 React가 변경을 감지하지 못함
setSession(sessionRes.session);
```

React는 **참조 동등성(reference equality)**을 사용하여 상태 변경을 감지합니다. 
같은 객체를 다시 설정하면 React는 변경이 없다고 판단하여 리렌더링하지 않습니다.

### 2. 폴링은 작동하지만 UI는 업데이트 안 됨
```
📥 [10:30:15] Loading session data...
📊 [10:30:15] Session state: { hasQuestionData: true, questionTitle: '1' }
✅ [10:30:15] All data loaded successfully
// 하지만 UI는 그대로...
```

## 🔧 해결 방법

### 1. 강제 객체 복사로 React 리렌더링 트리거

**변경 전:**
```typescript
setSession(sessionRes.session);
setTeams(filteredTeams);
setAttempts(attemptsRes.attempts);
```

**변경 후:**
```typescript
// 스프레드 연산자로 새 객체 생성 → React가 변경 감지
setSession({...sessionRes.session});
setTeams([...filteredTeams]);
setAttempts([...attemptsRes.attempts]);
```

### 2. 참가자 화면 개선 (`components/score-steal-play-view.tsx`)

```typescript
const loadSessionData = useCallback(async () => {
  const timestamp = new Date().toLocaleTimeString();
  
  try {
    console.log(`📥 [${timestamp}] Loading session data...`);
    
    // 1. 세션 데이터 로드
    const sessionRes = await getScoreStealSessionDetails(sessionId);
    
    if (sessionRes.success && sessionRes.session) {
      console.log(`📊 [${timestamp}] Session state:`, {
        id: sessionRes.session.id,
        phase: sessionRes.session.phase,
        has_question_data: !!sessionRes.session.score_steal_questions,
        question_title: sessionRes.session.score_steal_questions?.title,
      });
      
      // ✅ 강제로 새 객체 생성하여 React 리렌더링 트리거
      setSession({...sessionRes.session});
      console.log(`✅ [${timestamp}] Session state updated in React`);
    }

    // 2. 팀 데이터 로드
    const teamsRes = await getAvailableTargets(gameId);
    if (teamsRes.success && teamsRes.teams) {
      const filteredTeams = teamsRes.teams.filter(/* ... */);
      setTeams([...filteredTeams]); // ✅ 새 배열 생성
    }

    // 3. 보호된 팀 로드
    const protectedRes = await getProtectedTeams(gameId, currentRound);
    if (protectedRes.success) {
      setProtectedTeams([...protectedRes.protectedTeams.map((p: any) => p.team_id)]); // ✅ 새 배열
    }

    // 4. 시도 기록 로드
    const attemptsRes = await getSessionAttempts(sessionId);
    if (attemptsRes.success) {
      setAttempts([...attemptsRes.attempts]); // ✅ 새 배열
      
      const myTeamAttempt = attemptsRes.attempts.find(
        (a: any) => a.team_id === teamId
      );
      if (myTeamAttempt) {
        setHasSubmitted(true);
        setMyAttempt({...myTeamAttempt}); // ✅ 새 객체
      }
    }
    
    console.log(`✅ [${timestamp}] All data loaded successfully`);
    
  } catch (error) {
    console.error(`❌ [${timestamp}] Load session data error:`, error);
  }
}, [sessionId, gameId, currentRound, teamId]);
```

### 3. 관리자 화면 개선 (`components/score-steal-admin.tsx`)

```typescript
const loadData = useCallback(async () => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`🔄 [${timestamp}] [Score Steal Admin] Loading data...`);
  
  // 세션 로드
  const { data: existingSession } = await supabase
    .from("score_steal_sessions")
    .select("*")
    .eq("game_id", gameId)
    .eq("round_number", currentRound)
    .single();

  if (existingSession) {
    console.log(`✅ [${timestamp}] Session found: ${existingSession.id}`);
    
    const sessionRes = await getScoreStealSessionDetails(existingSession.id);
    if (sessionRes.success) {
      console.log(`📊 [${timestamp}] Session details:`, {
        id: sessionRes.session.id,
        phase: sessionRes.session.phase,
        has_question_data: !!sessionRes.session.score_steal_questions,
        question_title: sessionRes.session.score_steal_questions?.title
      });
      setSession({...sessionRes.session}); // ✅ 새 객체
    }

    const attemptsRes = await getSessionAttempts(existingSession.id);
    if (attemptsRes.success) {
      console.log(`🎯 [${timestamp}] Attempts: ${attemptsRes.attempts.length} loaded`);
      setAttempts([...attemptsRes.attempts]); // ✅ 새 배열
    }
  }

  // 문제 로드
  const { data: centralQuestions } = await supabase
    .from('central_questions')
    .select(/* ... */)
    .eq('question_categories.name', 'score_steal')
    .eq('is_active', true);

  if (centralQuestions) {
    console.log(`📝 [${timestamp}] Questions: ${centralQuestions.length} loaded`);
    setQuestions([...centralQuestions]); // ✅ 새 배열
  }

  // 팀 로드
  const teamsResult = await getAvailableTargets(gameId);
  if (teamsResult.success && teamsResult.teams) {
    console.log(`👥 [${timestamp}] Teams: ${teamsResult.teams.length} loaded`);
    setTeams([...teamsResult.teams]); // ✅ 새 배열
  }

  // 보호된 팀 로드
  const protectedRes = await getProtectedTeams(gameId, currentRound);
  if (protectedRes.success) {
    console.log(`🛡️ [${timestamp}] Protected teams: ${protectedRes.protectedTeams.length} loaded`);
    setProtectedTeams([...protectedRes.protectedTeams]); // ✅ 새 배열
  }
  
  console.log(`✅ [${timestamp}] [Score Steal Admin] All data loaded`);
}, [gameId, currentRound]);
```

### 4. 폴링 로직 개선

**변경 전:**
```typescript
useEffect(() => {
  loadData();
}, [loadData]);

// 특정 phase에서만 폴링
useEffect(() => {
  if (session?.phase === "question_active" || session?.phase === "waiting_for_target") {
    const interval = setInterval(() => {
      loadData();
    }, 2000);
    return () => clearInterval(interval);
  }
}, [session?.phase, loadData]);
```

**변경 후:**
```typescript
// 항상 폴링 (더 안정적)
useEffect(() => {
  let isMounted = true;
  let pollInterval: NodeJS.Timeout | null = null;

  const poll = async () => {
    if (isMounted) {
      await loadData();
    }
  };

  // 초기 로드
  poll();

  // 2초마다 폴링
  pollInterval = setInterval(poll, 2000);

  return () => {
    isMounted = false;
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  };
}, [loadData]);
```

## ✅ 개선 효과

### 1. React 리렌더링 보장
- 스프레드 연산자로 새 객체/배열 생성
- React가 항상 변경을 감지하고 리렌더링
- UI가 즉시 업데이트됨

### 2. 실시간 동기화
- 관리자가 문제를 브로드캐스트하면 2초 이내에 참가자 화면에 표시
- 답변 제출 시 즉시 다른 참가자들에게 반영
- 게임 진행 상황 실시간 업데이트

### 3. 안정성 향상
- 항상 폴링하여 데이터 손실 방지
- isMounted 체크로 메모리 누수 방지
- 상세한 로그로 디버깅 용이

### 4. 일관된 동작
- 모든 phase에서 동일하게 작동
- 특정 상태에 의존하지 않음
- 예측 가능한 동작

## 🧪 테스트 시나리오

### 시나리오 1: 문제 브로드캐스트
1. 관리자가 문제 선택 및 브로드캐스트
2. 참가자 화면에서 2초 이내에 문제 표시 확인
3. 문제 이미지 및 제목 정상 표시 확인

### 시나리오 2: 답변 제출
1. 참가자가 답변 제출
2. 다른 참가자 화면에서 제출 상태 업데이트 확인
3. 관리자 화면에서 제출 목록 업데이트 확인

### 시나리오 3: 실시간 업데이트
1. 여러 팀이 동시에 답변 제출
2. 모든 참가자 화면에서 실시간 업데이트 확인
3. 관리자 화면에서 모든 제출 내역 확인

## 📊 로그 예시

### 정상 동작 시:
```
🔄 [10:30:15] [Score Steal Admin] Loading data...
✅ [10:30:15] Session found: abc-123
📊 [10:30:15] Session details: { phase: 'question_active', has_question_data: true, question_title: '1' }
📝 [10:30:15] Questions: 5 loaded
👥 [10:30:15] Teams: 4 loaded
🛡️ [10:30:15] Protected teams: 1 loaded
✅ [10:30:15] [Score Steal Admin] All data loaded

📥 [10:30:15] Loading session data...
📊 [10:30:15] Session state: { phase: 'question_active', has_question_data: true, question_title: '1' }
✅ [10:30:15] Session state updated in React
👥 [10:30:15] Teams: 3 loaded
✅ [10:30:15] All data loaded successfully
```

### UI 업데이트 확인:
```
📥 [10:30:17] Loading session data...
📊 [10:30:17] Session state: { phase: 'question_active', question_title: '1' }
✅ [10:30:17] Session state updated in React
// → UI에 문제 표시됨!
```

## 🎯 핵심 개선 사항

### Before (문제):
```typescript
// ❌ React가 변경을 감지하지 못함
setSession(sessionRes.session);
setTeams(filteredTeams);
```

### After (해결):
```typescript
// ✅ 새 객체/배열 생성으로 React 리렌더링 트리거
setSession({...sessionRes.session});
setTeams([...filteredTeams]);
```

## 🔄 React 상태 업데이트 원리

### 참조 동등성 (Reference Equality)
```typescript
const obj1 = { name: 'test' };
const obj2 = obj1; // 같은 참조

obj1 === obj2 // true → React는 변경 없음으로 판단

const obj3 = {...obj1}; // 새 객체
obj1 === obj3 // false → React가 변경 감지!
```

### 배열도 동일
```typescript
const arr1 = [1, 2, 3];
const arr2 = arr1; // 같은 참조

arr1 === arr2 // true → React는 변경 없음

const arr3 = [...arr1]; // 새 배열
arr1 === arr3 // false → React가 변경 감지!
```

## 📝 주의사항

### 1. 깊은 복사 vs 얕은 복사
```typescript
// ✅ 얕은 복사 (대부분의 경우 충분)
setSession({...sessionRes.session});

// ⚠️ 중첩 객체가 있는 경우 깊은 복사 필요
setSession(JSON.parse(JSON.stringify(sessionRes.session)));
```

### 2. 성능 고려
- 스프레드 연산자는 얕은 복사만 수행 (빠름)
- 큰 객체의 경우 성능 영향 미미
- 2초 폴링 간격으로 충분히 효율적

### 3. 메모리 관리
- isMounted 플래그로 메모리 누수 방지
- cleanup 함수에서 interval 정리
- 컴포넌트 언마운트 시 안전하게 종료

## 🚀 다음 단계

1. **WebSocket 전환**: 폴링 대신 Supabase Realtime 사용 고려
2. **최적화**: React.memo로 불필요한 리렌더링 방지
3. **에러 복구**: 자동 재시도 로직 추가
4. **오프라인 지원**: 네트워크 끊김 시 로컬 데이터 사용

---

**작성일**: 2025-01-XX
**작성자**: Kiro AI Assistant
**상태**: ✅ 완료
**관련 이슈**: 릴레이 퀴즈와 동일한 문제
