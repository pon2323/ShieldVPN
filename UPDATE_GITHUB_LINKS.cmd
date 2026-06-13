@echo off
setlocal
set /p GH_USER=Enter your GitHub username: 
set /p GH_REPO=Enter your repository name: 
if "%GH_USER%"=="" goto bad
if "%GH_REPO%"=="" goto bad
powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content docs\index.html) -replace 'YOUR_GITHUB_LOGIN','%GH_USER%' -replace 'YOUR_REPOSITORY_NAME','%GH_REPO%' | Set-Content docs\index.html -Encoding UTF8"
powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content docs\updates\version.json) -replace 'YOUR_GITHUB_LOGIN','%GH_USER%' -replace 'YOUR_REPOSITORY_NAME','%GH_REPO%' | Set-Content docs\updates\version.json -Encoding UTF8"
powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content launcher\main.js) -replace 'YOUR_GITHUB_LOGIN','%GH_USER%' -replace 'YOUR_REPOSITORY_NAME','%GH_REPO%' | Set-Content launcher\main.js -Encoding UTF8"
echo.
echo Links updated for %GH_USER%/%GH_REPO%.
echo Now rebuild Launcher after changing links.
pause
exit /b 0
:bad
echo GitHub username/repo cannot be empty.
pause
exit /b 1
