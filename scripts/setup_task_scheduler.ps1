# setup_task_scheduler.ps1
$RepoDir = (Resolve-Path "$PSScriptRoot\..").Path
$TaskName = "SalesReportWatcher_Nour"
$VbsPath = Join-Path $RepoDir "silent_supervisor.vbs"

Write-Host "=== Setting up Bulletproof Windows Task Scheduler for Sales Watcher ===" -ForegroundColor Cyan
Write-Host "Repo Directory: $RepoDir"
Write-Host "VBS Path: $VbsPath"

if (-not (Test-Path $VbsPath)) {
    Write-Host "ERROR: silent_supervisor.vbs not found at $VbsPath" -ForegroundColor Red
    exit 1
}

# 1. Register Scheduled Task with standard interactive principal (no admin prompt, no access denied)
$Action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$VbsPath`"" -WorkingDirectory $RepoDir
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

Write-Host "Registering scheduled task $TaskName..." -ForegroundColor Yellow
$reg = Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Automated Sales Report Watcher & Supervisor for Al-Nour - Ensures 24/7 background watching" -Force

if (-not $reg) {
    Write-Host "ERROR: Register-ScheduledTask returned null" -ForegroundColor Red
    exit 1
}
Write-Host "Scheduled task successfully registered: $($reg.TaskName)" -ForegroundColor Green

# 2. Update Startup folder shortcut for redundant fail-safe
$StartupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$ShortcutPath = Join-Path $StartupFolder "$TaskName.lnk"

try {
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = "wscript.exe"
    $Shortcut.Arguments = "`"$VbsPath`""
    $Shortcut.WorkingDirectory = $RepoDir
    $Shortcut.WindowStyle = 0
    $Shortcut.Description = "Sales Report Silent Supervisor"
    $Shortcut.Save()
    Write-Host "Startup shortcut created at $ShortcutPath" -ForegroundColor Green
} catch {
    Write-Host "Warning creating startup shortcut: $_" -ForegroundColor Yellow
}

# 3. Verify task exists
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "SUCCESS: Task $TaskName is registered and active! State: $($task.State)" -ForegroundColor Green
} else {
    Write-Host "ERROR: Task verification failed." -ForegroundColor Red
    exit 1
}

# 4. Trigger supervisor once immediately
Start-ScheduledTask -TaskName $TaskName
Write-Host "Triggered task immediately via Start-ScheduledTask" -ForegroundColor Cyan
