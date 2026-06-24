import { TerminalTab } from './terminalTab.js';
import { MSG } from './protocol.js';

/**
 * Manages terminal tabs: creation, switching, closing, and mapping to server sessions.
 */
export class TabBar {
  /** @type {Map<string, TerminalTab>} sessionId -> TerminalTab */
  tabs = new Map();
  /** @type {string|null} currently active session ID */
  #activeId = null;
  /** @type {HTMLElement} */
  #tabsEl;
  /** @type {HTMLElement} */
  #containerEl;
  /** @type {Function} */
  #sendFn;

  /**
   * @param {HTMLElement} tabsEl - The tab bar element (where tab buttons go)
   * @param {HTMLElement} containerEl - The terminal container element
   * @param {Function} sendFn - Function to send messages to server
   */
  constructor(tabsEl, containerEl, sendFn) {
    this.#tabsEl = tabsEl;
    this.#containerEl = containerEl;
    this.#sendFn = sendFn;
  }

  /**
   * Create a new terminal tab (sends 'create' to server).
   * @param {string} shell - Shell name
   */
  createTab(shell = 'powershell.exe') {
    const id = 'tab-' + crypto.randomUUID();
    this.#sendFn({ type: MSG.CREATE, id, shell });
    // Tab will be added when server responds with 'created'
    return id;
  }

  /**
   * Called when server responds with 'created'.
   */
  addTab(id, shell) {
    const tab = new TerminalTab(id, this.#containerEl, this.#sendFn, (sessionId, code) => {
      this.#onTabExit(sessionId, code);
    });
    this.tabs.set(id, tab);
    this.#renderTabButtons();
    this.switchTo(id);
    this.#updateFooter();
    return tab;
  }

  /**
   * Add a tab for an existing session (on reconnect).
   */
  restoreTab(id, shell) {
    // Don't duplicate if already exists
    if (this.tabs.has(id)) return this.tabs.get(id);
    return this.addTab(id, shell);
  }

  /**
   * Switch to a specific tab.
   */
  switchTo(sessionId) {
    // Hide all, show target
    for (const [id, tab] of this.tabs) {
      if (id === sessionId) {
        tab.show();
      } else {
        tab.hide();
      }
    }
    this.#activeId = sessionId;
    this.#renderTabButtons();
  }

  /**
   * Close a tab (sends 'close' to server).
   */
  closeTab(sessionId) {
    this.#sendFn({ type: MSG.CLOSE, id: sessionId });
  }

  /**
   * Called when server confirms session closed.
   */
  removeTab(id) {
    const tab = this.tabs.get(id);
    if (tab) {
      tab.dispose();
      this.tabs.delete(id);
    }

    // Switch to another tab if the active one was closed
    if (this.#activeId === id) {
      const remaining = [...this.tabs.keys()];
      if (remaining.length > 0) {
        this.switchTo(remaining[remaining.length - 1]);
      } else {
        this.#activeId = null;
      }
    }

    this.#renderTabButtons();
    this.#updateFooter();
  }

  get activeId() { return this.#activeId; }
  get count() { return this.tabs.size; }

  /**
   * Render tab buttons in the tab bar.
   */
  #renderTabButtons() {
    this.#tabsEl.innerHTML = '';

    for (const [id, tab] of this.tabs) {
      const btn = document.createElement('div');
      btn.className = 'tab' + (id === this.#activeId ? ' active' : '');

      const label = document.createElement('span');
      label.className = 'tab-label';
      // Truncate session ID for display
      const shortId = id.slice(4, 12);
      label.textContent = `Terminal ${shortId}`;
      label.title = id;

      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '×';
      close.title = '关闭终端';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(id);
      });

      btn.appendChild(label);
      btn.appendChild(close);
      btn.addEventListener('click', () => this.switchTo(id));

      this.#tabsEl.appendChild(btn);
    }
  }

  #onTabExit(sessionId, exitCode) {
    // Visual indicator on the tab
    const tab = this.tabs.get(sessionId);
    if (tab) {
      // Add a dead indicator to the tab button
      this.#renderTabButtons();
    }
  }

  #updateFooter() {
    const el = document.getElementById('footer-info');
    if (el) {
      el.textContent = `Sessions: ${this.tabs.size}`;
    }
  }
}
