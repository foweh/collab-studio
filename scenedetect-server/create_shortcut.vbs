Set WshShell = CreateObject("WScript.Shell")
DesktopPath = WshShell.SpecialFolders("Desktop")

Set Shortcut = WshShell.CreateShortcut(DesktopPath & "\SceneDetect.lnk")
Shortcut.TargetPath = Replace(WScript.ScriptFullName, "\create_shortcut.vbs", "\start_server.bat")
Shortcut.WorkingDirectory = Replace(WScript.ScriptFullName, "\create_shortcut.vbs", "")
Shortcut.IconLocation = "shell32.dll,15"
Shortcut.Description = "Video Scene Detection Tool"
Shortcut.Save

WScript.Quit