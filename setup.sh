#!/usr/bin/env bash
# RemoteControl 一键安装脚本 (Git Bash / MSYS2)
set -e

REPO_URL="https://github.com/ACCSCI/RemoteControl.git"
INSTALL_DIR="$HOME/RemoteControl"
SERVICE_NAME="remotecontrol"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# --- Step 1: Check / Install Node.js ---
echo ""
echo "=== RemoteControl 一键安装 ==="
echo ""

if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  info "Node.js 已安装: $NODE_VER"
else
  warn "未检测到 Node.js，正在通过 winget 安装..."
  if command -v winget &>/dev/null; then
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    # Refresh PATH
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

# --- Step 6: Install pm2 globally ---
if ! command -v pm2 &>/dev/null; then
  info "安装 pm2 进程管理器..."
  npm install -g pm2
fi
info "pm2 已就绪"

# --- Step 7: Get AUTH_TOKEN ---
echo ""
if [ -n "$AUTH_TOKEN" ]; then
  info "使用环境变量 AUTH_TOKEN"
else
  echo -n "请输入认证 Token (留空使用默认值): "
  read -r USER_TOKEN
  if [ -z "$USER_TOKEN" ]; then
    # Generate a random token
    USER_TOKEN=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
    warn "已生成随机 Token: $USER_TOKEN"
  fi
  export AUTH_TOKEN="$USER_TOKEN"
fi

# --- Step 8: Stop old instance if running ---
pm2 delete "$SERVICE_NAME" 2>/dev/null || true

# --- Step 9: Start with pm2 ---
info "启动 RemoteControl Server..."
cd "$INSTALL_DIR/server"
AUTH_TOKEN="$AUTH_TOKEN" pm2 start server.js --name "$SERVICE_NAME"

# --- Step 10: Save pm2 process list & set up auto-start ---
info "保存 pm2 进程列表..."
pm2 save

# Set up Windows startup (pm2-startup)
info "配置开机自启..."
if ! pm2 startup 2>/dev/null | grep -q "Startup"; then
  pm2 startup || warn "开机自启配置失败，可手动运行: pm2 startup"
fi

# --- Done ---
echo ""
echo "============================================"
info "安装完成！"
echo ""
PORT=$(node -e "process.stdout.write('18765')")
echo "  服务已启动，开机自启已配置"
echo "  打开浏览器访问: http://<台式机IP>:$PORT"
echo ""
echo "  常用命令:"
echo "    pm2 status          查看运行状态"
echo "    pm2 logs            查看日志"
echo "    pm2 restart $SERVICE_NAME   重启服务"
echo "    pm2 stop $SERVICE_NAME      停止服务"
echo "============================================"
echo ""
