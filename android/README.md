# Collab Studio Android APK Build Guide

## 项目位置
`F:\duhisjdkc\xiangmu\collab-studio\android\`

## 前置条件
1. **Android Studio**（推荐）或命令行构建环境
2. **Java JDK 17+**（本机已装）
3. **Android SDK**（本机已装到 `E:\tools\android-sdk`，含 platform 34 / build-tools 34）
4. **Gradle**（构建工具，首次运行会自动下载）

## 构建方法

### 方法一：用 Android Studio（推荐）
1. 打开 Android Studio → "Open an existing project"
2. 选择 `F:\duhisjdkc\xiangmu\collab-studio\android\`
3. 等待 Gradle 同步完成
4. Build → Build Bundle(s) / APK(s) → Build APK(s)
5. APK 生成在 `app\build\outputs\apk\debug\app-debug.apk`

### 方法二：命令行构建
```bash
cd F:\duhisjdkc\xiangmu\collab-studio\android
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot
set ANDROID_HOME=E:\tools\android-sdk
gradlew.bat assembleDebug
```

## 项目结构
```
android/
├── build.gradle              # 顶层构建配置
├── settings.gradle           # 项目设置
├── gradle.properties         # Gradle 属性
├── local.properties          # SDK 路径
├── gradlew.bat               # Windows 构建脚本
├── build-apk.bat             # 一键构建脚本
├── app/
│   ├── build.gradle          # App 模块构建配置
│   ├── proguard-rules.pro    # 混淆规则
│   ├── libs/                 # 预编译 native 库
│   │   ├── arm64-v8a/        # 64位 ARM（主流手机）
│   │   ├── armeabi-v7a/      # 32位 ARM（旧手机）
│   │   ├── x86_64/           # x86 模拟器
│   │   └── x86/              # x86 模拟器
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── assets/
│       │   ├── loading.html               # 启动加载页
│       │   └── nodejs-project/            # Node.js 服务端代码
│       │       ├── server.js              # 主服务
│       │       ├── package.json
│       │       ├── services/              # 后端服务
│       │       ├── utils/                 # 工具函数
│       │       ├── public/                # 前端页面（全部功能）
│       │       └── node_modules/          # npm 依赖
│       ├── java/com/
│       │   ├── collabstudio/
│       │   │   ├── MainActivity.java      # WebView 主界面
│       │   │   └── NodeService.java       # Node.js 服务管理
│       │   └── janeasystems/
│       │       └── cdvnodejsmobile/
│       │           └── NodeJS.java        # JNI 桥接（nodejs-mobile）
│       └── res/                           # 资源文件
```

## 功能支持
- ✅ Node.js 服务在手机本地运行（localhost:3000）
- ✅ WebView 自动加载（触屏优化）
- ✅ 所有功能完整保留（项目管理、剧本、思维导图、故事、分镜）
- ✅ 局域网同步功能
- ✅ 键盘弹出自动适配（adjustResize）
- ✅ 返回键支持 WebView 后退
- ✅ 状态栏/导航栏深色主题
- ✅ 网络安全配置（允许 localhost + 局域网）

## 首次构建注意
- 首次构建会下载 Gradle 和 AndroidX 依赖，需联网
- 构建完成后安装到手机：`adb install app\build\outputs\apk\debug\app-debug.apk`
- 手机首次启动约需 10-30 秒（Node.js 服务初始化）
