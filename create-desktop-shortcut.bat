@echo off
chcp 65001 >nul
title Create Desktop Shortcut

echo 正在创建桌面快捷方式...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$WSH=New-Object -ComObject WScript.Shell;" ^
  "$SC=$WSH.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\CollabStudio.lnk');" ^
  "$SC.TargetPath='%~dp0start-collab-studio.bat';" ^
  "$SC.WorkingDirectory='%~dp0';" ^
  "$SC.Description='CollabStudio - creative studio';" ^
  "$SC.Save();" ^
  "Write-Host 'Done';"

if exist "%USERPROFILE%\Desktop\CollabStudio.lnk" (
  echo.
  echo [OK] 快捷方式已创建到桌面
) else (
  echo.
  echo 请手动将 start-collab-studio.bat 发送到桌面快捷方式
)

pause
