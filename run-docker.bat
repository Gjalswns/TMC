@echo off
echo Running TMC Game Platform with Docker Compose...
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Docker is not installed or not in PATH
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM Check if .env.local exists
if not exist ".env.local" (
    echo Error: .env.local file not found
    echo Please create .env.local with your Supabase configuration:
    echo.
    echo NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
    echo NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
    echo.
    pause
    exit /b 1
)

echo Starting Docker Compose...
echo.
docker-compose up --build

if %errorlevel% neq 0 (
    echo Error: Docker Compose failed
    pause
    exit /b 1
)

echo.
echo Application should be running at http://localhost:3000
pause