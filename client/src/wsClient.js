import { MSG } from './protocol.js';

/**
 * WebSocket client wrapper with reconnect, message dispatch, and heartbeat.
 *
 * @event state-change - Fires (state) when connection state changes
 * @event message     - Fires (parsed) on every received JSON message
 */
export class WSClient extends EventTarget {
  #url = '';
  #token = '';
  #ws = null;
  #reconnectTimer = null;
  #pingTimer = null;
  #reconnectDelay = 1000;
  #maxReconnectDelay = 30000;
  #state = 'disconnected'; // disconnected | connecting | connected

  get state() { return this.#state; }

  #setState(s) {
    if (this.#state !== s) {
      this.#state = s;
      this.dispatchEvent(new CustomEvent('state-change', { detail: s }));
    }
  }

  /**
   * Connect to the WebSocket server.
   * @param {string} host - e.g. "100.x.x.x"
   * @param {string} token - auth token
   * @param {number} port - server port (from /api/config)
   */
  connect(host, token, port) {
    this.#url = `ws://${host}:${port}/ws`;
    this.#token = token;
    this.#reconnectDelay = 1000;
    this.#doConnect();
  }

  #doConnect() {
    if (this.#ws) {
      this.#ws.onclose = null;
      this.#ws.onerror = null;
      this.#ws.onmessage = null;
      this.#ws.close();
    }

    this.#setState('connecting');
    this.dispatchEvent(new CustomEvent('status', { detail: 'connecting' }));

    const ws = new WebSocket(this.#url);
    this.#ws = ws;

    ws.onopen = () => {
      // Send auth immediately
      ws.send(JSON.stringify({ type: MSG.AUTH, token: this.#token }));
    };

    ws.onmessage = (e) => {
      let parsed;
      try { parsed = JSON.parse(e.data); } catch { return; }

      // Handle auth response
      if (parsed.type === MSG.AUTH_OK) {
        this.#setState('connected');
        this.#reconnectDelay = 1000;
        this.#startHeartbeat();
        this.dispatchEvent(new CustomEvent('status', { detail: 'connected' }));
      }
      if (parsed.type === MSG.AUTH_FAIL) {
        this.#setState('disconnected');
        ws.close();
        return;
      }

      // Forward all messages
      this.dispatchEvent(new CustomEvent('message', { detail: parsed }));
    };

    ws.onclose = () => {
      this.#stopHeartbeat();
      // Only reconnect if we were connected (not if user disconnected)
      this.#scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  #scheduleReconnect() {
    if (this.#state === 'disconnected') return;
    this.#setState('connecting');
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#doConnect();
    }, this.#reconnectDelay);
    this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, this.#maxReconnectDelay);
  }

  #startHeartbeat() {
    this.#stopHeartbeat();
    this.#pingTimer = setInterval(() => this.send({ type: MSG.PING }), 30000);
  }

  #stopHeartbeat() {
    if (this.#pingTimer) {
      clearInterval(this.#pingTimer);
      this.#pingTimer = null;
    }
  }

  /**
   * Send a JSON-serializable object to the server.
   */
  send(obj) {
    if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(obj));
    }
  }

  /**
   * Close the connection (no reconnect).
   */
  disconnect() {
    this.#setState('disconnected');
    this.#stopHeartbeat();
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#ws) {
      this.#ws.onclose = null;
      this.#ws.close();
      this.#ws = null;
    }
  }
}
