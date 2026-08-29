@rem
@rem Gradle Wrapper for Collab Studio Android
@rem

@if "%DEBUG%"=="" @echo off
set DIRNAME=%~dp0
set APP_BASE_NAME=%~n0

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome
set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if "%ERRORLEVEL%"=="0" goto init
echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe
if exist "%JAVA_EXE%" goto init
echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
goto fail

:init
@rem Get command-line arguments
set CMD_LINE_ARGS=%*

@rem Find or download Gradle
set GRADLE_VERSION=8.5
set GRADLE_HOME=%USERPROFILE%\.gradle\wrapper\dists\gradle-%GRADLE_VERSION%-bin

if not exist "%GRADLE_HOME%" (
    echo Downloading Gradle %GRADLE_VERSION% (first run only)...
    echo This may take a few minutes.
    set GRADLE_URL=https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip
    set GRADLE_ZIP=%TEMP%\gradle-%GRADLE_VERSION%-bin.zip
    powershell -Command "Invoke-WebRequest -Uri '%GRADLE_URL%' -OutFile '%GRADLE_ZIP%' -UseBasicParsing"
    powershell -Command "Expand-Archive -Path '%GRADLE_ZIP%' -DestinationPath '%TEMP%\gradle-extract' -Force"
    if not exist "%USERPROFILE%\.gradle\wrapper\dists" mkdir "%USERPROFILE%\.gradle\wrapper\dists"
    move "%TEMP%\gradle-extract\gradle-%GRADLE_VERSION%" "%GRADLE_HOME%"
    del "%GRADLE_ZIP%"
    rmdir /s /q "%TEMP%\gradle-extract"
)

set GRADLE_EXE=%GRADLE_HOME%\bin\gradle.bat
"%GRADLE_EXE%" %CMD_LINE_ARGS%
goto end

:fail
exit /b 1

:end
