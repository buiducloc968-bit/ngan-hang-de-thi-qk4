@echo off
setlocal
cd /d "%~dp0web"
title NGAN HANG CAU HOI - DUNG DONG CUA SO NAY
if not exist server\.env goto setup
if not exist node_modules goto setup
if not exist server\dist\index.js goto setup
if not exist client\dist\index.html goto setup
node scripts\launch.mjs
if errorlevel 1 pause
exit /b
:setup
echo Hay chay CAI-DAT-VA-CHAY.bat trong lan dau.
pause
