# RemoteControl 一键安装脚本 (PowerShell)
# 用法: irm https://raw.githubusercontent.com/ACCSCI/RemoteControl/master/setup.ps1 | iex
# 或本地: .\setup.ps1

$ErrorActionPreference = "Stop"
$REPO_URL = "https://github.com/ACCSCI/RemoteControl.git"
$INSTALL_DIR = "$env:USERPROFILE\RemoteControl"
$TASK_NAME = "RemoteControl"

function Info($msg)  { Write-Host "[✓] $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "[✗] $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== RemoteControl 一键安装 ==="
Write-Host ""

# --- Step 1: Check / Install Node.js ---
if (Get-Command node -ErrorAction SilentlyContinue) {
    Info "Node.js 已安装: $(node -v)"
} else {
    Warn "未检测到 Node.js，正在通过 winget 安装..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        $env:PATH = "C:\Program Files\nodejs;$env:PATH"
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            Fail "Node.js 安装后仍无法找到 node，请重新打开终端后再次运行本脚本"
        }
        Info "Node.js 安装完成: $(node -v)"
    } else {
        Fail "未找到 winget，请手动安装 Node.js: https://nodejs.org"
    }
}

# --- Step 2: Check Git ---
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail "未找到 git，请先安装 Git: https://git-scm.com"
}

# --- Step 3: Clone or update repo ---
if (Test-Path "$INSTALL_DIR\.git") {
    Info "仓库已存在，拉取最新代码..."
    Set-Location $INSTALL_DIR
    git pull
} else {
    Info "克隆仓库到 $INSTALL_DIR ..."
    git clone $REPO_URL $INSTALL_DIR
    Set-Location $INSTALL_DIR
}

# --- Step 4: Install server dependencies ---
Info "安装 Server 依赖..."
Set-Location "$INSTALL_DIR\server"
npm install --production

# --- Step 5: Install client dependencies & build ---
Info "安装 Client 依赖..."
Set-Location "$INSTALL_DIR\client"
npm install

Info "构建 Client..."
npx vite build

# --- Step 6: Get AUTH_TOKEN ---
Write-Host ""
$authToken = $env:AUTH_TOKEN
if (-not $authToken) {
    $userToken = Read-Host "请输入认证 Token (留空使用默认值)"
    if (-not $userToken) {
        $userToken = node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))"
        Warn "已生成随机 Token: $userToken"
    }
    $authToken = $userToken
}

# --- Step 7: Stop old task if exists ---
Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false -ErrorAction SilentlyContinue

# --- Step 8: Register Windows Scheduled Task ---
Info "注册开机启动服务..."

$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"set AUTH_TOKEN=$authToken&& cd /d $INSTALL_DIR\server && node server.js`""

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

$trigger = New-ScheduledTaskTrigger -AtStartup

Register-ScheduledTask `
    -TaskName $TASK_NAME `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Force

# --- Step 9: Start now ---
Start-ScheduledTask -TaskName $TASK_NAME
Start-Sleep -Seconds 2

# --- Step 10: Verify ---
$taskInfo = Get-ScheduledTask -TaskName $TASK_NAME
$port = "18765"

Write-Host ""
Write-Host "============================================"
Info "安装完成！"
Write-Host ""
Write-Host "  服务状态: $($taskInfo.State)"
Write-Host "  认证 Token: $authToken"
Write-Host "  打开浏览器访问: http://<台式机IP>:$port"
Write-Host ""
Write-Host "  常用命令:"
Write-Host "    Get-ScheduledTask '$TASK_NAME'          # 查看状态"
Write-Host "    Start-ScheduledTask '$TASK_NAME'        # 启动"
Write-Host "    Stop-ScheduledTask '$TASK_NAME'         # 停止"
Write-Host "    Unregister-ScheduledTask '$TASK_NAME'   # 卸载"
Write-Host "============================================"
Write-Host ""
