/**
 * Session Mutex — Serializes operations per session
 *
 * Prevents concurrent tool calls on the same session from
 * racing against each other (e.g., two clicks on the same page).
 *
 * Uses a Promise chain: each call waits for the previous to finish.
 */
export declare class SessionMutex {
    private chains;
    /**
     * Run a function exclusively for the given session.
     * If another operation is in progress for this session, waits for it.
     */
    run<T>(sessionId: string, fn: () => Promise<T>): Promise<T>;
    /**
     * Remove a session's chain (call on session close).
     */
    release(sessionId: string): void;
    /**
     * Number of sessions with pending operations.
     */
    get size(): number;
}
