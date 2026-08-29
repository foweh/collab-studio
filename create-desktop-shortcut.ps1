$desk = [Environment]::GetFolderPath('Desktop')
$bat = 'F:\duhisjdkc\xiangmu\collab-studio\start-collab-studio.bat'
$lnk = Join-Path $desk 'Collab Studio.lnk'
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = $bat
$s.WorkingDirectory = 'F:\duhisjdkc\xiangmu\collab-studio'
$s.IconLocation = 'shell32.dll,13'
$s.Description = 'Collab Studio - one-click launcher'
$s.WindowStyle = 1
$s.Save()
Write-Host "Created: $lnk"
