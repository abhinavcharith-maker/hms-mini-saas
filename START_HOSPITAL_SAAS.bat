@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo   VerdantCare HMS - Mini Hospital Management ^& Referral SaaS
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is required. Please install Node.js 20+ from https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is required. Please install Node.js 20+.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    echo Creating .env from .env.example...
    copy ".env.example" ".env" >nul
  ) else (
    echo [ERROR] Missing .env and .env.example.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Verifying database and applying migrations...
call npx prisma generate
if errorlevel 1 (
  echo [ERROR] Prisma client generation failed.
  pause
  exit /b 1
)

call npx prisma migrate deploy
if errorlevel 1 (
  echo [ERROR] Database migration failed. Verify DATABASE_URL in .env.
  pause
  exit /b 1
)

if not exist ".next" (
  echo Building production bundle...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
  )
)

echo Starting VerdantCare HMS on http://localhost:3000 ...
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
call npm run start
pause
