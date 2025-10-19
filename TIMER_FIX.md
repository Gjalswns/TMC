# Year Game 타이머 초기화 문제 해결

## 문제 상황

Admin 페이지에서 Year Game을 진행 중일 때, 다른 화면(예: 팀 관리, 점수판 등)으로 이동했다가 돌아오면 **타이머가 초기화되는 문제** 발생

## 원인 분석

### 기존 코드의 문제점:

1. **타이머가 카운트다운 방식**으로 작동
   ```typescript
   setRemainingTime((prev) => prev - 1);  // 이전 값에서 -1
   ```
   - 컴포넌트가 unmount되면 상태가 사라짐
   - 다시 mount될 때 타이머가 처음부터 다시 시작

2. **세션 로드 쿼리가 제한적**
   ```typescript
   .eq("status", "waiting")  // waiting 상태만 조회
   ```
   - active 상태의 세션을 찾지 못함
   - 페이지 새로고침 시 진행 중인 게임을 인식하지 못함

## 해결 방법

### 1. 서버 시간 기반 타이머로 변경 ✅

```typescript
// Before: 카운트다운 방식
setRemainingTime((prev) => prev - 1);

// After: 서버 시간 기준으로 매번 재계산
const calculateRemainingTime = () => {
  const startTime = new Date(session.started_at!).getTime();
  const timeLimit = session.time_limit_seconds * 1000;
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, timeLimit - elapsed);
  return Math.floor(remaining / 1000);
};

setInterval(() => {
  setRemainingTime(calculateRemainingTime());
}, 1000);
```

**장점:**
- 컴포넌트가 언제 mount되든 정확한 남은 시간 표시
- 다른 화면에 갔다 와도 타이머가 정확함
- 서버 시간과 항상 동기화

### 2. 세션 로드 로직 개선 ✅

```typescript
// Before: waiting 상태만 조회
.eq("status", "waiting")

// After: 모든 상태의 세션 조회 (최신 것)
.order("created_at", { ascending: false })
.limit(1)
```

**장점:**
- active, finished 상태의 세션도 인식
- 페이지 새로고침해도 진행 중인 게임 유지
- 여러 세션이 있어도 최신 것을 가져옴

### 3. 주기적 세션 업데이트 추가 ✅

```typescript
// 게임이 active일 때 5초마다 세션 상태 확인
useEffect(() => {
  if (session?.status === "active") {
    const pollInterval = setInterval(async () => {
      const { data: updatedSession } = await supabase
        .from("year_game_sessions")
        .select("*")
        .eq("id", session.id)
        .single();
      
      // 상태가 변경되면 업데이트
      if (updatedSession?.status !== session.status) {
        setSession(updatedSession);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }
}, [session?.id, session?.status]);
```

**장점:**
- 다른 admin이 게임을 종료해도 자동 감지
- 네트워크 문제로 Realtime이 실패해도 폴링으로 백업
- 항상 최신 세션 상태 유지

## 수정된 파일

- `components/year-game-admin.tsx`

## 테스트 방법

### 1. 기본 테스트
1. Admin 페이지에서 Year Game 세션 시작
2. 타이머가 3:00에서 카운트다운 시작
3. "Teams" 탭으로 이동
4. 10초 정도 대기
5. "Games" 탭으로 돌아가기
6. **결과**: 타이머가 정확한 시간(예: 2:50)을 표시해야 함

### 2. 페이지 새로고침 테스트
1. Year Game이 진행 중일 때
2. 브라우저 새로고침 (F5)
3. **결과**: 타이머가 정확한 남은 시간을 표시해야 함

### 3. 다중 탭 테스트
1. Admin 페이지를 2개의 탭에서 열기
2. 첫 번째 탭에서 Year Game 시작
3. 두 번째 탭으로 이동
4. **결과**: 두 번째 탭에서도 진행 중인 게임이 표시되어야 함

### 4. 장시간 테스트
1. Year Game 시작 후 타이머 확인
2. 다른 앱 사용하며 5분 대기
3. 다시 Admin 페이지로 돌아오기
4. **결과**: 타이머가 종료되었거나 정확한 시간 표시

## 기술적 세부사항

### 타이머 정확도

- **클라이언트 시간 사용**: `Date.now()`
- **서버 시작 시간**: `session.started_at` (UTC timestamp)
- **오차**: 클라이언트-서버 시간 차이 (일반적으로 1초 이내)

### 성능 최적화

1. **불필요한 리렌더링 방지**
   - 상태가 실제로 변경될 때만 업데이트
   - `started_at`가 같으면 타이머 재시작하지 않음

2. **폴링 최적화**
   - active 상태일 때만 폴링
   - 5초 간격으로 적절한 밸런스 (너무 잦으면 부하, 너무 느리면 지연)

3. **메모리 누수 방지**
   - cleanup 함수로 interval 정리
   - 컴포넌트 unmount 시 타이머 정리

## 추가 개선 사항 (향후)

### 1. WebSocket Realtime 사용
현재는 폴링을 사용하지만, Realtime이 안정적이면:
```typescript
useYearGameSessionUpdates(gameId, (updatedSession) => {
  setSession(updatedSession);
});
```

### 2. 서버 시간 동기화
클라이언트-서버 시간 차이를 보정:
```typescript
const serverTime = await fetch('/api/time');
const offset = serverTime - Date.now();
// 타이머 계산 시 offset 적용
```

### 3. 타이머 시각적 경고
남은 시간에 따라 색상 변경:
- 2분 이상: 초록색
- 1-2분: 노란색
- 1분 미만: 빨간색 + 깜빡임

## 관련 이슈

- 같은 문제가 다른 게임 모드에도 있을 수 있음:
  - Score Steal Game
  - Relay Quiz Game
  
필요시 동일한 패턴 적용 가능

## 참고

이 수정으로 Year Game Play View는 이미 올바르게 작동하고 있었음 (서버 시간 기반 계산 사용). Admin View만 수정이 필요했음.

