# 게임 점수 시스템 업데이트 구현 완료

## 구현 일자
2025년 10월 18일

## 변경 사항

### 1. Year Game 점수 계산 시스템 변경

**파일**: `lib/year-game-utils.ts`

- **이전**: 찾은 숫자 개수 + 연속 숫자 보너스
- **변경**: 범위별 점수 부여 시스템
  - 1~9: 10점
  - 10~19: 20점  
  - 20~29: 30점
  - 30~39: 40점
  - 40~49: 50점
  - 50~59: 60점
  - 60~69: 70점
  - 70~79: 80점
  - 80~89: 90점
  - 90~99: 100점
  - 100: 100점

### 2. Score Steal Game - 실시간 경쟁 모드로 재구현

#### 데이터베이스 변경 (`scripts/022-score-steal-realtime-competition.sql`)

**새로운 컬럼**:
- `score_steal_sessions`:
  - `current_question_id`: 현재 진행 중인 문제
  - `question_broadcast_at`: 문제 공개 시각
  - `winner_team_id`: 승자 팀
  - `phase`: 게임 단계 (waiting, question_active, waiting_for_target, completed)

- `score_steal_attempts`:
  - `response_time_ms`: 응답 시간 (밀리초)
  - `is_winner`: 승자 여부
  - `session_id`: 세션 참조

**새로운 테이블**:
- `score_steal_protected_teams`: 점수 뺏기로부터 보호된 팀 목록
  - 직전 라운드 피해자는 다음 라운드에서 자동 보호

**새로운 함수**:
- `submit_answer_race()`: 원자적 정답 제출 및 시간 기록
- `determine_round_winner()`: 가장 빠른 정답자 결정
- `execute_score_steal_safe()`: 점수 이동 및 보호 팀 업데이트
- `get_protected_teams()`: 보호 팀 조회
- `broadcast_question()`: 문제 공개

#### 서버 액션 (`lib/score-steal-actions.ts`)

**새로운 함수**:
- `broadcastQuestion()`: 모든 팀에게 동시에 문제 공개
- `submitAnswerForRace()`: 정답 제출 및 응답 시간 기록
- `determineWinner()`: 가장 빠른 정답자 결정
- `executeScoreSteal()`: 점수 이동 실행
- `getProtectedTeams()`: 보호받는 팀 목록 조회
- `getScoreStealSessionDetails()`: 세션 상세 정보 조회
- `getSessionAttempts()`: 세션의 모든 제출 내역 조회

#### UI 컴포넌트

**Admin 컴포넌트** (`components/score-steal-admin.tsx`):
1. 라운드별 문제 등록
2. 문제 공개 버튼으로 모든 팀에게 동시 공개
3. 실시간 제출 현황 모니터링
4. 승자 결정 버튼
5. 승자의 타겟 선택 대기
6. 점수 이동 실행 및 결과 표시
7. 보호된 팀 표시

**Play View 컴포넌트** (`components/score-steal-play-view.tsx`):

게임 단계별 UI:
1. **대기 단계** (phase: waiting)
   - 문제 공개 대기 메시지
   - 현재 순위표 표시

2. **문제 진행 단계** (phase: question_active)
   - 문제 표시
   - 정답 입력창 (자동 포커스)
   - 제출 후 입력창 비활성화
   - 다른 팀의 제출 현황 실시간 표시

3. **타겟 선택 대기** (phase: waiting_for_target)
   - **승자**: 타겟 선택 UI (보호된 팀 제외)
   - **비승자**: 승자의 선택 대기 메시지

4. **완료** (phase: completed)
   - 최종 결과 및 순위표

#### 실시간 훅 (`hooks/use-realtime.ts`)

**새로운 훅**:
- `useScoreStealSessionUpdates()`: 세션 상태 변경 감지
- `useScoreStealAttemptUpdates()`: 새로운 제출 감지
- `useQuestionBroadcast()`: 문제 공개 이벤트 수신
- `useWinnerAnnouncement()`: 승자 결정 이벤트 수신
- `useScoreStealExecution()`: 점수 이동 완료 이벤트 수신

## 배포 전 필수 작업

### 1. 데이터베이스 마이그레이션 실행

Supabase 대시보드의 SQL Editor에서 다음 스크립트를 **순서대로** 실행:

```bash
scripts/022-score-steal-realtime-competition.sql
```

### 2. 실시간 기능 활성화

Supabase 대시보드에서 다음 테이블의 Realtime을 활성화:
- `score_steal_sessions`
- `score_steal_attempts`
- `score_steal_protected_teams`

### 3. Row Level Security 확인

새로 생성된 테이블의 RLS 정책이 올바르게 설정되었는지 확인:
- `score_steal_protected_teams`

## 게임 플레이 흐름

### Score Steal Game (실시간 경쟁 모드)

1. **관리자**: 세션 생성 및 게임 시작
2. **관리자**: 문제 등록 (라운드당 1개 권장)
3. **관리자**: "문제 공개" 버튼 클릭
4. **모든 팀**: 동시에 문제 표시, 정답 입력
5. **시스템**: 제출 시간 자동 기록
6. **관리자**: "승자 결정" 버튼으로 가장 빠른 정답자 확인
7. **승자**: 점수를 뺏을 타겟 팀 선택 (보호된 팀 제외)
8. **시스템**: 점수 이동 및 피해 팀 자동 보호 (다음 라운드)

### Year Game

- 이전과 동일한 게임 플레이
- 점수 계산 방식만 변경됨
- 범위별로 더 많은 점수 획득 가능

## 주의사항

### 호환성
- 기존 Score Steal 게임 데이터와 호환되지 않을 수 있음
- 새로운 라운드부터 적용 권장

### 성능
- 폴링 간격: 1초 (Play View), 2초 (Admin)
- 많은 팀이 동시 접속 시 서버 부하 모니터링 필요

### 보호 시스템
- 직전 라운드 피해자는 자동으로 다음 라운드에서 보호
- 보호는 1라운드만 지속됨
- 연속으로 같은 팀이 피해를 입는 것 방지

## 테스트 체크리스트

- [ ] Year Game에서 1~9 숫자 찾기 → 10점씩 확인
- [ ] Year Game에서 90~99 숫자 찾기 → 100점씩 확인
- [ ] Score Steal에서 여러 팀 동시 제출
- [ ] 가장 빠른 정답자만 승자로 선정되는지 확인
- [ ] 승자가 보호된 팀을 선택할 수 없는지 확인
- [ ] 점수 뺏기 후 피해 팀이 다음 라운드에서 보호되는지 확인
- [ ] 틀린 답 제출 시 승자가 될 수 없는지 확인

## 트러블슈팅

### 문제: 실시간 업데이트가 작동하지 않음
- Supabase Realtime이 활성화되어 있는지 확인
- 브라우저 콘솔에서 WebSocket 연결 확인
- 폴링 fallback이 작동하는지 확인 (1~2초마다 업데이트)

### 문제: 승자가 결정되지 않음
- 정답이 맞는지 확인 (대소문자 구분 없음, 공백 trim)
- 최소 1개 이상의 정답 제출이 있는지 확인
- Admin에서 "승자 결정" 버튼 클릭했는지 확인

### 문제: 보호된 팀을 선택할 수 있음
- 데이터베이스 함수 `execute_score_steal_safe()`가 올바르게 생성되었는지 확인
- `score_steal_protected_teams` 테이블에 데이터가 있는지 확인

## 추가 개선 사항 (향후)

1. **타임아웃**: 문제 공개 후 일정 시간 후 자동 마감
2. **동점 처리**: 응답 시간이 같을 경우 처리 로직
3. **부정행위 방지**: 클라이언트 시간 조작 방지
4. **통계**: 팀별 평균 응답 시간, 정답률 등
5. **알림**: 소리/진동으로 문제 공개 알림
6. **모바일 최적화**: 터치 친화적 UI

## 문의

구현 관련 문의사항은 개발팀에 연락 바랍니다.

