import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { MSG } from './protocol.js';

/**
 * A single terminal tab. Binds an xterm.js Terminal to a remote PTY session.
 */
export class TerminalTab {
  /** @type {Terminal} */
  term;
  /** @type {FitAddon} */
  fitAddon;
  /** @type {HTMLElement} */
  containerEl;
  /** @type {string} */
  sessionId;
  /** @type {Function} */
  #sendFn;
  /** @type {Function} */
  #onExit;
  #resizeObserver;
  #disposed = false;

  /**
   * @param {string} sessionId - The server-side session ID
   * @param {HTMLElement} parentEl - Parent container to append terminal to
   * @param {Function} sendFn - Function to send messages to server
   * @param {Function} [onExit] - Callback when PTY exits
   */
  constructor(sessionId, parentEl, sendFn, onExit) {
    this.sessionId = sessionId;
    this.#sendFn = sendFn;
    this.#onExit = onExit;

    // Create terminal container
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'terminal-panel';
    this.containerEl.style.display = 'none';
    parentEl.appendChild(this.containerEl);

    // Create xterm instance
    this.term = new Terminal({
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        selectionBackground: '#33467c',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
      cursorBlink: true,
      scrollback: 5000,
    });

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);

    this.term.open(this.containerEl);

    // Use requestAnimationFrame to ensure DOM is ready before fitting
    requestAnimationFrame(() => {
      if (!this.#disposed) this.fitAddon.fit();
    });

    // Wire input: xterm keystroke -> server
    this.term.onData((data) => {
      this.#sendFn({
        type: MSG.INPUT,
        id: this.sessionId,
        data: btoa(unescape(encodeURIComponent(data))),
      });
    });

    // Wire resize
    this.term.onResize(({ cols, rows }) => {
      this.#sendFn({
        type: MSG.RESIZE,
        id: this.sessionId,
        cols,
        rows,
      });
    });

    // ResizeObserver for auto-fit
    this.#resizeObserver = new ResizeObserver(() => {
      if (this.containerEl.style.display !== 'none') {
        this.fitAddon.fit();
      }
    });
    this.#resizeObserver.observe(this.containerEl);
  }

  /**
   * Handle output from server (base64 encoded).
   */
  handleOutput(data) {
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(data), c => c.charCodeAt(0))
    );
    this.term.write(decoded);
  }

  /**
   * Handle PTY exit.
   */
  handleExit(exitCode) {
    this.term.write(`\r\n\x1b[38;5;208m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
    if (this.#onExit) this.#onExit(this.sessionId, exitCode);
  }

  /**
   * Show this terminal panel (and hide others).
   */
  show() {
    this.containerEl.style.display = 'flex';
    requestAnimationFrame(() => {
      if (!this.#disposed) this.fitAddon.fit();
      this.term.focus();
    });
  }

  /**
   * Hide this terminal panel.
   */
  hide() {
    this.containerEl.style.display = 'none';
  }

  /**
   * Fit the terminal to its container.
   */
  fit() {
    if (!this.#disposed) this.fitAddon.fit();
  }

  /**
   * Clean up resources.
   */
  dispose() {
    this.#disposed = true;
    if (this.#resizeObserver) this.#resizeObserver.disconnect();
    this.term.dispose();
    this.containerEl.remove();
  }
}
