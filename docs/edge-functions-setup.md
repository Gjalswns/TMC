# Supabase Edge Functions 설정 가이드

## 1. Supabase CLI 설치

```bash
# npm으로 설치
npm install -g supabase

# 또는 yarn으로 설치
yarn global add supabase
```

## 2. Supabase 프로젝트 로그인

```bash
supabase login
```

## 3. 프로젝트 연결

```bash
# 프로젝트 디렉토리에서 실행
supabase link --project-ref YOUR_PROJECT_REF
```

## 4. Edge Functions 배포

```bash
# 모든 함수 배포
supabase functions deploy

# 또는 개별 함수 배포
supabase functions deploy broadcast-game-event
supabase functions deploy sync-game-state
```

## 5. 환경 변수 설정

Supabase Dashboard에서 다음 환경 변수를 설정하세요:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
```

## 6. 함수 테스트

### broadcast-game-event 테스트
```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/broadcast-game-event' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "your-game-id",
    "eventType": "test-event",
    "data": {"message": "Hello World"}
  }'
```

### sync-game-state 테스트
```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-game-state' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "gameId": "your-game-id",
    "includeParticipants": true,
    "includeTeams": true,
    "includeSessions": true
  }'
```

## 7. 로컬 개발

```bash
# Edge Functions 로컬 서버 시작
supabase functions serve

# 특정 함수만 서빙
supabase functions serve broadcast-game-event
```

## 8. 함수 로그 확인

```bash
# 실시간 로그 확인
supabase functions logs broadcast-game-event

# 특정 시간대 로그
supabase functions logs broadcast-game-event --since 1h
```

## 9. 성능 모니터링

Supabase Dashboard의 "Edge Functions" 섹션에서:
- 함수 실행 횟수
- 평균 응답 시간
- 에러율
- 메모리 사용량

## 10. 트러블슈팅

### 일반적인 문제들:

1. **CORS 오류**
   - `corsHeaders`가 올바르게 설정되었는지 확인
   - OPTIONS 요청이 제대로 처리되는지 확인

2. **인증 오류**
   - `SUPABASE_ANON_KEY`가 올바른지 확인
   - Authorization 헤더가 제대로 전달되는지 확인

3. **함수 타임아웃**
   - 함수 실행 시간이 150초를 초과하지 않는지 확인
   - 데이터베이스 쿼리가 최적화되었는지 확인

4. **메모리 부족**
   - 함수에서 불필요한 데이터를 로드하지 않는지 확인
   - 대용량 데이터 처리 시 스트리밍 사용 고려

## 11. 비용 최적화

- 불필요한 함수 호출 최소화
- 캐싱 전략 구현
- 배치 처리로 여러 요청 통합
- 함수 실행 시간 최적화
