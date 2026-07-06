@echo off
rem Stop and remove the app container (Windows).

docker rm -f pm-app >nul 2>&1
echo App stopped
