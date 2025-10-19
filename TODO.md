# 📋 내일 작업 사항 (우선순위 순)

작성일: 2025년 10월 18일

---

## 🔴 긴급 (High Priority)

### 1. Supabase 데이터베이스 마이그레이션 실행 ⚠️

**필수 스크립트 실행 순서:**

```sql
-- Supabase Dashboard → SQL Editor에서 순서대로 실행

1. scripts/022-score-steal-realtime-competition.sql
   → Score Steal 실시간 경쟁 모드 테이블 및 함수 생성

2. scripts/023-remove-security-definer-views.sql
   → SECURITY DEFINER 경고 해결

3. scripts/024-fix-realtime-participants.sql
   → Realtime 구독 오류 해결
```

**상세 가이드**: `SUPABASE_FIXES.md` 파일 참조

### 2. Supabase Realtime 활성화 🔌

**Database → Replication 메뉴에서 활성화:**

- [x] 필수 테이블 (3개)
  - `games`
  - `teams`
  - `participants`

- [x] Year Game (3개)
  - `year_game_sessions`
  - `year_game_results`
  - `year_game_attempts`

- [x] Score Steal (4개)
  - `score_steal_sessions`
  - `score_steal_attempts`
  - `score_steal_questions`
  - `score_steal_protected_teams`

- [x] Relay Quiz (4개)
  - `relay_quiz_sessions`
  - `relay_quiz_questions`
  - `relay_quiz_team_progress`
  - `relay_quiz_attempts`

**확인 쿼리:**
```sql
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```

---

## 🟡 중요 (Medium Priority)

### 3. 게임 기능 테스트 🧪

#### Year Game
- [ ] 게임 생성 및 시작
- [ ] 숫자 범위별 점수 확인 (1~9: 10점, 90~99: 100점)
- [ ] 타이머 정확도 테스트 (화면 전환 후)
- [ ] 여러 팀이 동시에 숫자 입력
- [ ] 계산기 기능 테스트

#### Score Steal Game (새로운 실시간 경쟁 모드)
- [ ] 문제 등록 (라운드당 1개)
- [ ] 문제 공개 → 모든 팀에게 동시 표시
- [ ] 여러 팀 동시 정답 제출
- [ ] 가장 빠른 정답자 승리 확인
- [ ] 승자의 타겟 선택 (보호된 팀 제외)
- [ ] 점수 이동 실행
- [ ] 다음 라운드에서 피해 팀 보호 확인

#### Relay Quiz Game
- [ ] 문제 등록
- [ ] 순차적 문제 진행
- [ ] 팀 진행 상황 확인

### 4. 성능 및 오류 확인 📊

**브라우저 콘솔 체크:**
- [ ] Realtime 구독 오류 사라졌는지 확인
  - ❌ ~~"Failed to subscribe to participants table"~~
  - ✅ "Successfully subscribed to participants table"
  
- [ ] SECURITY DEFINER 경고 사라졌는지 확인

**Network 탭 체크:**
- [ ] WebSocket 연결 상태 확인
- [ ] API 호출 응답 시간 확인
- [ ] 오류 응답 확인

---

## 🟢 선택 (Low Priority)

### 5. UI/UX 개선 사항 검토 ✨

- [ ] 모바일 반응형 테스트
- [ ] 버튼 클릭 피드백 확인
- [ ] 로딩 상태 표시 확인
- [ ] 에러 메시지 명확성 확인

### 6. 문서 업데이트 📚

- [ ] `README.md` 업데이트
  - 새로운 점수 시스템 설명
  - Score Steal 실시간 모드 설명
  
- [ ] 배포 가이드 확인
  - `DEPLOYMENT_GUIDE.md`
  
- [ ] API 문서 확인

---

## 🐛 알려진 이슈 (해결 필요)

### 1. 게임 생성 버튼 ✅ (해결됨)
- **문제**: 버튼 클릭 안됨
- **해결**: `lib/game-actions.ts`에서 `rounds` 파라미터 처리 수정
- **상태**: ✅ 완료

### 2. Year Game 타이머 초기화 ✅ (해결됨)
- **문제**: 화면 전환 시 타이머 리셋
- **해결**: 서버 시간 기반 계산으로 변경
- **상태**: ✅ 완료

### 3. Realtime 구독 실패 ⚠️ (스크립트 준비 완료, 실행 필요)
- **문제**: `participants` 테이블 구독 실패
- **해결**: `scripts/024-fix-realtime-participants.sql` 실행
- **상태**: ⏳ 스크립트 준비됨, Supabase에서 실행 필요

### 4. SECURITY DEFINER 경고 ⚠️ (스크립트 준비 완료, 실행 필요)
- **문제**: `v_lock_conflicts` 뷰 보안 경고
- **해결**: `scripts/023-remove-security-definer-views.sql` 실행
- **상태**: ⏳ 스크립트 준비됨, Supabase에서 실행 필요

---

## 📖 참고 문서

### 구현 완료 문서
1. `IMPLEMENTATION_NOTES.md` - 게임 점수 시스템 업데이트
2. `SUPABASE_FIXES.md` - Supabase 오류 해결 가이드
3. `TIMER_FIX.md` - Year Game 타이머 수정 내역

### 마이그레이션 스크립트
1. `scripts/022-score-steal-realtime-competition.sql` - Score Steal 새 모드
2. `scripts/023-remove-security-definer-views.sql` - 보안 경고 해결
3. `scripts/024-fix-realtime-participants.sql` - Realtime 수정

---

## ⏱️ 예상 소요 시간

| 작업 | 예상 시간 | 중요도 |
|------|----------|--------|
| Supabase 스크립트 실행 | 15분 | 🔴 긴급 |
| Realtime 활성화 | 10분 | 🔴 긴급 |
| Year Game 테스트 | 20분 | 🟡 중요 |
| Score Steal 테스트 | 30분 | 🟡 중요 |
| Relay Quiz 테스트 | 15분 | 🟡 중요 |
| 오류 확인 및 수정 | 30분 | 🟡 중요 |
| UI/UX 검토 | 20분 | 🟢 선택 |
| 문서 업데이트 | 20분 | 🟢 선택 |

**총 예상 시간**: 약 2.5~3시간

---

## ✅ 완료 체크리스트

### 데이터베이스
- [ ] `022-score-steal-realtime-competition.sql` 실행
- [ ] `023-remove-security-definer-views.sql` 실행
- [ ] `024-fix-realtime-participants.sql` 실행
- [ ] Realtime 활성화 (14개 테이블)
- [ ] 스크립트 실행 결과 확인

### 테스트
- [ ] 게임 생성 버튼 작동 확인
- [ ] Year Game 전체 플로우
- [ ] Score Steal 실시간 경쟁 모드
- [ ] Relay Quiz 기본 기능
- [ ] 타이머 정확도
- [ ] 다중 참가자 동시 접속

### 오류 해결
- [ ] Realtime 구독 오류 해결
- [ ] SECURITY DEFINER 경고 해결
- [ ] 브라우저 콘솔 오류 없음
- [ ] Network 오류 없음

### 문서화
- [ ] 테스트 결과 기록
- [ ] 발견된 버그 문서화
- [ ] README 업데이트

---

## 🚨 주의사항

1. **백업 먼저!**
   - Supabase에서 스크립트 실행 전 데이터베이스 백업
   - Dashboard → Database → Backups

2. **순서 중요!**
   - 스크립트는 반드시 순서대로 실행
   - 022 → 023 → 024

3. **테스트 환경**
   - 가능하면 개발 환경에서 먼저 테스트
   - 프로덕션은 학생들이 없는 시간에 배포

4. **롤백 계획**
   - 문제 발생 시 이전 백업으로 복구
   - 스크립트 실행 전 git commit

---

## 💡 추가 개선 아이디어 (향후)

### 단기 (1-2주)
- [ ] 게임 통계 대시보드
- [ ] 참가자별 성적 리포트
- [ ] 게임 히스토리 조회
- [ ] 엑셀 내보내기 기능

### 중기 (1개월)
- [ ] 소리/알림 효과 추가
- [ ] 애니메이션 개선
- [ ] 다크 모드 지원
- [ ] 커스텀 테마

### 장기 (3개월+)
- [ ] AI 기반 문제 추천
- [ ] 게임 템플릿 저장/공유
- [ ] 학급 간 대전 모드
- [ ] 리더보드 시스템

---

## 📞 문의 사항

문제 발생 시 확인할 것:
1. 브라우저 콘솔 (F12)
2. Supabase Dashboard → Logs
3. Network 탭
4. `SUPABASE_FIXES.md` 트러블슈팅 섹션

---

**마지막 업데이트**: 2025-10-18
**다음 업데이트 예정**: 내일 작업 완료 후

