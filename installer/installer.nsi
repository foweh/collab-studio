; ============================================
;  Collab Studio 安装包脚本
;  输出: CollabStudio-Setup.exe (~2 MB)
;  用法: 运行 build-installer.ps1 自动编译
; ============================================

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

; ---- 基本信息 ----
!define APPNAME "Collab Studio"
!define COMPANYNAME "CollabStudio"
!define DESCRIPTION "实时协作创作工作室"
!define VERSIONMAJOR 1
!define VERSIONMINOR 0
!define VERSIONBUILD 0
!define HELPURL "https://github.com/foweh/collab-studio"
!define INSTALLSIZE 50000  ; 估算安装大小 KB

; ---- 安装器属性 ----
Name "${APPNAME} ${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}"
OutFile "..\dist\CollabStudio-Setup.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
InstallDirRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "InstallLocation"
RequestExecutionLevel admin
ShowInstDetails show
ShowUninstDetails show
BrandingText "${APPNAME} Installer"

; ---- 界面 ----
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Header\nsis.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\win.bmp"
!define MUI_WELCOMEPAGE_TITLE "${APPNAME} 安装向导"
!define MUI_WELCOMEPAGE_TEXT "本安装向导将引导您完成 ${APPNAME} 的安装。$\r$\n$\r$\n${APPNAME} 是实时协作创作工作室，支持剧本、思维导图、故事、分镜的协同编辑。$\r$\n$\r$\n$\r$\n点击下一步继续。"
!define MUI_FINISHPAGE_TITLE "${APPNAME} 安装完成"
!define MUI_FINISHPAGE_TEXT "${APPNAME} 已安装到您的电脑。$\r$\n$\r$\n点击「完成」启动 ${APPNAME}。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\启动 Collab Studio.exe"
!define MUI_FINISHPAGE_RUN_TEXT "启动 ${APPNAME}"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "打开说明文档"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\win.bmp"

; ---- 页面 ----
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; ---- 语言 ----
!insertmacro MUI_LANGUAGE "SimpChinese"

; ---- 版本信息 ----
VIProductVersion "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "${COMPANYNAME}"
VIAddVersionKey "LegalCopyright" "MIT License"
VIAddVersionKey "FileDescription" "${DESCRIPTION}"
VIAddVersionKey "FileVersion" "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}.0"
VIAddVersionKey "ProductVersion" "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}.0"

; ---- 安装前检查 Node.js ----
Function .onInit
  ; 检查是否已安装
  ReadRegDWORD $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString"
  ${If} $0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "${APPNAME} 已经安装。是否要卸载旧版本？$\r$\n$\r$\n选择「否」将退出安装程序。" IDYES +2
    Abort
    ; 卸载旧版
    ExecWait '$0 /S _?=$INSTDIR'
  ${EndIf}

  ; 检查 Node.js
  ReadRegStr $0 HKLM "SOFTWARE\Node.js" "InstallPath"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "SOFTWARE\Node.js" "InstallPath"
  ${EndIf}
  ${If} $0 == ""
    MessageBox MB_YESNO|MB_ICONEXCLAMATION \
      "未检测到 Node.js！$\r$\n$\r$\n${APPNAME} 需要 Node.js 18+ 才能运行。$\r$\n$\r$\n是否现在打开 Node.js 官方下载页？$\r$\n$\r$\n（也可在 https://nodejs.org 下载安装后再继续）" \
      IDYES +2 IDNO +1
    ExecShell "open" "https://nodejs.org/zh-cn/download/"
    Abort
  ${EndIf}
FunctionEnd

; ---- 安装主流程 ----
Section "主程序 (必装)" SecMain
  SectionIn RO  ; 必装

  SetOutPath "$INSTDIR"
  ; 复制项目文件（排除不需要的）
  File /r "..\app\*.*"

  ; 写注册表
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "DisplayIcon" "$INSTDIR\启动 Collab Studio.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "Publisher" "${COMPANYNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "HelpLink" "${HELPURL}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "NoRepair" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "EstimatedSize" ${INSTALLSIZE}
SectionEnd

Section "安装依赖（首次运行需联网）" SecDeps
  ; 这里不执行 npm install（避免安装时网络卡顿）
  ; 改为在首次启动时检测并提示
SectionEnd

Section "创建桌面快捷方式" SecDesktop
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\启动 Collab Studio.exe" "" "$INSTDIR\启动 Collab Studio.exe" 0
SectionEnd

Section "添加到开始菜单" SecStartMenu
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\启动 Collab Studio.exe" "" "$INSTDIR\启动 Collab Studio.exe" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}\卸载 ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

; ---- 安装后操作：显示"完成"页前提示用户首次启动会自动装依赖 ----
Function .onInstSuccess
  ; 啥也不做，UI 里 FINISHPAGE_RUN 已指定
FunctionEnd

; ---- 卸载 ----
Section "Uninstall"
  ; 删除程序文件
  RMDir /r "$INSTDIR"

  ; 删除快捷方式
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"

  ; 删除注册表
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
SectionEnd
