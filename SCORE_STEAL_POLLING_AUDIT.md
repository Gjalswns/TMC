# Score Steal 게임 폴링 로직 전수 검사

## 📋 검사 항목

### 1. 관리자 화면 (score-steal-admin.tsx)
### 2. 참가자 화면 (score-steal-play-view.tsx)
### 3. 서버 액션 (score-steal-actions.ts)
### 4. 데이터 흐름 및 동기화

---

## 1️⃣ 관리자 화면 폴링 로직

### ✅ 현재 구현

```typescript
const loadData = useCallback(async () => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`🔄 [${timestamp}] [Score Steal Admin] Loading data...`);
  
  // 1. 게임 라운드 확인
  const { data: gameData } = await supabase
    .from("games")
    .select("current_round, total_rounds")
    .eq("id", gameId)
    .single();

  if (gameData?.current_round !== 2) {
    console.log(`⚠️ Skipping - current round is ${gameData.current_round}, not 2`);
    return;
  }

  // 2. 세션 로드
  const { data: existingSession } = await supabase
    .from("score_steal_sessions")
    .select("*")
    .eq("game_id", gameId)
    .eq("round_number", currentRound)
    .single();

  if (existingSession) {
    const sessionRes = await getScoreStealSessionDetails(existingSession.id);
    if (sessionRes.success) {
      setSession({...sessionRes.session}); // ✅ 새 객체 생성
    }
  }

  // 3. 문제, 팀, 보호된 팀 로드
  // ... (모두 새 배열 생성)
}, [gameId, currentRound]);

// 폴링 설정
useEffect(() => {
  let isMounted = true;
  let pollInterval: NodeJS.Timeout | null = null;

  const poll = async () => {
    if (isMounted) {
      await loadData();
    }
  };

  poll(); // 즉시 실행
  pollInterval = setInterval(poll, 2000); // 2초마다

  return () => {
    isMounted = false;
    if (pollInterval) clearInterval(pollInterval);
  };
}, [loadData]);
```

### ✅ 장점
1. **메모리 누수 방지**: `isMounted` 플래그 사용
2. **즉시 실행**: 컴포넌트 마운트 시 즉시 데이터 로드
3. **적절한 간격**: 2초 폴링 (너무 짧지도 길지도 않음)
4. **React 리렌더링 보장**: 스프레드 연산자로 새 객체/배열 생성
5. **라운드 검증**: 현재 라운드가 2가 아니면 스킵

### ⚠️ 잠재적 문제
1. **의존성 배열**: `loadData`가 의존성에 있어 무한 루프 가능성
2. **에러 처리**: 네트워크 오류 시 재시도 로직 없음
3. **중복 쿼리**: `getScoreStealSessionDetails`가 추가 쿼리 수행

### 🔧 개선 제안

```typescript
// 1. loadData를 useCallback 밖으로 이동하거나 의존성 최소화
useEffect(() => {
  let isMounted = true;
  let pollInterval: NodeJS.Timeout | null = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  const poll = async () => {
    if (!isMounted) return;
    
    try {
      // 직접 데이터 로드 (useCallback 의존성 제거)
      const { data: gameData } = await supabase
        .from("games")
        .select("current_round, total_rounds")
        .eq("id", gameId)
        .single();

      if (gameData?.current_round !== 2) return;

      // ... 나머지 로직
      
      retryCount = 0; // 성공 시 재시도 카운트 리셋
    } catch (error) {
      console.error("Poll error:", error);
      retryCount++;
      
      if (retryCount >= MAX_RETRIES) {
        console.error("Max retries reached, stopping poll");
        if (pollInterval) clearInterval(pollInterval);
      }
    }
  };

  poll();
  pollInterval = setInterval(poll, 2000);

  return () => {
    isMounted = false;
    if (pollInterval) clearInterval(pollInterval);
  };
}, [gameId, currentRound]); // loadData 제거
```

---

## 2️⃣ 참가자 화면 폴링 로직

### ✅ 현재 구현

```typescript
const loadSessionData = useCallback(async () => {
  const timestamp = new Date().toLocaleTimeString();
  
  // 1. 클라이언트에서 직접 Supabase 쿼리 (캐시 방지)
  const { data: rawSession } = await supabase
    .from("score_steal_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  // 2. 문제 데이터 로드
  if (rawSession.current_question_id) {
    const { data: question } = await supabase
      .from('central_questions')
      .select('id, title, question_image_url, correct_answer, points')
      .eq('id', rawSession.current_question_id)
      .single();
    
    sessionWithQuestion = { ...rawSession, score_steal_questions: question };
  }

  // 3. React 상태 업데이트
  setSession({...sessionWithQuestion}); // ✅ 새 객체 생성
  
  // 4. 팀, 보호된 팀, 시도 기록 로드
  // ... (모두 새 배열 생성)
}, [sessionId, gameId, currentRound, teamId]);

// 폴링 설정
useEffect(() => {
  setSseConnected(true);
  let pollCount = 0;
  
  const poll = async () => {
    pollCount++;
    await loadSessionData();
  };
  
  poll(); // 즉시 실행
  const interval = setInterval(poll, 2000); // 2초마다
  
  return () => clearInterval(interval);
}, [sessionId, loadSessionData]);
```

### ✅ 장점
1. **직접 쿼리**: Server Action 캐싱 문제 해결
2. **상세한 로깅**: 각 단계마다 타임스탬프와 함께 로그
3. **React 리렌더링 보장**: 스프레드 연산자 사용
4. **즉시 실행**: 컴포넌트 마운트 시 즉시 데이터 로드

### ⚠️ 잠재적 문제
1. **의존성 배열**: `loadSessionData`가 의존성에 있어 무한 루프 가능성
2. **메모리 누수**: `isMounted` 플래그 없음
3. **에러 처리**: try-catch는 있지만 재시도 로직 없음
4. **중복 폴링**: 두 개의 useEffect가 폴링 수행 (라인 207, 243)

### 🔧 개선 제안

```typescript
// 중복 폴링 제거 및 메모리 누수 방지
useEffect(() => {
  let isMounted = true;
  let pollInterval: NodeJS.Timeout | null = null;
  let pollCount = 0;

  const poll = async () => {
    if (!isMounted) return;
    
    pollCount++;
    const timestamp = new Date().toLocaleTimeString();
    console.log(`🔄 [${timestamp}] Poll #${pollCount}`);

    try {
      // 직접 데이터 로드 (의존성 제거)
      const { data: rawSession, error } = await supabase
        .from("score_steal_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (error || !isMounted) return;

      // 문제 로드
      let sessionWithQuestion = rawSession;
      if (rawSession.current_question_id) {
        const { data: question } = await supabase
          .from('central_questions')
          .select('id, title, question_image_url, correct_answer, points')
          .eq('id', rawSession.current_question_id)
          .single();
        
        if (question && isMounted) {
          sessionWithQuestion = { ...rawSession, score_steal_questions: question };
        }
      }

      if (isMounted) {
        setSession({...sessionWithQuestion});
      }

      // 팀, 시도 기록 등 로드
      // ...
      
    } catch (error) {
      console.error(`❌ Poll #${pollCount} failed:`, error);
    }
  };

  poll();
  pollInterval = setInterval(poll, 2000);

  return () => {
    isMounted = false;
    if (pollInterval) clearInterval(pollInterval);
  };
}, [sessionId, gameId, currentRound, teamId]); // loadSessionData 제거
```

---

## 3️⃣ 서버 액션 분석

### ✅ broadcastQuestion

```typescript
export async function broadcastQuestion(sessionId: string, questionId: string) {
  const timestamp = new Date().toISOString();
  
  // 1. 문제 가져오기
  const { data: question } = await supabase
    .from('central_questions')
    .select('*')
    .eq('id', questionId)
    .single();

  // 2. 현재 세션 상태 확인 (업데이트 전)
  const { data: currentSession } = await supabase
    .from('score_steal_sessions')
    .select('id, phase, status, current_question_id')
    .eq('id', sessionId)
    .single();

  console.log(`📊 Current session BEFORE update:`, currentSession);

  // 3. 세션 업데이트
  const { data: updatedSession, error } = await supabase
    .from('score_steal_sessions')
    .update({
      current_question_id: questionId,
      question_broadcast_at: broadcastTime,
      phase: 'question_active',
      status: 'active'
    })
    .eq('id', sessionId)
    .select()
    .single();

  console.log(`✅ Session updated successfully:`, updatedSession);

  // 4. 업데이트 후 검증
  const { data: verifySession } = await supabase
    .from('score_steal_sessions')
    .select('id, phase, status, current_question_id, question_broadcast_at')
    .eq('id', sessionId)
    .single();

  console.log(`🔍 Verification - Session AFTER update:`, verifySession);

  return { success: true, broadcastAt: broadcastTime };
}
```

### ✅ 장점
1. **상세한 로깅**: 업데이트 전후 상태 확인
2. **검증 단계**: 업데이트 후 다시 조회하여 확인
3. **타임스탬프**: 모든 로그에 타임스탬프 포함

### ⚠️ 잠재적 문제
1. **불필요한 쿼리**: 검증을 위해 3번 쿼리 (before, update, after)
2. **revalidatePath**: Next.js 캐시 무효화가 클라이언트 직접 쿼리에는 영향 없음

### 🔧 개선 제안

```typescript
export async function broadcastQuestion(sessionId: string, questionId: string) {
  const timestamp = new Date().toISOString();
  
  try {
    // 1. 문제 가져오기
    const { data: question, error: questionError } = await supabase
      .from('central_questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (questionError) throw new Error('Question not found');

    // 2. 세션 업데이트 (검증 쿼리 제거)
    const broadcastTime = new Date().toISOString();
    const { data: updatedSession, error: updateError } = await supabase
      .from('score_steal_sessions')
      .update({
        current_question_id: questionId,
        question_broadcast_at: broadcastTime,
        phase: 'question_active',
        status: 'active'
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`✅ [${timestamp}] Question broadcasted:`, {
      sessionId,
      questionId,
      phase: updatedSession.phase
    });

    // revalidatePath는 제거 (클라이언트 직접 쿼리 사용 중)
    return { success: true, broadcastAt: broadcastTime };
  } catch (error) {
    console.error(`❌ [${timestamp}] Broadcast failed:`, error);
    return { success: false, error: error.message };
  }
}
```

---

## 4️⃣ 데이터 흐름 분석

### 현재 흐름

```
관리자: 문제 공개 버튼 클릭
  ↓
broadcastQuestion() 호출
  ↓
DB: score_steal_sessions 업데이트
  - current_question_id = 'abc-123'
  - phase = 'question_active'
  - status = 'active'
  ↓
관리자 폴링 (2초 후)
  ↓
getScoreStealSessionDetails() 호출
  ↓
관리자 UI 업데이트
  ↓
참가자 폴링 (2초 후)
  ↓
supabase.from("score_steal_sessions").select() (직접 쿼리)
  ↓
참가자 UI 업데이트
```

### ⏱️ 지연 시간 분석

1. **관리자 → DB**: ~100ms (broadcastQuestion)
2. **DB → 관리자 UI**: 최대 2초 (폴링 간격)
3. **DB → 참가자 UI**: 최대 2초 (폴링 간격)
4. **총 지연**: 최대 4초 (관리자 클릭 → 참가자 화면 업데이트)

### 🎯 최적화 제안

#### Option 1: Supabase Realtime (권장)
```typescript
// 참가자 화면
useEffect(() => {
  const channel = supabase
    .channel(`score-steal-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'score_steal_sessions',
        filter: `id=eq.${sessionId}`
      },
      (payload) => {
        console.log('🔔 Session updated:', payload.new);
        setSession({...payload.new});
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [sessionId]);
```

**장점**:
- 즉시 업데이트 (지연 < 100ms)
- 서버 부하 감소
- 배터리 절약 (모바일)

**단점**:
- Supabase Realtime 설정 필요
- WebSocket 연결 관리 필요

#### Option 2: 폴링 간격 단축
```typescript
// 1초로 단축 (현재 2초)
const interval = setInterval(poll, 1000);
```

**장점**:
- 구현 간단
- 지연 시간 50% 감소

**단점**:
- 서버 부하 2배 증가
- 배터리 소모 증가

#### Option 3: Adaptive Polling (스마트 폴링)
```typescript
useEffect(() => {
  let pollInterval = 2000; // 기본 2초
  let consecutiveNoChanges = 0;

  const poll = async () => {
    const changed = await loadSessionData();
    
    if (changed) {
      consecutiveNoChanges = 0;
      pollInterval = 1000; // 변경 감지 시 1초로 단축
    } else {
      consecutiveNoChanges++;
      if (consecutiveNoChanges > 5) {
        pollInterval = 5000; // 변경 없으면 5초로 연장
      }
    }
    
    // 다음 폴링 스케줄
    setTimeout(poll, pollInterval);
  };

  poll();
}, []);
```

**장점**:
- 활동 중일 때 빠른 응답
- 유휴 시 서버 부하 감소
- 배터리 효율적

**단점**:
- 구현 복잡도 증가

---

## 5️⃣ React 베스트 프랙티스 검증

### ✅ 준수 사항
1. **useCallback 사용**: 함수 메모이제이션
2. **useEffect cleanup**: 메모리 누수 방지
3. **의존성 배열**: 명시적 선언
4. **불변성 유지**: 스프레드 연산자 사용

### ⚠️ 개선 필요
1. **useCallback 의존성**: 무한 루프 위험
2. **중복 useEffect**: 같은 작업을 여러 번 수행
3. **에러 경계**: Error Boundary 없음
4. **로딩 상태**: 폴링 중 로딩 표시 없음

---

## 6️⃣ 최종 권장사항

### 🚀 즉시 적용 (High Priority)

1. **중복 폴링 제거**
   - 참가자 화면의 두 개 useEffect 통합
   - 하나의 폴링 로직으로 단순화

2. **메모리 누수 방지**
   - 모든 폴링에 `isMounted` 플래그 추가
   - cleanup 함수에서 확실히 정리

3. **의존성 배열 수정**
   - `loadData`를 의존성에서 제거
   - 직접 데이터 로드 로직 사용

### 📈 중기 개선 (Medium Priority)

4. **에러 처리 강화**
   - 재시도 로직 추가
   - 최대 재시도 횟수 설정
   - 사용자에게 에러 알림

5. **성능 최적화**
   - 불필요한 쿼리 제거
   - 검증 쿼리 최소화

### 🎯 장기 개선 (Low Priority)

6. **Supabase Realtime 전환**
   - 폴링 → WebSocket
   - 즉시 업데이트
   - 서버 부하 감소

7. **Adaptive Polling**
   - 활동 기반 폴링 간격 조정
   - 배터리 효율 개선

---

## 📊 현재 상태 점수

| 항목 | 점수 | 비고 |
|------|------|------|
| 기능성 | 8/10 | 기본 기능 작동 |
| 성능 | 6/10 | 중복 쿼리, 폴링 지연 |
| 안정성 | 7/10 | 메모리 누수 위험 |
| 유지보수성 | 7/10 | 로깅 우수, 중복 코드 있음 |
| 사용자 경험 | 7/10 | 최대 4초 지연 |

**총점: 35/50 (70%)**

---

## 🎯 개선 후 예상 점수

| 항목 | 현재 | 개선 후 |
|------|------|---------|
| 기능성 | 8/10 | 9/10 |
| 성능 | 6/10 | 9/10 |
| 안정성 | 7/10 | 9/10 |
| 유지보수성 | 7/10 | 9/10 |
| 사용자 경험 | 7/10 | 9/10 |

**총점: 35/50 → 45/50 (90%)**

---

**작성일**: 2025-01-XX
**검사자**: Kiro AI Assistant
**상태**: ✅ 검사 완료
