# AWS EC2 배포 가이드

## 준비물
- AWS 계정
- 로컬에 Docker 설치 (선택사항)

## 1단계: EC2 인스턴스 생성

### AWS Console에서:
1. EC2 대시보드 접속
2. "인스턴스 시작" 클릭
3. 설정:
   - **이름**: tmc-game-platform
   - **AMI**: Ubuntu Server 22.04 LTS
   - **인스턴스 타입**: t3.small (또는 t3.medium - 게임 참가자 수에 따라)
   - **키 페어**: 새로 생성하거나 기존 것 사용 (다운로드 필수!)
   - **네트워크 설정**:
     - SSH (포트 22) - 내 IP만 허용
     - HTTP (포트 80) - 모든 곳에서 허용
     - HTTPS (포트 443) - 모든 곳에서 허용
     - 사용자 지정 TCP (포트 3000) - 모든 곳에서 허용
   - **스토리지**: 20GB gp3

4. "인스턴스 시작" 클릭

## 2단계: EC2 접속

### Windows (PowerShell):
```powershell
ssh -i "your-key.pem" ubuntu@your-ec2-public-ip
```

### Mac/Linux:
```bash
chmod 400 your-key.pem
ssh -i "your-key.pem" ubuntu@your-ec2-public-ip
```

## 3단계: 서버 환경 설정

EC2에 접속한 후:

```bash
# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# Docker 설치
sudo apt install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ubuntu

# Git 설치
sudo apt install -y git

# 재접속 (docker 그룹 적용)
exit
```

다시 SSH 접속 후:

```bash
# Docker 작동 확인
docker --version
```

## 4단계: 코드 배포

### 방법 A: Git으로 배포 (추천)

```bash
# GitHub에 코드 푸시 후
git clone https://github.com/your-username/your-repo.git
cd your-repo

# 환경 변수 설정
nano .env.local
```

`.env.local` 내용:
```
NEXT_PUBLIC_SUPABASE_URL=https://sualrmpxclffbuhgoxpt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

저장: `Ctrl+X`, `Y`, `Enter`

### 방법 B: 직접 파일 업로드

로컬에서:
```bash
# 프로젝트 압축
tar -czf project.tar.gz .

# EC2로 전송
scp -i "your-key.pem" project.tar.gz ubuntu@your-ec2-ip:~/

# EC2에서 압축 해제
ssh -i "your-key.pem" ubuntu@your-ec2-ip
tar -xzf project.tar.gz
```

## 5단계: Docker로 실행

```bash
# Docker 이미지 빌드
docker build -t tmc-game-platform .

# 컨테이너 실행
docker run -d \
  --name tmc-game \
  -p 3000:3000 \
  --env-file .env.local \
  --restart unless-stopped \
  tmc-game-platform

# 로그 확인
docker logs -f tmc-game
```

## 6단계: 접속 확인

브라우저에서:
```
http://your-ec2-public-ip:3000
```

## 7단계: 도메인 연결 (선택사항)

### Route 53 사용:
1. Route 53에서 호스팅 영역 생성
2. A 레코드 추가: EC2 퍼블릭 IP 연결
3. 네임서버를 도메인 등록업체에 설정

### Nginx + SSL 설정:

```bash
# Nginx 설치
sudo apt install -y nginx certbot python3-certbot-nginx

# Nginx 설정
sudo nano /etc/nginx/sites-available/tmc-game
```

내용:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.io 지원
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# 설정 활성화
sudo ln -s /etc/nginx/sites-available/tmc-game /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# SSL 인증서 설치
sudo certbot --nginx -d your-domain.com
```

## 유용한 명령어

```bash
# 컨테이너 상태 확인
docker ps

# 로그 보기
docker logs tmc-game

# 컨테이너 재시작
docker restart tmc-game

# 컨테이너 중지
docker stop tmc-game

# 컨테이너 삭제
docker rm tmc-game

# 이미지 재빌드 후 재시작
docker stop tmc-game
docker rm tmc-game
docker build -t tmc-game-platform .
docker run -d --name tmc-game -p 3000:3000 --env-file .env.local --restart unless-stopped tmc-game-platform
```

## 업데이트 방법

```bash
# Git 사용 시
cd your-repo
git pull
docker stop tmc-game
docker rm tmc-game
docker build -t tmc-game-platform .
docker run -d --name tmc-game -p 3000:3000 --env-file .env.local --restart unless-stopped tmc-game-platform
```

## 비용 예상
- **t3.small**: 월 약 $15-20
- **t3.medium**: 월 약 $30-40
- **데이터 전송**: 월 1GB 무료, 이후 GB당 $0.09

## 문제 해결

### 포트 3000에 접속 안 됨
- EC2 보안 그룹에서 포트 3000 인바운드 규칙 확인
- 방화벽 확인: `sudo ufw status`

### Docker 권한 에러
```bash
sudo usermod -aG docker ubuntu
exit
# 재접속
```

### 메모리 부족
- 더 큰 인스턴스 타입으로 변경 (t3.medium)
- 또는 스왑 메모리 추가

### 로그 확인
```bash
docker logs tmc-game --tail 100 -f
```
