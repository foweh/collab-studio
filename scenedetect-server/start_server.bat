@echo off
title PySceneDetect Server
cd /d "%~dp0"

echo Installing Flask...
python -m pip install flask --quiet

echo Starting server...
start http://localhost:5000
python server.py