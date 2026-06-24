import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { handleUpgrade } from './lib/wsRouter.js';
import config from './lib/config.js';

// MIME types for static file serving
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

// HTTP server: serve client static files
const server = http.createServer((req, res) => {
  // Only serve GET requests
  if (req.method !== 'GET') {
    res.writeHead(405);
    return res.end('Method Not Allowed');
  }

  // API: return server config for client auto-discovery
  if (req.url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ port: config.port }));
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  // Prevent directory traversal
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');

  const fullPath = path.join(config.clientDir, filePath);
  const ext = path.extname(fullPath).toLowerCase();

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for non-file paths
      if (ext === '' || !MIME[ext]) {
        fs.readFile(path.join(config.clientDir, 'index.html'), (err2, html) => {
          if (err2) {
            res.writeHead(404);
            return res.end('Not Found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        });
        return;
      }
      res.writeHead(404);
      return res.end('Not Found');
    }

    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  });
});

// WebSocket server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  // Only upgrade /ws path
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleUpgrade(ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Start
server.listen(config.port, '0.0.0.0', () => {
  console.log(`\n  RemoteControl Server v1.0.0`);
  console.log(`  ──────────────────────────────`);
  console.log(`  Listening on http://0.0.0.0:${config.port}`);
  console.log(`  WebSocket:   ws://0.0.0.0:${config.port}/ws`);
  console.log(`  Auth token:  ${config.authToken.slice(0, 8)}...`);
  console.log(`  Shell:       ${config.defaultShell}`);
  console.log(`  Max sessions: ${config.maxSessions}\n`);
  console.log(`  Open from another machine:`);
  console.log(`  http://<tailscale-ip>:${config.port}\n`);
});
