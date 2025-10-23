# 🔄 완전 재시작 가이드

## 문제
Supabase 스키마 캐시가 이전 데이터베이스 구조를 기억하고 있어서 `winner_team_id` 외래키를 계속 찾고 있습니다.

## 해결 방법

### 1. 개발 서버 완전 종료
```bash
# Ctrl+C로 서버 중지
# 그리고 프로세스 확인
tasklist | findstr node
# 남아있는 node 프로세스 강제 종료
taskkill /F /IM node.exe
```

### 2. Next.js 캐시 삭제
```bash
rm -rf .next
rm -rf node_modules/.cache
```

### 3. 브라우저 캐시 삭제
- Chrome: Ctrl+Shift+Delete
- 또는 시크릿 모드로 테스트

### 4. 환경 변수 확인
`.env.local` 파일이 새 Supabase 프로젝트를 가리키는지 확인:
```
NEXT_PUBLIC_SUPABASE_URL=https://sualrmpxclffbuhgoxpt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 5. 서버 재시작
```bash
npm run dev
```

### 6. Supabase 스키마 캐시 새로고침
Supabase SQL Editor에서 실행:
```sql
NOTIFY pgrst, 'reload schema';
```

## 또는 더 간단한 방법

### 옵션 A: 완전히 새로 시작
```bash
# 1. 서버 중지
# 2. 캐시 삭제
rm -rf .next
# 3. 재시작
npm run dev
```

### 옵션 B: 다른 포트로 실행
```bash
PORT=3001 npm run dev
```

## 확인 사항

새로 시작한 후:
1. 브라우저 콘솔에서 에러 확인
2. 네트워크 탭에서 Supabase 요청 확인
3. 새 프로젝트 URL이 맞는지 확인

## 여전히 문제가 있다면

코드에서 직접 참조하는 부분이 있을 수 있습니다. 다음 파일들을 확인:
- `lib/score-steal-actions.ts`
- `components/score-steal-*.tsx`
- `hooks/use-score-steal-*.ts`
