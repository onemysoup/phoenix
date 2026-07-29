/**
 * Browser Pool — Enhanced for High Concurrency
 *
 * Features:
 * - Task queue with backpressure (queue when full, don't error)
 * - Session TTL with auto-cleanup (idle sessions expire)
 * - Health checks (detect dead contexts)
 * - Metrics integration
 */
import { BrowserContext, LaunchOptions } from "playwright";
export interface PoolConfig {
    maxContexts: number;
    launchOptions?: LaunchOptions;
    sessionTTL: number;
    cleanupInterval: number;
    queueSize: number;
    queueTimeout: number;
}
export declare class BrowserPool {
    private browser;
    private sessions;
    private config;
    private queue;
    private metrics;
    private cleanupTimer;
    private launchPromise;
    private onContextClosed?;
    constructor(config?: Partial<PoolConfig>);
    launch(): Promise<void>;
    /**
     * Create or get a context. Queues if pool is full.
     */
    createContext(id: string): Promise<BrowserContext>;
    getContext(id: string): BrowserContext | undefined;
    touch(id: string): void;
    closeContext(id: string, reason?: "explicit" | "expired" | "shutdown"): Promise<void>;
    get activeCount(): number;
    getQueueStats(): {
        active: number;
        waiting: number;
        capacity: number;
        queueCapacity: number;
    };
    getMetrics(): import("./metrics.js").MetricsSnapshot;
    health(): {
        ready: boolean;
        browserLaunched: boolean;
        browserConnected: boolean;
        activeContexts: number;
    };
    setContextClosedListener(listener: (id: string, reason: "explicit" | "expired" | "shutdown") => void): void;
    trackOperation(durationMs: number, error?: boolean): void;
    /**
     * Periodically clean up idle sessions.
     */
    private startCleanup;
    shutdown(): Promise<void>;
}
