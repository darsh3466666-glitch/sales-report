$TaskName = "SalesReportWatcher_Nour"
$StartupFolder = [System.Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupFolder "$TaskName.lnk"

if (-not (Test-Path $ShortcutPath)) {
    & "$PSScriptRoot\..\setup_task_scheduler.ps1" | Out-Null
}

if (Test-Path $ShortcutPath) {
    Write-Output "SUCCESS_WATCHER_REGISTERED"
    exit 0
} else {
    Write-Error "Watcher not registered in Startup or Task Scheduler"
    exit 1
}
