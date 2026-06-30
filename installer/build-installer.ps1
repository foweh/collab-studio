# ============================================
#  Collab Studio 一键打包脚本
#  流程:
#    1. 下载便携版 NSIS (3 MB)
#    2. 编译启动器 (Program.cs -> 启动 Collab Studio.exe)
#    3. 准备安装包文件 (app/ 目录)
#    4. 编译 NSIS 安装包 (CollabStudio-Setup.exe)
# ============================================

$ErrorActionPreference = 'Stop'
$root      = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $root 'installer'
$launcher  = Join-Path $installer 'launcher'
$appDir    = Join-Path $installer 'app'
$distDir   = Join-Path $root 'dist'
$nsisDir   = Join-Path $installer '.nsis'
$nsisExe   = Join-Path $nsisDir 'makensis.exe'

function Step($msg) { Write-Host "`n═══ $msg ═══" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Err($msg)  { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# ── 1. 下载便携版 NSIS ──────────────────────────
Step '1/4 检查 NSIS 编译器'
if (-not (Test-Path $nsisExe))
{
    Warn '本地无 NSIS，正在下载便携版（约 3MB）...'
    $nsisZip = Join-Path $env:TEMP 'nsis-portable.zip'
    # 镜像地址
    $urls = @(
        'https://github.com/ywjheart/Nsis-portable-package/releases/download/3.10/nsis-3.10.zip',
        'https://github.com/kichik/nsis/releases/download/v3.10/nsis-3.10.zip',
        'https://sourceforge.net/projects/nsis/files/NSIS%203/3.10/nsis-3.10.zip/download'
    )
    New-Item -ItemType Directory -Path $nsisDir -Force | Out-Null
    $downloaded = $false
    foreach ($u in $urls)
    {
        try {
            Write-Host "  尝试: $u"
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $u -OutFile $nsisZip -UseBasicParsing -TimeoutSec 60
            if ((Get-Item $nsisZip).Length -gt 1000000)
            {
                $downloaded = $true
                Write-Host "  下载成功" -ForegroundColor Green
                break
            }
        } catch {
            Warn "  失败: $($_.Exception.Message)"
        }
    }
    if (-not $downloaded) { Err 'NSIS 下载失败，请手动从 https://nsis.sourceforge.io 下载并放到 installer\.nsis\' }
    Write-Host '  解压...'
    Expand-Archive -Path $nsisZip -DestinationPath $nsisDir -Force
    # NSIS zip 内可能含 nsis-3.10/ 子目录，统一到 .nsis/
    $subDirs = Get-ChildItem $nsisDir -Directory
    if ($subDirs.Count -eq 1 -and -not (Test-Path $nsisExe))
    {
        Get-ChildItem $subDirs[0].FullName | Move-Item -Destination $nsisDir -Force
        Remove-Item $subDirs[0].FullName -Recurse -Force
    }
    Remove-Item $nsisZip -Force
}
if (-not (Test-Path $nsisExe)) { Err "未找到 makensis.exe，请检查 $nsisDir" }
Ok "NSIS: $nsisExe"

# ── 2. 编译启动器 .exe ──────────────────────────
Step '2/4 编译启动器 (C# → 启动 Collab Studio.exe)'
$launcherExe = Join-Path $launcher '启动 Collab Studio.exe'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = 'csc.exe' }
& $csc /nologo /target:winexe /platform:anycpu /out:"$launcherExe" /reference:System.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll `
   (Join-Path $launcher 'Program.cs') 2>&1 | Out-String | ForEach-Object { Write-Host $_ }
if (-not (Test-Path $launcherExe)) { Err '启动器编译失败' }
Ok "启动器: $launcherExe ($([math]::Round((Get-Item $launcherExe).Length/1KB, 1)) KB)"

# ── 3. 准备 app/ 目录 ──────────────────────────
Step '3/4 准备安装包文件'
if (Test-Path $appDir) { Remove-Item $appDir -Recurse -Force }
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

# 复制项目文件（排除不需要的）
$exclude = @('node_modules', 'data', 'dist', 'test', 'scenedetect-server', 'docs', '.git', '.pkg-cache', '*.log', '*.tmp', 'npm_install.js', 'list_remote*.js', 'upload_*.js', 'restart*.js', 'verify*.js', 'test_*.js', 'split_cmds.txt', 'resp.txt', 'fix_node_cmd.txt', 'server_error.txt', 'server_output.txt', 'start_server.js', 'start2.js', 'start-collab-studio.bat', 'create-desktop-shortcut.ps1', 'verify-shortcut.ps1', 'show_log.js', 'deploy.bat', 'package-lock.json', 'start-music-studio.bat', 'test.bat', 'test.sh', ']', '剪映智能剪辑API汇总.md', 'create_shortcut.vbs', 'Dockerfile', 'docker-compose.yml', '.env.example', 'build.log', 'installer')
Get-ChildItem $root -Force | Where-Object {
    $name = $_.Name
    -not ($exclude | Where-Object { $name -like $_ })
} | ForEach-Object {
    $dst = Join-Path $appDir $_.Name
    if ($_.PSIsContainer) {
        Copy-Item $_.FullName -Destination $dst -Recurse -Force
    } else {
        Copy-Item $_.FullName -Destination $dst -Force
    }
}

# 复制 LICENSE
if (Test-Path (Join-Path $root 'LICENSE')) { Copy-Item (Join-Path $root 'LICENSE') $appDir -Force }
Ok "app 目录就绪 ($((Get-ChildItem $appDir -Recurse | Measure-Object).Count) 个条目)"

# 写入 README.txt
$readme = @"
Collab Studio 协作工作室 v1.0
═══════════════════════════════════════

快速使用：
  1. 双击 "启动 Collab Studio.exe"
  2. 等待服务启动（约 2-3 秒）
  3. 浏览器自动打开 http://localhost:3000

如需手动启动：
  命令行进入本目录，执行：node server.js

依赖安装：
  首次运行会自动执行 npm install --omit=dev
  需要联网，约 1-2 分钟

数据存储：
  所有项目数据保存在 data/ 目录

系统要求：
  - Windows 10/11 (64-bit)
  - Node.js 18 或更高版本（首次运行若未装会提示）

更多信息：
  https://github.com/foweh/collab-studio
"@
Set-Content -Path (Join-Path $appDir 'README.txt') -Value $readme -Encoding UTF8

# ── 4. 编译 NSIS 安装包 ──────────────────────────
Step '4/4 编译 NSIS 安装包'
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
$installerNsi = Join-Path $installer 'installer.nsi'
& $nsisExe /V2 $installerNsi 2>&1 | ForEach-Object { Write-Host $_ }
$setupExe = Join-Path $distDir 'CollabStudio-Setup.exe'
if (-not (Test-Path $setupExe)) { Err 'NSIS 编译失败' }
Ok "安装包: $setupExe ($([math]::Round((Get-Item $setupExe).Length/1MB, 1)) MB)"

Write-Host "`n═══════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ 打包完成！" -ForegroundColor Green
Write-Host "  📦 $setupExe" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host "`n双击 CollabStudio-Setup.exe 即可安装到任意 Windows 电脑。"
