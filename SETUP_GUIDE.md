# TMC 개편 설정 가이드

## 데이터베이스 마이그레이션

Supabase SQL Editor에서 다음 스크립트를 순서대로 실행하세요:

```bash
scripts/026-participant-preregistration.sql
scripts/027-score-steal-game.sql
```

## 주요 변경사항

### 1. 참가자 사전 등록 시스템
- **관리자 페이지**: `/admin/participants`
- CSV 파일로 팀과 선수 일괄 등록
- 개별 선수 추가/삭제 기능
- Higher/Lower 브래킷 분리

### 2. 게임 입장 간소화
- **새 입장 페이지**: `/join-new`
- 2자리 게임 코드 (예: 23, 79)
- 사전 등록된 선수 선택
- 이름/아이디 직접 입력 제거

### 3. Year Game 팀별 점수판
- **점수판 페이지**: `/year-game-scoreboard/[sessionId]`
- 팀 선택 기능
- 1~100 숫자 그리드 표시
- 맞춘 숫자 실시간 업데이트

### 4. 브래킷 분리 점수판
- **점수판 페이지**: `/scoreboard/[gameId]`
- 가로 분할: 왼쪽 Higher, 오른쪽 Lower
- 총점만 표시 (개별 숫자 제거)
- 실시간 순위 업데이트

### 5. Score Steal 게임
- 오답 시 -50점
- 정답 시 같은 브래킷 잠금
- 양쪽 브래킷 정답 후 관리자가 대상 선택
- 연속 점수 손실 방지 (보호 메커니즘)

## CSV 템플릿

참가자 등록용 CSV 파일 형식:

```csv
player_name,team_name,bracket,player_number
홍길동,팀A,higher,1
김철수,팀A,higher,2
이영희,팀A,higher,3
박민수,팀A,higher,4
최영수,팀B,lower,1
정미영,팀B,lower,2
강호동,팀B,lower,3
유재석,팀B,lower,4
```

## 사용 흐름

### 게임 준비
1. `/admin/participants`에서 참가자 등록 (CSV 또는 개별)
2. `/admin`에서 게임 생성 (브래킷 사용 옵션 체크)
3. 2자리 게임 코드 확인

### 게임 진행
1. 참가자들이 `/join-new`에서 코드 입력 + 본인 선택
2. 관리자가 게임 시작
3. **점수판 열기**: 관리자 페이지에서 "점수판 열기" 버튼 클릭
   - 깔끔한 실시간 점수판: `/display/[gameId]` (별도 화면/프로젝터용)
   - 팀별 상세 점수판: `/year-game-scoreboard/[sessionId]` (Year Game)
4. Round 1: Year Game
5. Round 2: Score Steal
   - 관리자가 점수 탈취 대상 선택
6. Round 3-4: Relay Quiz

## 주요 함수

### 참가자 관리
- `bulk_register_players(p_players)` - CSV 일괄 등록
- `get_preregistered_teams()` - 팀 목록 조회
- `join_game_with_preregistered_player(p_game_code, p_player_id)` - 게임 참가

### Score Steal
- `submit_score_steal_attempt()` - 시도 제출 (브래킷 잠금)
- `execute_score_steal()` - 점수 탈취 실행

### 게임 코드
- `generate_two_digit_code()` - 2자리 코드 생성 (10-99)

## 실시간 업데이트

모든 컴포넌트는 `useRealtimeSafe` 훅을 사용하여 실시간 업데이트를 지원합니다:
- 참가자 목록
- 점수판
- Year Game 진행 상황
- Score Steal 상태

## 문제 해결

### 게임 코드 오류
- 기존 게임의 `game_code` 컬럼을 `join_code`로 변경
- 2자리 숫자 제약 조건 확인

### 브래킷 미표시
- `games` 테이블에 `uses_brackets` 컬럼 확인
- `teams` 테이블에 `bracket` 컬럼 확인

### 실시간 업데이트 안됨
- Supabase Realtime 활성화 확인
- RLS 정책 확인
- 브라우저 콘솔에서 WebSocket 연결 확인
