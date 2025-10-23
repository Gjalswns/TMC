#!/bin/bash

# TMC Game Platform - 배포 스크립트
# EC2에서 실행하세요

echo "🚀 TMC Game Platform 배포 시작..."

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 기존 컨테이너 중지 및 삭제
echo -e "${YELLOW}📦 기존 컨테이너 정리 중...${NC}"
if [ "$(docker ps -q -f name=tmc-game)" ]; then
    docker stop tmc-game
    echo -e "${GREEN}✓ 컨테이너 중지됨${NC}"
fi

if [ "$(docker ps -aq -f name=tmc-game)" ]; then
    docker rm tmc-game
    echo -e "${GREEN}✓ 컨테이너 삭제됨${NC}"
fi

# 2. 환경 변수 파일 확인
if [ ! -f .env.local ]; then
    echo -e "${RED}❌ .env.local 파일이 없습니다!${NC}"
    echo "다음 내용으로 .env.local 파일을 생성하세요:"
    echo ""
    echo "NEXT_PUBLIC_SUPABASE_URL=your-supabase-url"
    echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key"
    exit 1
fi

# 3. Docker 이미지 빌드
echo -e "${YELLOW}🔨 Docker 이미지 빌드 중...${NC}"
docker build -t tmc-game-platform . || {
    echo -e "${RED}❌ 빌드 실패${NC}"
    exit 1
}
echo -e "${GREEN}✓ 이미지 빌드 완료${NC}"

# 4. 컨테이너 실행
echo -e "${YELLOW}🚀 컨테이너 시작 중...${NC}"
docker run -d \
  --name tmc-game \
  -p 3000:3000 \
  --env-file .env.local \
  --restart unless-stopped \
  tmc-game-platform || {
    echo -e "${RED}❌ 컨테이너 시작 실패${NC}"
    exit 1
}

echo -e "${GREEN}✓ 컨테이너 시작됨${NC}"

# 5. 상태 확인
echo ""
echo -e "${YELLOW}📊 컨테이너 상태:${NC}"
docker ps -f name=tmc-game

# 6. 로그 확인
echo ""
echo -e "${YELLOW}📝 최근 로그 (10초 후 종료):${NC}"
timeout 10 docker logs -f tmc-game || true

echo ""
echo -e "${GREEN}✅ 배포 완료!${NC}"
echo ""
echo "접속 주소: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
echo ""
echo "유용한 명령어:"
echo "  로그 보기: docker logs -f tmc-game"
echo "  재시작: docker restart tmc-game"
echo "  중지: docker stop tmc-game"
