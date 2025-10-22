# Supabase Storage 설정 가이드

## 개요
문제 이미지를 업로드하고 표시하기 위해 Supabase Storage를 사용합니다.

## 설정 방법

### 1. SQL 스크립트 실행

Supabase 대시보드에서 다음 스크립트를 실행하세요:

```bash
# Supabase SQL Editor에서 실행
scripts/031-create-storage-bucket.sql
```

또는 Supabase CLI를 사용하는 경우:

```bash
supabase db push
```

### 2. Storage 버킷 확인

1. Supabase 대시보드 → Storage 메뉴로 이동
2. `game-assets` 버킷이 생성되었는지 확인
3. 버킷 설정:
   - Public: ✅ (활성화)
   - File size limit: 5MB
   - Allowed MIME types: image/jpeg, image/jpg, image/png, image/gif, image/webp

### 3. 수동 설정 (선택사항)

SQL 스크립트가 작동하지 않는 경우, 수동으로 설정:

1. **버킷 생성**
   - Storage → New bucket
   - Name: `game-assets`
   - Public bucket: ✅
   - File size limit: 5242880 (5MB)
   - Allowed MIME types: `image/jpeg,image/jpg,image/png,image/gif,image/webp`

2. **정책 설정**
   - Policies 탭으로 이동
   - 다음 정책들을 추가:

   **Public Access (SELECT)**
   ```sql
   bucket_id = 'game-assets'
   ```

   **Authenticated Upload (INSERT)**
   ```sql
   bucket_id = 'game-assets' AND auth.role() = 'authenticated'
   ```

   **Authenticated Update (UPDATE)**
   ```sql
   bucket_id = 'game-assets' AND auth.role() = 'authenticated'
   ```

   **Authenticated Delete (DELETE)**
   ```sql
   bucket_id = 'game-assets' AND auth.role() = 'authenticated'
   ```

## 사용 방법

### 문제 이미지 업로드

1. **중앙 문제 관리**
   - 관리자 페이지 → 중앙 문제 관리
   - "문제 추가" 버튼 클릭
   - 이미지 파일 선택 및 업로드
   - 미리보기에서 이미지 확인

2. **지원 형식**
   - JPEG, JPG, PNG, GIF, WebP
   - 최대 파일 크기: 5MB
   - 권장 해상도: 1920x1080 이하

3. **이미지 최적화 팁**
   - 불필요하게 큰 이미지는 압축하여 사용
   - 투명 배경이 필요한 경우 PNG 사용
   - 일반 사진은 JPEG 사용 (파일 크기 작음)

## 문제 해결

### 이미지가 업로드되지 않는 경우

1. **Storage 버킷 확인**
   ```sql
   SELECT * FROM storage.buckets WHERE id = 'game-assets';
   ```

2. **정책 확인**
   ```sql
   SELECT * FROM storage.policies WHERE bucket_id = 'game-assets';
   ```

3. **권한 확인**
   - Supabase 대시보드에서 로그인 상태 확인
   - Authentication → Users에서 사용자 확인

### 이미지가 표시되지 않는 경우

1. **Public URL 확인**
   - Storage → game-assets 버킷
   - 업로드된 파일 클릭
   - "Get public URL" 확인

2. **CORS 설정 확인**
   - Supabase 프로젝트 설정 → API
   - CORS가 올바르게 설정되어 있는지 확인

3. **브라우저 콘솔 확인**
   - F12 → Console 탭
   - 이미지 로드 에러 메시지 확인

## 보안 고려사항

- Public 버킷이므로 URL을 아는 사람은 누구나 이미지에 접근 가능
- 민감한 정보가 포함된 이미지는 업로드하지 마세요
- 업로드는 인증된 사용자만 가능하도록 설정됨
- 파일 크기 제한으로 과도한 업로드 방지

## 참고 자료

- [Supabase Storage 문서](https://supabase.com/docs/guides/storage)
- [Storage Policies](https://supabase.com/docs/guides/storage/security/access-control)
