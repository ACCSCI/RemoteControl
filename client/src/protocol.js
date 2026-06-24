/**
 * Shared message type constants. Keep in sync with server's wsRouter.js.
 */
export const MSG = {
  // Client -> Server
  AUTH:    'auth',
  CREATE:  'create',
  INPUT:   'input',
  RESIZE:  'resize',
  CLOSE:   'close',
  LIST:    'list',
  GET_BUFFER: 'get-buffer',
  PING:    'ping',

  // Server -> Client
  AUTH_OK:  'auth-ok',
  AUTH_FAIL:'auth-fail',
  CREATED: 'created',
  CREATE_FAIL: 'create-fail',
  OUTPUT:  'output',
  EXIT:    'exit',
  CLOSED:  'closed',
  LIST_OK: 'list-ok',
  BUFFER_DATA: 'buffer-data',
  PONG:    'pong',
  ERROR:   'error',
};
