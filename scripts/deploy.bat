@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0\.."

echo ============================================
echo  TomiHub Quick Deploy
echo ============================================

if "%1"=="" (
  echo Usage: deploy.bat [frontend^|core^|auth^|all]
  echo   frontend  - Build React app on Windows, copy to WSL container
  echo   core      - Build Java core module, copy to WSL container
  echo   auth      - Build Java auth module, copy to WSL container
  echo   all       - Build and deploy everything
  exit /b 1
)

if "%1"=="frontend" goto :frontend
if "%1"=="core" goto :core
if "%1"=="auth" goto :auth
if "%1"=="all" goto :all
echo Unknown target: %1
exit /b 1

:frontend
echo [1/2] Building frontend on Windows...
cd frontend
call npm run build
if errorlevel 1 (echo FRONTEND BUILD FAILED & exit /b 1)
cd ..
echo [2/2] Copying to WSL container...
wsl docker cp frontend/dist/. ai-pm-frontend:/usr/share/nginx/html/
if errorlevel 1 (echo DEPLOY FAILED & exit /b 1)
echo [OK] Frontend deployed! Refresh browser to see changes.
echo Cleanup: rmdir /s /q frontend\dist 2>nul
exit /b 0

:core
echo [1/3] Building ai-pm-core on Windows...
cd backend
call mvn clean install -DskipTests -B -T 2 -pl ai-pm-core -am
if errorlevel 1 (echo BUILD FAILED & exit /b 1)
cd ..
echo [2/3] Copying to WSL container...
for %%f in (backend\ai-pm-core\target\ai-pm-core-*.jar) do wsl docker cp "%%f" ai-pm-core:/app/app.jar
if errorlevel 1 (echo COPY FAILED & exit /b 1)
echo [3/3] Restarting core container...
wsl docker restart ai-pm-core
echo [OK] Core deployed! Cleanup: mvn clean
cd backend & call mvn clean -q & cd ..
exit /b 0

:auth
echo [1/3] Building ai-pm-auth on Windows...
cd backend
call mvn clean install -DskipTests -B -T 2 -pl ai-pm-auth -am
if errorlevel 1 (echo BUILD FAILED & exit /b 1)
cd ..
echo [2/3] Copying to WSL container...
for %%f in (backend\ai-pm-auth\target\ai-pm-auth-*.jar) do wsl docker cp "%%f" ai-pm-auth:/app/app.jar
if errorlevel 1 (echo COPY FAILED & exit /b 1)
echo [3/3] Restarting auth container...
wsl docker restart ai-pm-auth
echo [OK] Auth deployed! Cleanup: mvn clean
cd backend & call mvn clean -q & cd ..
exit /b 0

:all
echo ============================================
echo  Building ALL modules...
echo ============================================

echo.
echo --- Building Java backend ---
cd backend
call mvn clean install -DskipTests -B -T 2
if errorlevel 1 (echo JAVA BUILD FAILED & exit /b 1)
cd ..

echo.
echo --- Building frontend ---
cd frontend
call npm run build
if errorlevel 1 (echo FRONTEND BUILD FAILED & exit /b 1)
cd ..

echo.
echo --- Deploying to WSL containers ---
wsl docker cp backend/ai-pm-auth/target/ai-pm-auth-*.jar ai-pm-auth:/app/app.jar
wsl docker cp backend/ai-pm-core/target/ai-pm-core-*.jar ai-pm-core:/app/app.jar
wsl docker cp frontend/dist/. ai-pm-frontend:/usr/share/nginx/html/

echo.
echo --- Restarting containers ---
wsl docker restart ai-pm-auth ai-pm-core ai-pm-frontend

echo.
echo [OK] All modules deployed and restarted!
echo Frontend: http://localhost/
exit /b 0
