# 프로젝트 페이지 기능 분석

## 📋 목차
1. [메인 페이지](#메인-페이지)
2. [학생용 페이지](#학생용-페이지)
3. [교사용 관리 페이지](#교사용-관리-페이지)
4. [게임 플레이 페이지](#게임-플레이-페이지)
5. [스코어보드 페이지](#스코어보드-페이지)

---

## 메인 페이지

### `/` - 홈페이지
**파일**: `app/page.tsx`

**기능**:
- 자동으로 `/join` 페이지로 리다이렉트
- 원래는 랜딩 페이지 역할 (현재 비활성화)
- 게임 소개 및 기능 설명
- 교사/학생 접근 버튼

**특징**:
- Hero 섹션
- 4가지 주요 기능 카드 (Easy Setup, BYOD Ready, Live Scoring, Structured Rounds)
- 3단계 사용 방법 안내

---

## 학생용 페이지

### `/join` - 게임 참가 메인
**파일**: `app/join/page.tsx`

**기능**:
- 게임 코드 입력 인터페이스
- 게임 참가 방법 안내
- 교사 접근 링크

**UI 요소**:
- 게임 코드 입력 필드 (최대 10자)
- 애니메이션 효과 (포커스 시 하이라이트)
- 4단계 참가 안내
- 테마 토글 버튼

### `/join/[code]` - 게임 코드별 참가
**파일**: `app/join/[code]/page.tsx`

**기능**:
- 특정 게임 코드로 직접 접근
- 게임 유효성 검증
- 참가자 이름 입력 화면 표시

**에러 처리**:
- 게임을 찾을 수 없는 경우
- 잘못된 게임 코드
- 예상치 못한 오류

### `/join-new` - 사전 등록 참가자 참가
**파일**: `app/join-new/page.tsx`

**기능**:
- 사전 등록된 참가자로 게임 참가
- 참가자 선택 인터페이스

**컴포넌트**: `JoinWithPreregisteredPlayer`

---

## 교사용 관리 페이지

### `/admin` - 교사 대시보드
**파일**: `app/admin/page.tsx`

**기능**:
- 새 게임 생성
- 최근 게임 목록 조회
- 문제 관리 접근
- 참가자 관리 접근

**주요 카드**:
1. **Create New Game**: 새 게임 생성 폼
2. **Recent Games**: 최근 게임 목록
3. **Questions Management**: 문제 관리 페이지 링크

**특징**:
- Supabase 설정 경고 표시
- 테마 토글
- 빠른 접근 팁

### `/admin/participants` - 참가자 관리
**파일**: `app/admin/participants/page.tsx`

**기능**:
- 참가자 사전 등록
- 참가자 목록 관리
- 참가자 정보 수정/삭제

**컴포넌트**: `ParticipantManager`

### `/admin/questions` - 문제 관리
**파일**: `app/admin/questions/page.tsx`

**기능**:
- Score Steal 문제 관리
- Relay Quiz 문제 관리
- 문제 업로드 및 편집
- 문제 삭제

**컴포넌트**: `CentralizedQuestionsManager`

**특징**:
- 관리자 대시보드로 돌아가기 버튼
- 중앙집중식 문제 관리

### `/admin/game/[id]` - 게임 관리 대시보드
**파일**: `app/admin/game/[id]/page.tsx`

**기능**:
- 실시간 게임 상태 모니터링
- 참가자 관리
- 팀 관리
- 게임 진행 제어

**실시간 기능**:
- Participants 실시간 업데이트
- Teams 실시간 업데이트
- Game 상태 실시간 업데이트
- Realtime 실패 시 폴링 모드로 전환 (2초 간격)

**컴포넌트**: `GameDashboard`

---

## 게임 플레이 페이지

### `/game/[id]/wait` - 대기실
**파일**: `app/game/[id]/wait/page.tsx`

**기능**:
- 게임 시작 대기
- 참가자 정보 표시
- 게임 정보 표시

**컴포넌트**: `GameWaitingRoom`

**특징**:
- 게임 시작 전 대기 화면
- 참가자 확인

### `/game/[id]/play` - 일반 게임 플레이
**파일**: `app/game/[id]/play/page.tsx`

**기능**:
- 기본 게임 플레이 화면
- 팀별 점수 표시
- 실시간 게임 진행

**리다이렉트**:
- 참가자 ID가 있으면 게임 선택 페이지로 이동

**컴포넌트**: `StudentGameView`

### `/game/[id]/year-game` - 연도 맞추기 게임
**파일**: `app/game/[id]/year-game/page.tsx`

**기능**:
- 연도 맞추기 게임 플레이
- 팀별 점수 계산
- 실시간 답안 제출

**데이터**:
- 게임 정보
- 팀 목록
- 참가자 정보

**컴포넌트**: `YearGamePlayView`

### `/game/[id]/score-steal` - 점수 가로채기 게임
**파일**: `app/game/[id]/score-steal/page.tsx`

**기능**:
- 점수 가로채기 게임 플레이
- 문제 풀이 및 점수 획득
- 다른 팀 점수 가로채기

**자동 세션 생성**:
- 현재 라운드에 세션이 없으면 자동 생성
- 세션 상태: waiting, active, completed

**컴포넌트**: `ScoreStealPlayView`

### `/game/[id]/relay-quiz` - 릴레이 퀴즈 게임
**파일**: `app/game/[id]/relay-quiz/page.tsx`

**기능**:
- 릴레이 퀴즈 게임 플레이
- 팀원 간 순차적 문제 풀이
- PQRS 시스템 (P, Q, R, S 문제)

**데이터**:
- 게임 정보
- 팀 목록
- 참가자 정보

**컴포넌트**: `RelayQuizPlayView`

---

## 스코어보드 페이지

### `/display/[gameId]` - 클린 스코어보드
**파일**: `app/display/[gameId]/page.tsx`

**기능**:
- 깔끔한 스코어보드 표시
- 실시간 점수 업데이트
- 대형 화면 표시용

**컴포넌트**: `CleanScoreboard`

**용도**:
- 프로젝터/TV 화면 표시
- 학생들에게 점수 공유

### `/scoreboard/[gameId]` - 브라켓 스코어보드
**파일**: `app/scoreboard/[gameId]/page.tsx`

**기능**:
- 토너먼트 브라켓 형식 스코어보드
- 실시간 점수 업데이트
- 경쟁 구조 시각화

**컴포넌트**: `BracketScoreboard`

**용도**:
- 토너먼트 형식 게임
- 경쟁 구조 표시

### `/year-game-scoreboard/[sessionId]` - 연도 게임 스코어보드
**파일**: `app/year-game-scoreboard/[sessionId]/page.tsx`

**기능**:
- 연도 맞추기 게임 전용 스코어보드
- 팀별 점수 및 순위 표시
- 실시간 업데이트

**컴포넌트**: `YearGameTeamScoreboard`

**특징**:
- 세션별 스코어보드
- 팀별 성적 추적

---

## 🎮 게임 타입별 정리

### 1. 일반 게임 (General Game)
- **플레이**: `/game/[id]/play`
- **대기실**: `/game/[id]/wait`
- **스코어보드**: `/display/[gameId]`, `/scoreboard/[gameId]`

### 2. 연도 맞추기 게임 (Year Game)
- **플레이**: `/game/[id]/year-game`
- **스코어보드**: `/year-game-scoreboard/[sessionId]`

### 3. 점수 가로채기 게임 (Score Steal)
- **플레이**: `/game/[id]/score-steal`
- **문제 관리**: `/admin/questions`

### 4. 릴레이 퀴즈 게임 (Relay Quiz)
- **플레이**: `/game/[id]/relay-quiz`
- **문제 관리**: `/admin/questions`

---

## 🔐 접근 권한

### 학생 접근 가능
- `/` (홈)
- `/join` (게임 참가)
- `/join/[code]` (게임 코드 참가)
- `/join-new` (사전 등록 참가)
- `/game/[id]/*` (게임 플레이)

### 교사 접근 필요
- `/admin` (대시보드)
- `/admin/participants` (참가자 관리)
- `/admin/questions` (문제 관리)
- `/admin/game/[id]` (게임 관리)

### 공개 접근
- `/display/[gameId]` (스코어보드)
- `/scoreboard/[gameId]` (브라켓 스코어보드)
- `/year-game-scoreboard/[sessionId]` (연도 게임 스코어보드)

---

## 🎨 공통 기능

### 모든 페이지
- **테마 지원**: 라이트/다크 모드
- **반응형 디자인**: 모바일, 태블릿, 데스크톱
- **애니메이션**: 부드러운 전환 효과

### 실시간 기능
- **Supabase Realtime**: 실시간 데이터 동기화
- **폴링 Fallback**: Realtime 실패 시 자동 전환
- **자동 새로고침**: 데이터 변경 시 자동 업데이트

### 에러 처리
- **404 페이지**: 존재하지 않는 페이지
- **게임 없음**: 잘못된 게임 코드
- **Supabase 오류**: 설정 경고 표시

---

## 📊 데이터 흐름

### 게임 생성 흐름
1. 교사가 `/admin`에서 게임 생성
2. 게임 코드 생성
3. QR 코드 생성
4. 게임 대시보드로 이동 (`/admin/game/[id]`)

### 학생 참가 흐름
1. 학생이 `/join`에서 게임 코드 입력
2. `/join/[code]`로 이동
3. 이름 입력 및 팀 배정
4. `/game/[id]/wait` 대기실로 이동
5. 게임 시작 시 해당 게임 타입 페이지로 이동

### 게임 진행 흐름
1. 교사가 게임 시작
2. 학생들이 게임 플레이 페이지로 이동
3. 실시간 점수 업데이트
4. 라운드 진행
5. 게임 종료 및 결과 표시

---

## 🛠️ 기술 스택

### 프레임워크
- **Next.js 15**: App Router, Server Components
- **React 18**: 클라이언트 컴포넌트

### 데이터베이스
- **Supabase**: PostgreSQL, Realtime, Auth

### UI 라이브러리
- **shadcn/ui**: 컴포넌트 라이브러리
- **Tailwind CSS**: 스타일링
- **Lucide React**: 아이콘

### 상태 관리
- **React Hooks**: useState, useEffect
- **Supabase Realtime**: 실시간 동기화

---

## 📝 주요 컴포넌트

### 게임 관련
- `GameDashboard`: 게임 관리 대시보드
- `StudentGameView`: 학생 게임 뷰
- `GameWaitingRoom`: 대기실

### 게임 타입별
- `YearGamePlayView`: 연도 게임
- `ScoreStealPlayView`: 점수 가로채기
- `RelayQuizPlayView`: 릴레이 퀴즈

### 스코어보드
- `CleanScoreboard`: 클린 스코어보드
- `BracketScoreboard`: 브라켓 스코어보드
- `YearGameTeamScoreboard`: 연도 게임 스코어보드

### 관리
- `CreateGameForm`: 게임 생성 폼
- `GamesList`: 게임 목록
- `ParticipantManager`: 참가자 관리
- `CentralizedQuestionsManager`: 문제 관리

### UI 공통
- `ThemeToggle`: 테마 전환
- `AnimatedBackground`: 배경 애니메이션
- `FloatingElements`: 떠다니는 요소
- `InteractiveCard`: 인터랙티브 카드

---

## 🔄 실시간 업데이트

### 구독 채널
1. **Participants**: 참가자 변경 감지
2. **Teams**: 팀 점수 변경 감지
3. **Games**: 게임 상태 변경 감지
4. **Score Steal Sessions**: 점수 가로채기 세션 변경
5. **Relay Quiz Sessions**: 릴레이 퀴즈 세션 변경

### Fallback 메커니즘
- Realtime 연결 실패 시 폴링 모드로 자동 전환
- 2초 간격으로 데이터 새로고침
- 사용자에게 투명하게 처리

---

## 🎯 주요 기능 요약

### 교사용
✅ 게임 생성 및 관리
✅ 참가자 사전 등록
✅ 문제 업로드 및 관리
✅ 실시간 게임 모니터링
✅ 팀 배정 및 점수 관리

### 학생용
✅ 간편한 게임 참가 (코드 입력)
✅ 다양한 게임 타입 플레이
✅ 실시간 점수 확인
✅ 모바일 친화적 인터페이스

### 스코어보드
✅ 대형 화면 표시용 스코어보드
✅ 실시간 점수 업데이트
✅ 다양한 스코어보드 형식

---

## 📱 반응형 디자인

### 모바일 (< 768px)
- 세로 레이아웃
- 터치 친화적 버튼
- 간소화된 UI

### 태블릿 (768px - 1024px)
- 2열 그리드
- 중간 크기 컴포넌트

### 데스크톱 (> 1024px)
- 3-4열 그리드
- 전체 기능 표시
- 대형 스코어보드

---

이 문서는 프로젝트의 모든 페이지와 기능을 정리한 것입니다.
각 페이지의 역할과 기능을 이해하는 데 도움이 되길 바랍니다.
