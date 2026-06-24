import crypto from 'node:crypto';
import config from './config.js';
import { TerminalManager } from './terminalManager.js';

const tm = new TerminalManager();

// Subscribe to PTY events -> broadcast to subscribed clients
tm.addEventListener('output', (e) => {
  const { id, data } = e.detail;
  const msg = JSON.stringify({ type: 'output', id, data });
  for (const ws of subscriptions.get(id) || []) {
    if (ws.readyState === 1 /* OPEN */) ws.send(msg);
  }
});

tm.addEventListener('exit', (e) => {
  const { id, exitCode } = e.detail;
  const msg = JSON.stringify({ type: 'exit', id, exitCode });
  for (const ws of subscriptions.get(id) || []) {
    if (ws.readyState === 1) ws.send(msg);
  }
  // Clean up subscriptions for this session
  subscriptions.delete(id);
});

// subscriptions: sessionId -> Set<WebSocket>
const subscriptions = new Map();

// ws -> Set<sessionId> (what each client is subscribed to)
const clientSubscriptions = new WeakMap();

// Rate limiting for auth attempts
const authAttempts = new Map(); // ip -> { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  const record = authAttempts.get(ip);
  if (!record || now > record.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (record.count >= 5) return false;
  record.count++;
  return true;
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function subscribeClient(ws, sessionId) {
  if (!subscriptions.has(sessionId)) {
    subscriptions.set(sessionId, new Set());
  }
  subscriptions.get(sessionId).add(ws);

  let subs = clientSubscriptions.get(ws);
  if (!subs) {
    subs = new Set();
    clientSubscriptions.set(ws, subs);
  }
  subs.add(sessionId);
}

function unsubscribeClient(ws, sessionId) {
  const set = subscriptions.get(sessionId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) subscriptions.delete(sessionId);
  }
  const subs = clientSubscriptions.get(ws);
  if (subs) subs.delete(sessionId);
}

function unsubscribeAll(ws) {
  const subs = clientSubscriptions.get(ws);
  if (subs) {
    for (const id of subs) {
      const set = subscriptions.get(id);
      if (set) {
        set.delete(ws);
        if (set.size === 0) subscriptions.delete(id);
      }
    }
  }
}

function handleMessage(ws, msg) {
  let parsed;
  try {
    parsed = JSON.parse(msg);
  } catch {
    return send(ws, { type: 'error', message: 'Invalid JSON' });
  }

  const { type } = parsed;

  // --- Authentication ---
  if (type === 'auth') {
    if (ws._authenticated) {
      return send(ws, { type: 'error', message: 'Already authenticated' });
    }

    const ip = ws._ip;
    if (!checkRateLimit(ip)) {
      return send(ws, { type: 'auth-fail', reason: 'Too many attempts' });
    }

    if (parsed.token === config.authToken) {
      ws._authenticated = true;
      clearTimeout(ws._authTimer);
      send(ws, { type: 'auth-ok' });
    } else {
      send(ws, { type: 'auth-fail', reason: 'Invalid token' });
    }
    return;
  }

  // All subsequent messages require auth
  if (!ws._authenticated) {
    return send(ws, { type: 'error', message: 'Not authenticated' });
  }

  // --- Terminal commands ---
  switch (type) {
    case 'create': {
      const { id, shell, cwd } = parsed;
      if (!id || typeof id !== 'string') {
        return send(ws, { type: 'create-fail', id: id || '?', reason: 'Invalid session id' });
      }
      try {
        const info = tm.createSession(id, shell || config.defaultShell, cwd);
        subscribeClient(ws, id);
        send(ws, { type: 'created', ...info });
      } catch (err) {
        send(ws, { type: 'create-fail', id, reason: err.message });
      }
      break;
    }

    case 'input': {
      const { id, data } = parsed;
      if (!id || !data) return;
      if (!tm.writeToSession(id, data)) {
        send(ws, { type: 'error', message: `Unknown session: ${id}` });
      }
      break;
    }

    case 'resize': {
      const { id, cols, rows } = parsed;
      if (!id) return;
      if (!tm.resizeSession(id, cols, rows)) {
        send(ws, { type: 'error', message: `Unknown session: ${id}` });
      }
      break;
    }

    case 'close': {
      const { id } = parsed;
      if (!id) return;
      if (tm.killSession(id)) {
        unsubscribeClient(ws, id);
        send(ws, { type: 'closed', id });
      } else {
        send(ws, { type: 'error', message: `Unknown session: ${id}` });
      }
      break;
    }

    case 'list': {
      const sessions = tm.listSessions();
      // Auto-subscribe client to all existing sessions on list
      for (const s of sessions) {
        subscribeClient(ws, s.id);
      }
      send(ws, { type: 'list-ok', sessions });
      break;
    }

    case 'get-buffer': {
      const { id } = parsed;
      if (!id) return;
      const buf = tm.getBufferedOutput(id);
      if (buf !== null) {
        send(ws, { type: 'buffer-data', id, data: buf });
      } else {
        send(ws, { type: 'error', message: `Unknown session: ${id}` });
      }
      break;
    }

    case 'ping': {
      send(ws, { type: 'pong' });
      break;
    }

    default:
      send(ws, { type: 'error', message: `Unknown message type: ${type}` });
  }
}

/**
 * Handle a new WebSocket upgrade.
 * @param {import('ws').WebSocket} ws
 * @param {import('http').IncomingMessage} req
 */
export function handleUpgrade(ws, req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  ws._ip = ip;
  ws._authenticated = false;
  ws._authTimer = setTimeout(() => {
    if (!ws._authenticated) {
      ws.close(4001, 'Auth timeout');
    }
  }, config.authTimeoutMs);

  // Ping/pong keep-alive
  const pingTimer = setInterval(() => {
    if (ws.readyState === 1) {
      ws.ping();
    }
  }, config.pingIntervalMs);

  ws.on('message', (data) => handleMessage(ws, data.toString()));

  ws.on('close', () => {
    clearTimeout(ws._authTimer);
    clearInterval(pingTimer);
    unsubscribeAll(ws);
  });
}

export { tm as terminalManager };
