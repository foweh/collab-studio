@echo off
chcp 65001 >nul
title PySceneDetect Visualizer

echo ================================================
echo          PySceneDetect Visualizer
echo ================================================
echo.
echo Usage:
echo 1. Copy your video file to this folder
echo 2. Enter the video filename (e.g.: video.mp4)
echo 3. Wait for analysis, visualization page will open
echo.

set /p VIDEO_FILE=Enter video filename: 

if not exist "%VIDEO_FILE%" (
    echo Error: File not found - %VIDEO_FILE%
    pause
    exit /b 1
)

echo.
echo Analyzing video...
echo.

python run_scenedetect.py "%VIDEO_FILE%"

echo.
echo ================================================
echo Analysis complete! Opening visualization...
echo ================================================

start visualize.html

pause