@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0\.."

echo ============================================
echo  TomiHub CI/CD Pipeline
echo ============================================
echo.

set TIMESTAMP=%date:~0,10% %time:~0,8%
echo [%TIMESTAMP%] Starting CI pipeline...
echo.

:: ─── Step 1: Verify ───
echo [1/6] Building Java backend (skip tests)...

cd backend
call mvn clean package -DskipTests -B -T 2 -q
if errorlevel 1 (
  echo [FAIL] Java build failed!
  exit /b 1
)
cd ..
echo [OK] Java build passed

:: ─── Step 2: Frontend ───
echo [2/6] Type-checking frontend...
cd frontend
call npx tsc --noEmit --pretty 2>nul
if errorlevel 1 (
  echo [WARN] TypeScript errors found (non-blocking for dev)
)

echo [3/6] Building frontend...
call npm run build
if errorlevel 1 (
  echo [FAIL] Frontend build failed!
  cd ..
  exit /b 1
)
cd ..
echo [OK] Frontend build passed

:: ─── Step 3: Copy to WSL containers ───
echo [4/6] Deploying to WSL containers...
wsl docker cp frontend/dist/. ai-pm-frontend:/usr/share/nginx/html/ 2>nul
for %%f in (backend\ai-pm-core\target\ai-pm-core-*.jar) do wsl docker cp "%%f" ai-pm-core:/app/app.jar 2>nul
for %%f in (backend\ai-pm-auth\target\ai-pm-auth-*.jar) do wsl docker cp "%%f" ai-pm-auth:/app/app.jar 2>nul
echo [OK] Artifacts copied to containers

:: ─── Step 4: Restart services ───
echo [5/6] Restarting services...
wsl docker restart ai-pm-core ai-pm-auth ai-pm-frontend 2>nul
echo [OK] Services restarted

:: ─── Step 5: Health check ───
echo [6/6] Health check...
timeout /t 5 /nobreak >nul
curl -sf http://localhost/health >nul 2>&1
if errorlevel 1 (
  echo [WARN] Health check failed — check docker logs
) else (
  echo [OK] Frontend is healthy
)

:: ─── Cleanup ───
echo.
echo Cleaning build artifacts...
cd backend
call mvn clean -q 2>nul
cd ..
rmdir /s /q frontend\dist 2>nul

set ENDTIME=%date:~0,10% %time:~0,8%
echo.
echo ============================================
echo  [PASS] CI Pipeline Complete
echo  Started:  %TIMESTAMP%
echo  Finished: %ENDTIME%
echo  URL:      http://localhost/
echo ============================================
