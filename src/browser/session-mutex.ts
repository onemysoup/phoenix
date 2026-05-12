/**
 * Session Mutex — Serializes operations per session
 *
 * Prevents concurrent tool calls on the same session from
 * racing against each other (e.g., two clicks on the same page).
 *
 * Uses a Promise chain: each call waits for the previous to finish.
 */

export class SessionMutex {
  private chains = new Map<string, Promise<void>>();

  /**
   * Run a function exclusively for the given session.
   * If another operation is in progress for this session, waits for it.
   */
  async run<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(sessionId) ?? Promise.resolve();

    const current = prev.then(fn, fn); // Run even if previous failed

    // Store the promise (without result, just completion)
    this.chains.set(sessionId, current.then(() => {}, () => {}));

    return current;
  }

  /**
   * Remove a session's chain (call on session close).
   */
  release(sessionId: string): void {
    this.chains.delete(sessionId);
  }

  /**
   * Number of sessions with pending operations.
   */
  get size(): number {
    return this.chains.size;
  }
}
