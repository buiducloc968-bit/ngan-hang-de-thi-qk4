@echo off
setlocal
cd /d "%~dp0"
title NGAN HANG DE THI - BAN DESKTOP
where node >nul 2>nul
if errorlevel 1 goto no_node
if not exist web\node_modules goto no_web
if not exist web\server\.env goto no_web
if exist desktop\node_modules\electron goto run
echo [1/2] Cai dat Electron cho ban desktop - can Internet trong lan dau...
call npm install --prefix desktop --no-audit --no-fund
if errorlevel 1 goto fail
:run
echo [2/2] Khoi dong ban desktop...
call npm --prefix desktop start
if errorlevel 1 goto fail
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
