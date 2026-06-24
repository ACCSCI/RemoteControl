#!/usr/bin/env bash
# RemoteControl 一键安装脚本 (Git Bash / MSYS2)
set -e

REPO_URL="https://github.com/ACCSCI/RemoteControl.git"
INSTALL_DIR="$HOME/RemoteControl"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "=== RemoteControl 一键安装 ==="
echo ""

# --- Step 1: Check / Install Node.js ---
if command -v node &>/dev/null; then
  info "Node.js 已安装: $(node -v)"
else
  warn "未检测到 Node.js，正在通过 winget 安装..."
  if command -v winget &>/dev/null; then
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    export PATH="/c/Program Files/nodejs:$PATH"
    if ! command -v node &>/dev/null; then
      error "Node.js 安装后仍无法找到 node，请重新打开终端后再次运行本脚本"
    fi
    info "Node.js 安装完成: $(node -v)"
  else
    error "未找到 winget，请手动安装 Node.js: https://nodejs.org"
  fi
fi

# --- Step 2: Check Git ---
if ! command -v git &>/dev/null; then
  error "未找到 git，请先安装 Git: https://git-scm.com"
fi

# --- Step 3: Clone or update repo ---
if [ -d "$INSTALL_DIR/.git" ]; then
  info "仓库已存在，拉取最新代码..."
  cd "$INSTALL_DIR"
  git pull
else
  info "克隆仓库到 $INSTALL_DIR ..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# --- Step 4: Install server dependencies ---
info "安装 Server 依赖..."
cd "$INSTALL_DIR/server"
npm install --production

# --- Step 5: Install client dependencies & build ---
info "安装 Client 依赖..."
cd "$INSTALL_DIR/client"
npm install

info "构建 Client..."
npx vite build

# --- Step 6: Get AUTH_TOKEN ---
echo ""
if [ -n "$AUTH_TOKEN" ]; then
  info "使用环境变量 AUTH_TOKEN"
else
  echo -n "请输入认证 Token (留空使用默认值): "
  read -r USER_TOKEN
  if [ -z "$USER_TOKEN" ]; then
    USER_TOKEN=$(node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")
    warn "已生成随机 Token: $USER_TOKEN"
  fi
  export AUTH_TOKEN="$USER_TOKEN"
fi

# --- Step 7: Register as Windows service via Task Scheduler ---
info "注册开机启动服务..."
powershell.exe -NoProfile -Command "
  Unregister-ScheduledTask -TaskName 'RemoteControl' -Confirm:`$false -ErrorAction SilentlyContinue;
  \$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c \"set AUTH_TOKEN=$AUTH_TOKEN&& cd /d $INSTALL_DIR\\\server && node server.js\"';
  \$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable;
  \$trigger = New-ScheduledTaskTrigger -AtLogon;
  Register-ScheduledTask -TaskName 'RemoteControl' -Action \$action -Trigger \$trigger -Settings \$settings -RunLevel Highest -Force
"

# --- Step 8: Start now ---
powershell.exe -NoProfile -Command "Start-ScheduledTask -TaskName 'RemoteControl'"
sleep 2

# --- Done ---
echo ""
echo "============================================"
info "安装完成！"
echo ""
echo "  Token: $AUTH_TOKEN"
echo "  打开浏览器访问: http://<台式机IP>:18765"
echo ""
echo "  常用命令 (PowerShell):"
echo "    Get-ScheduledTask 'RemoteControl'          # 查看状态"
echo "    Start-ScheduledTask 'RemoteControl'        # 启动"
echo "    Stop-ScheduledTask 'RemoteControl'         # 停止"
echo "    Unregister-ScheduledTask 'RemoteControl'   # 卸载"
echo "============================================"
echo ""
