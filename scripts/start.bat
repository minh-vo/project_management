@echo off
rem Build and run the app container (Windows).
cd /d "%~dp0.."

docker build -t pm-app . || exit /b 1
docker rm -f pm-app >nul 2>&1
docker run -d --name pm-app --env-file .env -p 8000:8000 -v pm-data:/data pm-app || exit /b 1

echo App running at http://localhost:8000
