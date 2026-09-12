@echo off
setlocal
cd /d "%~dp0"
title NGAN HANG DE THI - DONG GOI BO CAI DESKTOP
where node >nul 2>nul
if errorlevel 1 goto no_node
if not exist web\node_modules goto no_web
if not exist web\server\.env goto no_web
if exist desktop\node_modules\electron-builder goto build
echo [1/2] Cai dat Electron va electron-builder - can Internet trong lan dau...
call npm install --prefix desktop --no-audit --no-fund
if errorlevel 1 goto fail
:build
echo [2/2] Build va dong goi bo cai Windows...
call npm --prefix desktop run dist
if errorlevel 1 goto fail
echo.
echo Xong. Bo cai nam trong thu muc desktop\release
start "" "%~dp0desktop\release"
pause
exit /b 0
:no_node
echo Chua tim thay Node.js. Cai Node.js 22 tro len, sau do mo lai file nay.
pause
exit /b 1
:no_web
echo Hay chay CAI-DAT-VA-CHAY.bat mot lan truoc de cai dat ung dung web trong thu muc web.
pause
exit /b 1
:fail
echo.
echo Co loi. Hay chup lai dong loi phia tren de kiem tra.
pause
exit /b 1
