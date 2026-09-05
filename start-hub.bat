@echo off
chcp 65001 >nul
title AI Context Hub
cd /d "%~dp0"

set "TARGET_DIR=%~1"
if "%TARGET_DIR%"=="" (
    set "TARGET_DIR=%~dp0"
)

echo ========================================================
echo   🤖 AI CONTEXT HUB
echo   📁 Target Folder: %TARGET_DIR%
echo   🌐 Port: 4001
echo ========================================================
echo.
echo * ทริก: สามารถลากโฟลเดอร์ใดก็ได้มาวางใส่ start-hub.bat
echo   หรือเปลี่ยนโฟลเดอร์บนหน้าเว็บ http://localhost:4001 ได้ทันที!
echo.

start "" http://localhost:4001
node "%~dp0tools\ai-context-hub\server.js" "%TARGET_DIR%"

pause