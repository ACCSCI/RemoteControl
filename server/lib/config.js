import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isWin = os.platform() === 'win32';
const ALLOWED_SHELLS = isWin
  ? ['powershell.exe', 'cmd.exe', 'pwsh.exe']
  : ['bash', 'zsh', 'sh'];

function getDefaultShell() {
  // On Windows, SHELL env var is often set by Git Bash to a unix path — ignore it
  if (!isWin && process.env.SHELL) return process.env.SHELL;
  return isWin ? 'powershell.exe' : '/bin/bash';
}

export default {
  port: parseInt(process.env.PORT || '18765'),
  authToken: process.env.AUTH_TOKEN || 'remotecontrol-change-me',
  defaultShell: getDefaultShell(),
  allowedShells: ALLOWED_SHELLS,
  bufferMaxBytes: 512 * 1024,  // 512 KB per session
  maxSessions: 10,
  authTimeoutMs: 5000,         // 5s to authenticate after connect
  pingIntervalMs: 30000,       // 30s heartbeat
  clientDir: path.join(__dirname, '..', '..', 'client', 'dist'),
};
