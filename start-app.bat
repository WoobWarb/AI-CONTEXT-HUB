@echo off
chcp 65001 >nul
title AI Context Hub - Desktop
cd /d "%~dp0"

set "TARGET_DIR=%~1"
if "%TARGET_DIR%"=="" (
    set "TARGET_DIR=%~dp0"
)

echo ========================================================
echo   🤖 AI CONTEXT HUB (Desktop Application)
echo   📁 Target Folder: %TARGET_DIR%
echo ========================================================
echo.
echo Starting AI Context Hub Desktop App...

npx electron desktop/main.cjs "%TARGET_DIR%"
