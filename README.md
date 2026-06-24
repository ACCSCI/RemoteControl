# RemoteControl

远程终端控制应用 — 笔记本浏览器连接台式机，PTY 进程在服务端长期持有，关闭浏览器不影响终端运行。

## 架构

```
[Browser Client]  <--WebSocket-->  [Node.js Server]  <--PTY-->  [PowerShell/CMD]
     (Laptop)                        (Desktop)              (ConPTY on Win11)
```

## 一键安装（推荐）

SSH 连接到台式机后，运行以下命令即可完成安装：

**Git Bash：**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ACCSCI/RemoteControl/master/setup.sh)
```

**PowerShell：**

```powershell
irm https://raw.githubusercontent.com/ACCSCI/RemoteControl/master/setup.ps1 | iex
```

脚本会自动：
1. 检测并安装 Node.js（通过 winget，如未安装）
2. 克隆仓库到 `~/RemoteControl`
3. 安装依赖并构建前端
4. 使用 pm2 启动后台服务（SSH 断开不影响运行）
5. 配置开机自启
6. 提示输入认证 Token（不输入则自动生成随机 Token）

安装完成后，笔记本浏览器打开 `http://<台式机 Tailscale-IP>:18765`，输入 Token 连接即可。

### 服务管理命令

```bash
pm2 status              # 查看运行状态
pm2 logs                # 查看日志
pm2 restart remotecontrol   # 重启服务
pm2 stop remotecontrol      # 停止服务
pm2 delete remotecontrol    # 删除服务
```

## 手动安装

如果不想用一键脚本，也可以手动安装：

```bash
# 克隆
git clone https://github.com/ACCSCI/RemoteControl.git
cd RemoteControl

# 安装依赖
cd server && npm install && cd ..
cd client && npm install && cd ..

# 构建前端
cd client && npx vite build && cd ..

# 配置 Token
set AUTH_TOKEN=your-secret-token-here

# 启动
cd server && node server.js
```

## 开发模式

```bash
# 终端 1: Server（带文件监听）
npm run dev:server

# 终端 2: Client Vite 开发服务器
npm run dev:client
```

Client 开发服务器会自动代理 `/ws` 请求到 Server。

## WebSocket 协议

所有消息为 JSON 文本帧，终端 I/O 使用 base64 编码。

| 方向 | 类型 | 说明 |
|------|------|------|
| C→S | `auth` | 认证（连接后首条消息） |
| C→S | `create` | 创建终端（指定 shell） |
| C→S | `input` | 键盘输入（base64） |
| C→S | `resize` | 调整终端尺寸 |
| C→S | `close` | 关闭终端 |
| C→S | `list` | 列出活跃会话 |
| S→C | `auth-ok` | 认证成功 |
| S→C | `created` | 终端创建成功 |
| S→C | `output` | 终端输出（base64） |
| S→C | `exit` | 进程退出 |
| S→C | `list-ok` | 活跃会话列表 |

## 核心行为

- **断开不杀进程**：关闭浏览器、刷新页面、网络断开都不会终止 Server 端 PTY
- **重连恢复**：重新连接后自动恢复已有终端会话，回放缓冲输出
- **显式关闭**：只有 Client 发送 `close` 命令才会终止 PTY 进程
- **多终端**：支持同时打开多个终端 tab

## 安全

- Tailscale VPN 提供网络层加密
- Token 认证防止未授权连接
- Server 验证所有输入（session ID 格式、shell 白名单、尺寸上限）

## 支持的 Shell

- `powershell.exe` (Windows PowerShell 5.1，默认)
- `cmd.exe`
- `pwsh.exe` (PowerShell 7，需单独安装)
