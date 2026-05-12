/**
 * Browser Pool — Enhanced for High Concurrency
 *
 * Features:
 * - Task queue with backpressure (queue when full, don't error)
 * - Session TTL with auto-cleanup (idle sessions expire)
 * - Health checks (detect dead contexts)
 * - Metrics integration
 */
import { chromium } from "playwright-core";
import { TaskQueue } from "./task-queue.js";
import { Metrics } from "./metrics.js";
export class BrowserPool {
    browser = null;
    sessions = new Map();
    config;
    queue;
    metrics;
    cleanupTimer = null;
    constructor(config = {}) {
        this.config = {
            maxContexts: config.maxContexts ?? 5,
            launchOptions: config.launchOptions ?? { headless: true },
            sessionTTL: config.sessionTTL ?? 10 * 60 * 1000,
            cleanupInterval: config.cleanupInterval ?? 60 * 1000,
            queueSize: config.queueSize ?? 20,
            queueTimeout: config.queueTimeout ?? 30 * 1000,
        };
        this.queue = new TaskQueue({ maxSize: this.config.queueSize, timeout: this.config.queueTimeout });
        this.metrics = new Metrics();
    }
    async launch() {
        if (this.browser)
            return;
        this.browser = await chromium.launch(this.config.launchOptions);
        this.startCleanup();
    }
    /**
     * Create or get a context. Queues if pool is full.
     */
    async createContext(id) {
        if (!this.browser)
            throw new Error("Browser not launched. Call launch() first.");
        // Existing context — update activity and return
        const existing = this.sessions.get(id);
        if (existing) {
            existing.lastActive = Date.now();
            return existing.context;
        }
        // Pool full — queue and wait
        if (this.sessions.size >= this.config.maxContexts) {
            await this.queue.acquire();
        }
        // Re-check after queue wait (another caller may have closed a session)
        if (this.sessions.size >= this.config.maxContexts) {
            this.queue.release();
            throw new Error(`Max contexts (${this.config.maxContexts}) reached after queue wait.`);
        }
        // Health check: verify browser is still connected
        if (!this.browser.isConnected()) {
            this.browser = await chromium.launch(this.config.launchOptions);
        }
        const context = await this.browser.newContext({
            viewport: { width: 1280, height: 720 },
        });
        this.sessions.set(id, { context, lastActive: Date.now(), id });
        this.metrics.sessionCreated();
        return context;
    }
    getContext(id) {
        const meta = this.sessions.get(id);
        if (meta)
            meta.lastActive = Date.now();
        return meta?.context;
    }
    touch(id) {
        const meta = this.sessions.get(id);
        if (meta)
            meta.lastActive = Date.now();
    }
    async closeContext(id) {
        const meta = this.sessions.get(id);
        if (meta) {
            try {
                await meta.context.close();
            }
            catch { /* context may already be closed */ }
            this.sessions.delete(id);
            this.metrics.sessionClosed();
            this.queue.release();
        }
    }
    get activeCount() {
        return this.sessions.size;
    }
    getQueueStats() {
        return this.queue.stats();
    }
    getMetrics() {
        return this.metrics.snapshot(this.queue.stats());
    }
    trackOperation(durationMs, error = false) {
        this.metrics.operationComplete(durationMs, error);
    }
    /**
     * Periodically clean up idle sessions.
     */
    startCleanup() {
        if (this.cleanupTimer)
            return;
        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [id, meta] of this.sessions) {
                if (now - meta.lastActive > this.config.sessionTTL) {
                    this.closeContext(id).catch(() => { });
                }
            }
        }, this.config.cleanupInterval);
        this.cleanupTimer.unref?.();
    }
    async shutdown() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        for (const [id] of this.sessions)
            await this.closeContext(id);
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
//# sourceMappingURL=pool.js.map