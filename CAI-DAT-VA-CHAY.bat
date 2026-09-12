@echo off
setlocal
cd /d "%~dp0web"
title NGAN HANG CAU HOI - CAI DAT
where node >nul 2>nul
if errorlevel 1 goto no_node
echo [1/3] Cai dat thu vien - can Internet trong lan dau...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
echo [2/3] Khoi tao du lieu va build phan mem...
call npm run setup
if errorlevel 1 goto fail
echo [3/3] Khoi dong phan mem. DUNG DONG CUA SO NAY.
node scripts\launch.mjs
if errorlevel 1 goto fail
exit /b 0
:no_node
echo Chua tim thay Node.js. Cai Node.js 22 tro len, sau do mo lai file nay.
pause
exit /b 1
:fail
echo.
echo Co loi. Hay chup lai dong loi phia tren de kiem tra.
pause
exit /b 1
