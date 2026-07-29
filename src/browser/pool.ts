/**
 * Browser Pool — Enhanced for High Concurrency
 *
 * Features:
 * - Task queue with backpressure (queue when full, don't error)
 * - Session TTL with auto-cleanup (idle sessions expire)
 * - Health checks (detect dead contexts)
 * - Metrics integration
 */

import { Browser, BrowserContext, chromium, LaunchOptions } from "playwright";
import { TaskQueue } from "./task-queue.js";
import { Metrics } from "./metrics.js";
import { assertResolvedNavigationAllowed } from "../security/url-policy.js";

export interface PoolConfig {
  maxContexts: number;
  launchOptions?: LaunchOptions;
  sessionTTL: number;         // Session idle timeout in ms (default: 10 min)
  cleanupInterval: number;    // Cleanup sweep interval in ms (default: 60s)
  queueSize: number;          // Max waiting requests (default: 20)
  queueTimeout: number;       // Max queue wait in ms (default: 30s)
}

interface SessionMeta {
  context: BrowserContext;
  lastActive: number;
  id: string;
}

export class BrowserPool {
  private browser: Browser | null = null;
  private sessions = new Map<string, SessionMeta>();
  private config: PoolConfig;
  private queue: TaskQueue;
  private metrics: Metrics;
  private cleanupTimer: any = null;
  private launchPromise: Promise<void> | null = null;
  private onContextClosed?: (id: string, reason: "explicit" | "expired" | "shutdown") => void;

  constructor(config: Partial<PoolConfig> = {}) {
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

  async launch(): Promise<void> {
    if (this.browser) return;
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
  async createContext(id: string): Promise<BrowserContext> {
    if (!this.browser) throw new Error("Browser not launched. Call launch() first.");

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

    let context: BrowserContext;
    try {
      context = await this.browser!.newContext({ viewport: { width: 1280, height: 720 } });
      await context.route("**/*", async (route) => {
        try {
          await assertResolvedNavigationAllowed(route.request().url());
          await route.continue();
        } catch {
          await route.abort("blockedbyclient");
        }
      });
    } catch (error) {
      this.queue.release();
      throw error;
    }

    this.sessions.set(id, { context, lastActive: Date.now(), id });
    this.metrics.sessionCreated();

    return context;
  }

  getContext(id: string): BrowserContext | undefined {
    const meta = this.sessions.get(id);
    if (meta) meta.lastActive = Date.now();
    return meta?.context;
  }

  touch(id: string): void {
    const meta = this.sessions.get(id);
    if (meta) meta.lastActive = Date.now();
  }

  async closeContext(id: string, reason: "explicit" | "expired" | "shutdown" = "explicit"): Promise<void> {
    const meta = this.sessions.get(id);
    if (meta) {
      try {
        await meta.context.close();
      } catch { /* context may already be closed */ }
      this.sessions.delete(id);
      this.metrics.sessionClosed();
      this.queue.release();
      this.onContextClosed?.(id, reason);
    }
  }

  get activeCount(): number {
    return this.sessions.size;
  }

  getQueueStats() {
    return this.queue.stats();
  }

  getMetrics() {
    return this.metrics.snapshot(this.queue.stats());
  }

  health(): { ready: boolean; browserLaunched: boolean; browserConnected: boolean; activeContexts: number } {
    return {
      ready: true,
      browserLaunched: this.browser !== null,
      browserConnected: this.browser?.isConnected() ?? false,
      activeContexts: this.sessions.size,
    };
  }

  setContextClosedListener(listener: (id: string, reason: "explicit" | "expired" | "shutdown") => void): void {
    this.onContextClosed = listener;
  }

  trackOperation(durationMs: number, error = false): void {
    this.metrics.operationComplete(durationMs, error);
  }

  /**
   * Periodically clean up idle sessions.
   */
  private startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, meta] of this.sessions) {
        if (now - meta.lastActive > this.config.sessionTTL) {
          this.closeContext(id, "expired").catch(() => {});
        }
      }
    }, this.config.cleanupInterval);
    this.cleanupTimer.unref?.();
  }

  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const [id] of this.sessions) await this.closeContext(id, "shutdown");
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
