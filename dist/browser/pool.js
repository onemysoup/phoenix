/**
 * Browser Pool — Enhanced for High Concurrency
 *
 * Features:
 * - Task queue with backpressure (queue when full, don't error)
 * - Session TTL with auto-cleanup (idle sessions expire)
 * - Health checks (detect dead contexts)
 * - Metrics integration
 */
import { chromium } from "playwright";
import { TaskQueue } from "./task-queue.js";
import { Metrics } from "./metrics.js";
import { assertResolvedNavigationAllowed } from "../security/url-policy.js";
export class BrowserPool {
    browser = null;
    sessions = new Map();
    config;
    queue;
    metrics;
    cleanupTimer = null;
    launchPromise = null;
    onContextClosed;
    constructor(config = {}) {
        this.config = {
            maxContexts: config.maxContexts ?? 5,
            launchOptions: config.launchOptions ?? { headless: true },
            sessionTTL: config.sessionTTL ?? 10 * 60 * 1000,
            cleanupInterval: config.cleanupInterval ?? 60 * 1000,
            queueSize: config.queueSize ?? 20,
            queueTimeout: config.queueTimeout ?? 30 * 1000,
        };
        this.queue = new TaskQueue({ concurrency: this.config.maxContexts, maxSize: this.config.queueSize, timeout: this.config.queueTimeout });
        this.metrics = new Metrics();
    }
    async launch() {
        if (this.browser)
            return;
        if (!this.launchPromise) {
            this.launchPromise = chromium.launch(this.config.launchOptions).then((browser) => {
                this.browser = browser;
                this.startCleanup();
            }).finally(() => { this.launchPromise = null; });
        }
        await this.launchPromise;
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
        // Every new context acquires a slot. This is a real semaphore: callers
        // wait until closeContext/TTL returns a slot instead of failing at capacity.
        await this.queue.acquire();
        // Health check: verify browser is still connected
        if (!this.browser.isConnected()) {
            this.browser = null;
            await this.launch();
        }
        let context;
        try {
            context = await this.browser.newContext({ viewport: { width: 1280, height: 720 } });
            await context.route("**/*", async (route) => {
                try {
                    await assertResolvedNavigationAllowed(route.request().url());
                    await route.continue();
                }
                catch {
                    await route.abort("blockedbyclient");
                }
            });
        }
        catch (error) {
            this.queue.release();
            throw error;
        }
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
    async closeContext(id, reason = "explicit") {
        const meta = this.sessions.get(id);
        if (meta) {
            try {
                await meta.context.close();
            }
            catch { /* context may already be closed */ }
            this.sessions.delete(id);
            this.metrics.sessionClosed();
            this.queue.release();
            this.onContextClosed?.(id, reason);
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
    health() {
        return {
            ready: true,
            browserLaunched: this.browser !== null,
            browserConnected: this.browser?.isConnected() ?? false,
            activeContexts: this.sessions.size,
        };
    }
    setContextClosedListener(listener) {
        this.onContextClosed = listener;
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
                    this.closeContext(id, "expired").catch(() => { });
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
            await this.closeContext(id, "shutdown");
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
//# sourceMappingURL=pool.js.map