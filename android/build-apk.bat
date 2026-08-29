@echo off
chcp 65001 >nul
title Collab Studio Android Build

echo ============================================
echo   📱 Collab Studio Android APK 构建脚本
echo ============================================
echo.

:: 检查 Java
where java >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ 未找到 Java JDK，请先安装 JDK 17+
    echo    下载: https://adoptium.net/
    pause
    exit /b 1
)
echo ✅ Java: OK

:: 检查 ANDROID_HOME
if "%ANDROID_HOME%"=="" (
    if exist "E:\tools\android-sdk" (
        set ANDROID_HOME=E:\tools\android-sdk
    ) else (
        echo ❌ ANDROID_HOME 未设置，请设置 Android SDK 路径
        pause
        exit /b 1
    )
)
echo ✅ ANDROID_HOME: %ANDROID_HOME%

:: 检查 SDK 组件
if not exist "%ANDROID_HOME%\platforms\android-34" (
    echo ⚠️  缺少 android-34 平台，正在下载...
    call android --sdk "%ANDROID_HOME%" sdk install "platforms;android-34"
)
if not exist "%ANDROID_HOME%\build-tools\34.0.0" (
    echo ⚠️  缺少 build-tools 34，正在下载...
    call android --sdk "%ANDROID_HOME%" sdk install "build-tools;34.0.0"
)

:: 设置环境
set JAVA_HOME=
for /f "tokens=*" %%i in ('where java') do set JAVA_PATH=%%i
echo ✅ Java: %JAVA_PATH%

:: 清理旧构建
echo.
echo 🧹 清理旧构建...
if exist "app\build" rmdir /s /q "app\build"

:: 构建 APK
echo.
echo 🔨 构建 Debug APK...
call gradlew assembleDebug

if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================
    echo   ✅ 构建成功！
    echo   📦 APK: app\build\outputs\apk\debug\app-debug.apk
    echo ============================================
) else (
    echo.
    echo ❌ 构建失败，请检查上方日志
)

pause
