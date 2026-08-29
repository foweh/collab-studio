#!/bin/bash
# Collab Studio Android APK Build Script (Linux/macOS)
echo "============================================"
echo "  📱 Collab Studio Android APK Build"
echo "============================================"

# Check Java
if ! command -v java &> /dev/null; then
    echo "❌ Java JDK not found. Install JDK 17+ from https://adoptium.net/"
    exit 1
fi
echo "✅ Java: $(java -version 2>&1 | head -1)"

# Set ANDROID_HOME if needed
if [ -z "$ANDROID_HOME" ]; then
    if [ -d "$HOME/Android/Sdk" ]; then
        export ANDROID_HOME="$HOME/Android/Sdk"
    elif [ -d "/usr/local/lib/android/sdk" ]; then
        export ANDROID_HOME="/usr/local/lib/android/sdk"
    else
        echo "❌ ANDROID_HOME not set"
        exit 1
    fi
fi
echo "✅ ANDROID_HOME: $ANDROID_HOME"

# Build
echo ""
echo "🔨 Building Debug APK..."
./gradlew assembleDebug

if [ $? -eq 0 ]; then
    echo ""
    echo "============================================"
    echo "  ✅ Build successful!"
    echo "  📦 APK: app/build/outputs/apk/debug/app-debug.apk"
    echo "============================================"
else
    echo ""
    echo "❌ Build failed"
fi
