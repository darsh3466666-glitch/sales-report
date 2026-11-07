$TaskName = "SalesReportWatcher_Nour"
$ScriptDir = $PSScriptRoot
$VbsPath = Join-Path $ScriptDir "silent_watcher.vbs"

Write-Host "=== Setup Automated Watcher for Nour Sales Report ===" -ForegroundColor Cyan

if (-not (Test-Path $VbsPath)) {
    Write-Host "ERROR: Vbs file not found at $VbsPath" -ForegroundColor Red
    exit 1
}

# 1. Windows Startup Folder (guarantees silent autorun on logon without admin elevation)
$StartupFolder = [System.Environment]::GetFolderPath('Startup')
$WshShell = New-Object -ComObject WScript.Shell
$ShortcutPath = Join-Path $StartupFolder "$TaskName.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$VbsPath`""
$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description = "Automated Sales Report Watcher for Al-Nour"
$Shortcut.Save()
Write-Host "Startup shortcut created in: $StartupFolder" -ForegroundColor Green

# 2. Try Scheduled Task registration as well
try {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    $Action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$VbsPath`"" -WorkingDirectory $ScriptDir
    $Trigger = New-ScheduledTaskTrigger -AtLogOn
    $Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Force | Out-Null
    Write-Host "Task Scheduler task registered successfully!" -ForegroundColor Green
} catch {
    Write-Host "Notice: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 3. Start the watcher process immediately
Start-Process "wscript.exe" -ArgumentList "`"$VbsPath`"" -WorkingDirectory $ScriptDir
Write-Host "Silent background watcher started!" -ForegroundColor Green
