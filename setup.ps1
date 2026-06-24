# RemoteControl 一键安装脚本 (PowerShell)
# 用法: irm https://raw.githubusercontent.com/ACCSCI/RemoteControl/master/setup.ps1 | iex
# 或本地: .\setup.ps1

$ErrorActionPreference = "Stop"
$REPO_URL = "https://github.com/ACCSCI/RemoteControl.git"
$INSTALL_DIR = "$env:USERPROFILE\RemoteControl"
$SERVICE_NAME = "remotecontrol"

function Info($msg)  { Write-Host "[✓] $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Error($msg) { Write-Host "[✗] $msg" -ForegroundColor Red; exit 1 }

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
            Error "Node.js 安装后仍无法找到 node，请重新打开终端后再次运行本脚本"
        }
        Info "Node.js 安装完成: $(node -v)"
    } else {
        Error "未找到 winget，请手动安装 Node.js: https://nodejs.org"
    }
}

# --- Step 2: Check Git ---
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Error "未找到 git，请先安装 Git: https://git-scm.com"
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

# --- Step 6: Install pm2 globally ---
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Info "安装 pm2 进程管理器..."
    npm install -g pm2
}
Info "pm2 已就绪"

# --- Step 7: Get AUTH_TOKEN ---
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

# --- Step 8: Stop old instance if running ---
& { pm2 delete $SERVICE_NAME } 2>$null

# --- Step 9: Start with pm2 ---
Info "启动 RemoteControl Server..."
Set-Location "$INSTALL_DIR\server"
$env:AUTH_TOKEN = $authToken
pm2 start server.js --name $SERVICE_NAME

# --- Step 10: Save pm2 process list & set up auto-start ---
Info "保存 pm2 进程列表..."
pm2 save

Info "配置开机自启..."
& { pm2 startup } 2>$null

# --- Done ---
Write-Host ""
Write-Host "============================================"
Info "安装完成！"
Write-Host ""
Write-Host "  服务已启动，开机自启已配置"
Write-Host "  打开浏览器访问: http://<台式机IP>:18765"
Write-Host ""
Write-Host "  常用命令:"
Write-Host "    pm2 status              查看运行状态"
Write-Host "    pm2 logs                查看日志"
Write-Host "    pm2 restart $SERVICE_NAME   重启服务"
Write-Host "    pm2 stop $SERVICE_NAME      停止服务"
Write-Host "============================================"
Write-Host ""
