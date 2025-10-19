@echo off
echo Building TMC Game Platform Docker Image...
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Docker is not installed or not in PATH
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo Docker found. Starting build process...
echo.

REM Build the Docker image
echo Building Docker image...
docker build -t tmc-game-platform .

if %errorlevel% neq 0 (
    echo Error: Docker build failed
    pause
    exit /b 1
)

echo.
echo ✅ Docker image built successfully!
echo.
echo To run the container:
echo   docker run -p 3000:3000 --env-file .env.local tmc-game-platform
echo.
echo Or use Docker Compose:
echo   docker-compose up
echo.
pause