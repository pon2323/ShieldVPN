@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo =============================================
echo ShieldVPN build helper
echo =============================================

echo.
echo [1/6] Checking sing-box.exe...
if not exist "client\engines\sing-box.exe" (
  echo sing-box.exe not found. Downloading official Windows amd64 release...
  curl -L -o sing-box.zip "https://github.com/SagerNet/sing-box/releases/download/v1.13.13/sing-box-1.13.13-windows-amd64.zip"
  if errorlevel 1 goto fail
  tar -xf sing-box.zip
  if errorlevel 1 goto fail
  copy /Y "sing-box-1.13.13-windows-amd64\sing-box.exe" "client\engines\sing-box.exe"
  if errorlevel 1 goto fail
) else (
  echo sing-box.exe already exists.
)

echo.
echo [2/6] Installing client dependencies...
cd /d "%~dp0client"
call npm.cmd install
if errorlevel 1 goto fail

echo.
echo [3/6] Building ShieldVPN Client...
call npm.cmd run build
if errorlevel 1 goto fail

echo.
echo [4/6] Installing launcher dependencies...
cd /d "%~dp0launcher"
call npm.cmd install
if errorlevel 1 goto fail

echo.
echo [5/6] Building ShieldVPN Launcher...
call npm.cmd run build
if errorlevel 1 goto fail

echo.
echo [6/6] Copying installers to docs folder...
cd /d "%~dp0"
copy /Y "client\dist\ShieldVPNClientSetup.exe" "docs\ShieldVPNClientSetup.exe"
copy /Y "launcher\dist\ShieldVPNLauncherSetup.exe" "docs\ShieldVPNLauncherSetup.exe"

echo.
echo DONE.
echo Client:   client\dist\ShieldVPNClientSetup.exe
echo Launcher: launcher\dist\ShieldVPNLauncherSetup.exe
echo Site:     docs\index.html
echo.
pause
exit /b 0

:fail
echo.
echo BUILD FAILED. Scroll above and send the red/error lines.
pause
exit /b 1
