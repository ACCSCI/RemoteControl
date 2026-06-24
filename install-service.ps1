# RemoteControl service installer - uses Windows Task Scheduler (not pm2)
# Run this once from an interactive session

$ErrorActionPreference = "Stop"

$InstallDir = "$env:USERPROFILE\RemoteControl"
$TaskName = "RemoteControl"
$Port = "18765"
$Token = $env:AUTH_TOKEN

if (-not $Token) {
    $Token = Read-Host "Enter AUTH_TOKEN (leave empty to use default)"
    if (-not $Token) {
        $Token = node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))"
        Write-Host "Generated token: $Token" -ForegroundColor Yellow
    }
}

# Remove old task if exists
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Create the action: start node server.js with env vars
$envVars = "AUTH_TOKEN=$Token;PORT=$Port"
$action = New-ScheduledTaskAction `
    -Execute "node.exe" `
    -Argument "server.js" `
    -WorkingDirectory "$InstallDir\server"

# Set environment variables
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# Trigger: at logon
$trigger = New-ScheduledTaskTrigger -AtLogon

# Register the task
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest

# Set env vars in the task via registry (simplest approach for node process)
$task = Get-ScheduledTask -TaskName $TaskName
$task.Actions[0].Execute = "cmd.exe"
$task.Actions[0].Arguments = "/c `"set AUTH_TOKEN=$Token&& set PORT=$Port&& cd /d $InstallDir\server && node server.js`""
Set-ScheduledTask -InputObject $task

# Start it now
Start-ScheduledTask -TaskName $TaskName

# Verify
Start-Sleep -Seconds 2
$taskInfo = Get-ScheduledTask -TaskName $TaskName
Write-Host ""
Write-Host "=== Installed ===" -ForegroundColor Green
Write-Host "Task: $TaskName (Status: $($taskInfo.State))"
Write-Host "Token: $Token"
Write-Host "URL: http://localhost:$Port"
Write-Host ""
Write-Host "Commands:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTask '$TaskName'       # status"
Write-Host "  Start-ScheduledTask '$TaskName'     # start"
Write-Host "  Stop-ScheduledTask '$TaskName'      # stop"
Write-Host "  Unregister-ScheduledTask '$TaskName' # uninstall"
