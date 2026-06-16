# CollabStudio 一键部署脚本
# 右键 → 用 PowerShell 运行

$hostname = "8.213.147.43"
$user = "root"
$password = "Abdurahman666%"
$localDir = "F:\duhisjdkc\xiangmu\collab-studio"
$remoteDir = "/root/collab-studio/collab-studio"

Write-Host "=== CollabStudio 一键部署 ===" -ForegroundColor Cyan
Write-Host ""

# 检查 sshpass 是否存在
$sshpass = Get-Command "sshpass" -ErrorAction SilentlyContinue
$plink = Get-Command "plink" -ErrorAction SilentlyContinue
$pscp = Get-Command "pscp" -ErrorAction SilentlyContinue

if ($plink) {
    Write-Host "使用 plink/pscp 自动部署..." -ForegroundColor Green
    
    # 停服务
    & $plink.Source -pw $password "$user@$hostname" "pkill -f 'node server.js' 2>/dev/null; sleep 1"
    
    # 上传文件
    $files = @(
        "server.js",
        "public/app.js", "public/index.html", "public/style.css", "public/mindmap.js",
        "services/auth.js", "services/project.js", "services/logger.js", "services/annotation.js",
        "utils/persist.js", "utils/ratelimit.js"
    )
    
    foreach ($f in $files) {
        $local = Join-Path $localDir $f
        $remote = "$remoteDir/$($f -replace '\\','/')"
        Write-Host "  上传 $f ..." -NoNewline
        & $pscp.Source -pw $password "$local" "$user@$hostname`:$remote" 2>$null
        Write-Host " OK" -ForegroundColor Green
    }
    
    # 重启
    Write-Host "重启服务..." -ForegroundColor Yellow
    & $plink.Source -pw $password "$user@$hostname" "cd $remoteDir && export ADMIN_PASSWORD=Abdurahman666% && nohup node server.js > server.log 2>&1 & sleep 2 && curl -s http://localhost:3000 | head -3"
    
} elseif (Test-Path "C:\Windows\System32\OpenSSH\ssh.exe") {
    Write-Host "使用 OpenSSH（需要手动输入密码几次）" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "请手动执行以下命令："
    Write-Host ""
    Write-Host "===== 在新 PowerShell 窗口 =====" -ForegroundColor Cyan
    Write-Host "ssh $user@$hostname `"pkill -f 'node server.js' 2>/dev/null; sleep 1`""
    
    $serverFiles = @("server.js")
    $publicFiles = @("app.js","index.html","style.css","mindmap.js")
    $svcFiles = @("auth.js","project.js","logger.js","annotation.js")
    $utilFiles = @("persist.js","ratelimit.js")
    
    foreach ($f in $serverFiles) {
        Write-Host "scp $localDir\$f $user@$hostname`:$remoteDir/$f"
    }
    foreach ($f in $publicFiles) {
        Write-Host "scp $localDir\public\$f $user@$hostname`:$remoteDir/public/$f"
    }
    foreach ($f in $svcFiles) {
        Write-Host "scp $localDir\services\$f $user@$hostname`:$remoteDir/services/$f"
    }
    foreach ($f in $utilFiles) {
        Write-Host "scp $localDir\utils\$f $user@$hostname`:$remoteDir/utils/$f"
    }
    
    Write-Host ""
    Write-Host "===== 切回 SSH 窗口 =====" -ForegroundColor Cyan
    Write-Host "cd $remoteDir && export ADMIN_PASSWORD=Abdurahman666% && nohup node server.js > server.log 2>&1 &"
    Write-Host "sleep 2 && curl -s http://localhost:3000 | head -3"
    
} else {
    Write-Host "未找到 SSH 工具！请安装 OpenSSH 或 PuTTY。" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== 完成 ===" -ForegroundColor Cyan
Write-Host "访问 http://$hostname`:3000" -ForegroundColor Green
Write-Host "管理员：热合曼  密码：Abdurahman666%"
Read-Host "按回车退出"
