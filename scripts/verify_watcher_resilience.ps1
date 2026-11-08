# verify_watcher_resilience.ps1
$RepoDir = (Resolve-Path "$PSScriptRoot\..").Path
$TaskName = "SalesReportWatcher_Nour"

Write-Host "=== Testing Sales Watcher Resilience & Recovery ===" -ForegroundColor Cyan

# 1. Verify Task Scheduler registration
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host "FAIL: Scheduled task $TaskName is not registered." -ForegroundColor Red
    exit 1
}
Write-Host "PASS 1: Scheduled task $TaskName is registered. State: $($task.State)" -ForegroundColor Green

# 2. Verify Startup shortcut
$StartupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$ShortcutPath = Join-Path $StartupFolder "$TaskName.lnk"
if (-not (Test-Path $ShortcutPath)) {
    Write-Host "FAIL: Startup shortcut missing at $ShortcutPath" -ForegroundColor Red
    exit 1
}
Write-Host "PASS 2: Startup fail-safe shortcut exists." -ForegroundColor Green

# 3. Simulate supervisor execution via wscript (silently)
$vbsPath = Join-Path $RepoDir "silent_supervisor.vbs"
$proc = Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbsPath`"" -WorkingDirectory $RepoDir -PassThru -Wait
if ($proc.ExitCode -ne 0) {
    Write-Host "FAIL: silent_supervisor.vbs exited with code $($proc.ExitCode)" -ForegroundColor Red
    exit 1
}
Write-Host "PASS 3: Silent supervisor executed cleanly without errors." -ForegroundColor Green

# 4. Verify file change detection & sync
$testScript = Join-Path $RepoDir "sales_watcher.py"
& python $testScript --once

$logTail = (Get-Content (Join-Path $RepoDir "watcher.log") -Tail 15 | Out-String)
if ($logTail -match "Cycle completed successfully") {
    Write-Host "PASS 4: Sync cycle executed and completed successfully." -ForegroundColor Green
} else {
    Write-Host "FAIL: Sync cycle was not logged as cycle completed." -ForegroundColor Red
    exit 1
}

Write-Host "`nSUCCESS_WATCHER_RESILIENCE_VERIFIED" -ForegroundColor Green
exit 0
