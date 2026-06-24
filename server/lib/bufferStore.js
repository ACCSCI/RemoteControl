/**
 * Ring buffer for terminal output replay on reconnect.
 * Stores the last N bytes of output so a reconnecting client can catch up.
 */
export class BufferStore {
  #buffer;
  #maxBytes;
  #writePos = 0;
  #totalWritten = 0;

  constructor(maxBytes = 512 * 1024) {
    this.#maxBytes = maxBytes;
    this.#buffer = Buffer.alloc(maxBytes);
  }

  /**
   * Append data to the ring buffer.
   * @param {Buffer|string} data
   */
  append(data) {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const len = buf.length;

    if (len >= this.#maxBytes) {
      // Data larger than buffer: keep only the tail
      buf.copy(this.#buffer, 0, len - this.#maxBytes);
      this.#writePos = 0;
      this.#totalWritten += len;
      return;
    }

    const spaceToEnd = this.#maxBytes - this.#writePos;
    if (len <= spaceToEnd) {
      buf.copy(this.#buffer, this.#writePos);
    } else {
      // Wrap around
      buf.copy(this.#buffer, this.#writePos, 0, spaceToEnd);
      buf.copy(this.#buffer, 0, spaceToEnd);
    }

    this.#writePos = (this.#writePos + len) % this.#maxBytes;
    this.#totalWritten += len;
  }

  /**
   * Get all buffered data as a Buffer.
   * Returns the last min(totalWritten, maxBytes) bytes in correct order.
   */
  getAll() {
    const available = Math.min(this.#totalWritten, this.#maxBytes);
    if (available === 0) return Buffer.alloc(0);

    const result = Buffer.alloc(available);
    const start = (this.#writePos - available + this.#maxBytes) % this.#maxBytes;
    const firstPart = this.#maxBytes - start;

    if (firstPart >= available) {
      this.#buffer.copy(result, 0, start, start + available);
    } else {
      this.#buffer.copy(result, 0, start, start + firstPart);
      this.#buffer.copy(result, firstPart, 0, available - firstPart);
    }

    return result;
  }
}
