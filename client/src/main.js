import { WSClient } from './wsClient.js';
import { TabBar } from './tabBar.js';
import { MSG } from './protocol.js';

// --- DOM Elements ---
const overlay = document.getElementById('connect-overlay');
const app = document.getElementById('app');
const inputHost = document.getElementById('input-host');
const inputPort = document.getElementById('input-port');
const inputToken = document.getElementById('input-token');
const btnConnect = document.getElementById('btn-connect');
const connectError = document.getElementById('connect-error');
const statusEl = document.getElementById('status');
const tabsEl = document.getElementById('tabs');
const containerEl = document.getElementById('terminal-container');
const btnNewTab = document.getElementById('btn-new-tab');
const footerInfo = document.getElementById('footer-info');

// --- State ---
let wsClient;
let tabBar;
let serverPort = null; // fetched from /api/config

// --- Connect ---
function doConnect() {
  const host = inputHost.value.trim();
  const port = parseInt(inputPort.value) || serverPort || location.port || undefined;
  const token = inputToken.value.trim();

  if (!host) {
    connectError.textContent = '请输入服务器地址';
    return;
  }
  if (!token) {
    connectError.textContent = '请输入认证 Token';
    return;
  }

  connectError.textContent = '';
  btnConnect.disabled = true;
  btnConnect.textContent = '连接中...';

  // Save settings (port is saved only if explicitly typed)
  localStorage.setItem('rc-host', host);
  localStorage.setItem('rc-token', token);

  wsClient = new WSClient();

  wsClient.addEventListener('status', (e) => {
    const state = e.detail;
    if (state === 'connected') {
      overlay.classList.add('hidden');
      app.classList.remove('hidden');
      statusEl.className = 'status connected';
      statusEl.textContent = '● 已连接';

      // Request existing sessions
      wsClient.send({ type: MSG.LIST });

      tabBar = new TabBar(tabsEl, containerEl, (msg) => wsClient.send(msg));
    }
  });

  wsClient.addEventListener('state-change', (e) => {
    const state = e.detail;
    if (state === 'connecting' && !app.classList.contains('hidden')) {
      statusEl.className = 'status connecting';
      statusEl.textContent = '● 重连中...';
    }
  });

  wsClient.addEventListener('message', (e) => {
    handleMessage(e.detail);
  });

  // Reset button on failure
  setTimeout(() => {
    if (wsClient.state !== 'connected') {
      btnConnect.disabled = false;
      btnConnect.textContent = '连接';
      if (wsClient.state === 'disconnected') {
        connectError.textContent = '连接失败，请检查地址和 Token';
      }
    }
  }, 3000);

  wsClient.connect(host, token, port);
}

// --- Message Handling ---
function handleMessage(msg) {
  switch (msg.type) {
    case MSG.AUTH_FAIL:
      connectError.textContent = msg.reason || '认证失败';
      btnConnect.disabled = false;
      btnConnect.textContent = '连接';
      wsClient?.disconnect();
      break;

    case MSG.CREATED:
      if (tabBar) {
        tabBar.addTab(msg.id, msg.shell);
      }
      break;

    case MSG.CREATE_FAIL:
      console.error('Create failed:', msg.reason);
      break;

    case MSG.OUTPUT: {
      const tab = tabBar?.tabs.get(msg.id);
      if (tab) tab.handleOutput(msg.data);
      break;
    }

    case MSG.EXIT: {
      const tab = tabBar?.tabs.get(msg.id);
      if (tab) tab.handleExit(msg.exitCode);
      break;
    }

    case MSG.CLOSED:
      tabBar?.removeTab(msg.id);
      break;

    case MSG.LIST_OK: {
      if (!tabBar) {
        tabBar = new TabBar(tabsEl, containerEl, (msg) => wsClient.send(msg));
      }
      if (msg.sessions && msg.sessions.length > 0) {
        for (const s of msg.sessions) {
          tabBar.restoreTab(s.id, s.shell);
        }
      }
      if (!tabBar || tabBar.count === 0) {
        tabBar.createTab();
      }
      break;
    }

    case MSG.BUFFER_DATA: {
      const tab = tabBar?.tabs.get(msg.id);
      if (tab) tab.handleOutput(msg.data);
      break;
    }

    case MSG.PONG:
      break;

    case MSG.ERROR:
      console.warn('Server error:', msg.message);
      break;
  }
}

// --- Event Listeners ---
btnConnect.addEventListener('click', doConnect);
inputToken.addEventListener('keydown', (e) => { if (e.key === 'Enter') doConnect(); });
inputHost.addEventListener('keydown', (e) => { if (e.key === 'Enter') doConnect(); });

btnNewTab.addEventListener('click', () => {
  tabBar?.createTab();
});

// --- Init ---
async function init() {
  // Restore saved settings
  const savedHost = localStorage.getItem('rc-host');
  const savedToken = localStorage.getItem('rc-token');
  if (savedHost) inputHost.value = savedHost;
  if (savedToken) inputToken.value = savedToken;

  // Fetch server config to get default port
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      serverPort = cfg.port;
      inputPort.value = cfg.port;
    }
  } catch {
    // Fetch fails during Vite dev (different origin) — user fills port manually
  }

  // If page is served from the server itself, auto-fill host as current hostname
  if (!savedHost && location.hostname && location.hostname !== 'localhost') {
    inputHost.value = location.hostname;
  }

  inputHost.focus();
}

init();
