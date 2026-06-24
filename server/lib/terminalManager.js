import os from 'node:os';
import pty from 'node-pty';
import { BufferStore } from './bufferStore.js';
import config from './config.js';

/**
 * Manages PTY sessions. Each session is a long-lived terminal process
 * that survives client disconnections.
 *
 * @event output - Fires (id, data) when a PTY produces output
 * @event exit   - Fires (id, exitCode) when a PTY exits
 */
export class TerminalManager extends EventTarget {
  #sessions = new Map();  // id -> { pty, shell, cwd, createdAt, buffer }

  get count() {
    return this.#sessions.size;
  }

  /**
   * Create a new PTY session.
   * @param {string} id    - Client-provided unique session ID
   * @param {string} shell - Shell executable (validated against allowlist)
   * @param {string} [cwd] - Working directory, defaults to user profile
   * @returns {{ id, shell, cwd, createdAt }}
   */
  createSession(id, shell, cwd) {
    if (this.#sessions.has(id)) {
      throw new Error(`Session ${id} already exists`);
    }
    if (this.#sessions.size >= config.maxSessions) {
      throw new Error(`Max sessions (${config.maxSessions}) reached`);
    }
    if (!config.allowedShells.includes(shell)) {
      throw new Error(`Shell "${shell}" not allowed. Use: ${config.allowedShells.join(', ')}`);
    }

    const resolvedCwd = cwd || os.homedir();
    const cols = 80;
    const rows = 24;

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: resolvedCwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    const buffer = new BufferStore(config.bufferMaxBytes);

    const session = {
      id,
      pty: ptyProcess,
      shell,
      cwd: resolvedCwd,
      createdAt: Date.now(),
      buffer,
      alive: true,
    };

    this.#sessions.set(id, session);

    ptyProcess.onData((data) => {
      buffer.append(data);
      this.dispatchEvent(new CustomEvent('output', { detail: { id, data } }));
    });

    ptyProcess.onExit(({ exitCode }) => {
      session.alive = false;
      this.dispatchEvent(new CustomEvent('exit', { detail: { id, exitCode } }));
      this.#sessions.delete(id);
    });

    return { id, shell, cwd: resolvedCwd, createdAt: session.createdAt };
  }

  /**
   * Kill a session. Only way to terminate a PTY.
   */
  killSession(id) {
    const session = this.#sessions.get(id);
    if (!session) return false;

    session.alive = false;
    session.pty.kill();
    this.#sessions.delete(id);
    return true;
  }

  /**
   * Write user input to a session's PTY.
   */
  writeToSession(id, data) {
    const session = this.#sessions.get(id);
    if (!session) return false;

    const decoded = Buffer.from(data, 'base64').toString('utf8');
    session.pty.write(decoded);
    return true;
  }

  /**
   * Resize a session's PTY.
   */
  resizeSession(id, cols, rows) {
    const session = this.#sessions.get(id);
    if (!session) return false;

    const c = Math.max(1, Math.min(500, cols));
    const r = Math.max(1, Math.min(200, rows));
    session.pty.resize(c, r);
    return true;
  }

  /**
   * Get buffered output for a session (for reconnect replay).
   */
  getBufferedOutput(id) {
    const session = this.#sessions.get(id);
    if (!session) return null;

    return session.buffer.getAll().toString('base64');
  }

  /**
   * List all active sessions.
   */
  listSessions() {
    const list = [];
    for (const [id, session] of this.#sessions) {
      list.push({ id, shell: session.shell, cwd: session.cwd, createdAt: session.createdAt });
    }
    return list;
  }

  /**
   * Check if a session exists.
   */
  hasSession(id) {
    return this.#sessions.has(id);
  }
}
