/**
 * Session Mutex — Serializes operations per session
 *
 * Prevents concurrent tool calls on the same session from
 * racing against each other (e.g., two clicks on the same page).
 *
 * Uses a Promise chain: each call waits for the previous to finish.
 */
export class SessionMutex {
    chains = new Map();
    /**
     * Run a function exclusively for the given session.
     * If another operation is in progress for this session, waits for it.
     */
    async run(sessionId, fn) {
        const prev = this.chains.get(sessionId) ?? Promise.resolve();
        const current = prev.then(fn, fn); // Run even if previous failed
        // Store the promise (without result, just completion)
        this.chains.set(sessionId, current.then(() => { }, () => { }));
        return current;
    }
    /**
     * Remove a session's chain (call on session close).
     */
    release(sessionId) {
        this.chains.delete(sessionId);
    }
    /**
     * Number of sessions with pending operations.
     */
    get size() {
        return this.chains.size;
    }
}
//# sourceMappingURL=session-mutex.js.map