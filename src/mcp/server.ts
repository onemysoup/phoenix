import { z } from "zod";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BrowserPool } from "../browser/pool.js";
import { BrowserSession } from "../browser/context.js";
import { SessionMutex } from "../browser/session-mutex.js";
import { AuditLog } from "../observability/audit-log.js";
import { llmMetrics } from "../observability/llm-metrics.js";
import { renderPrometheusMetrics } from "../observability/prometheus.js";

// Built-in tools
import { handleNavigate, navigateSchema } from "./tools/navigate.js";
import { handleClick, clickSchema } from "./tools/click.js";
import { handleType, typeSchema } from "./tools/type.js";
import { handleExtract, extractSchema } from "./tools/extract.js";
import { handleScreenshot, screenshotSchema } from "./tools/screenshot.js";
import { handleEvaluate, evaluateSchema } from "./tools/evaluate.js";
import { handleScroll, scrollSchema } from "./tools/scroll.js";
import { handleWait, waitSchema } from "./tools/wait.js";

// Dynamic page tools (Phase 2)
import { handleSmartWait, smartWaitSchema } from "./tools/smart-wait.js";
import { handleInfiniteScroll, infiniteScrollSchema } from "./tools/infinite-scroll.js";
import { handleShadowExtract, shadowExtractSchema } from "./tools/shadow-dom.js";
import { handleSwitchFrame, switchFrameSchema } from "./tools/iframe.js";
import { handleFrameEvaluate, frameEvaluateSchema } from "./tools/frame-evaluate.js";
import { handleFrameExtract, frameExtractSchema } from "./tools/frame-extract.js";
import { handleSpaMonitor, spaMonitorSchema } from "./tools/spa-monitor.js";

// Self-healing tool (Phase 3)
import { handleSelfHealingRun, selfHealingRunSchema } from "./tools/self-healing-run.js";

const sessionIdParam = z
  .string()
  .describe("Browser session ID (returned by session_create)");

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "phoenix",
    version: "1.0.0",
  });

  const pool = new BrowserPool({ maxContexts: 5 });
  const sessions: Map<string, BrowserSession> = new Map();
  const terminatedSessionIds = new Set<string>();
  const terminatedSessionOrder: string[] = [];
  const maxTerminatedSessions = 10_000;
  const mutex = new SessionMutex();
  const auditLog = new AuditLog();
  const markSessionTerminated = (sessionId: string) => {
    if (terminatedSessionIds.has(sessionId)) return;
    terminatedSessionIds.add(sessionId);
    terminatedSessionOrder.push(sessionId);
    if (terminatedSessionOrder.length > maxTerminatedSessions) {
      const oldest = terminatedSessionOrder.shift();
      if (oldest) terminatedSessionIds.delete(oldest);
    }
  };
  pool.setContextClosedListener((sessionId) => {
    sessions.get(sessionId)?.markClosed();
    sessions.delete(sessionId);
    markSessionTerminated(sessionId);
    mutex.release(sessionId);
  });

  async function getOrCreateSession(sessionId: string): Promise<BrowserSession> {
    if (terminatedSessionIds.has(sessionId)) {
      throw new Error(`Session ${sessionId} is closed or expired. Create a new session instead.`);
    }
    if (sessions.has(sessionId) && !sessions.get(sessionId)!.isClosed) {
      pool.touch(sessionId);
      return sessions.get(sessionId)!;
    }
    await pool.launch();
    const context = await pool.createContext(sessionId);
    const session = new BrowserSession(context);
    sessions.set(sessionId, session);
    return session;
  }

  /**
   * Wrap a tool handler with session mutex (serializes per-session operations)
   * and metrics tracking.
   */
  function withConcurrency<T>(
    sessionId: string,
    operationName: string,
    fn: (session: BrowserSession) => Promise<T>
  ): Promise<T> {
    return mutex.run(sessionId, async () => {
      const start = Date.now();
      const session = await getOrCreateSession(sessionId);
      try {
        const result = await fn(session);
        pool.trackOperation(Date.now() - start, false);
        auditLog.record({ timestamp: Date.now(), sessionId, operation: operationName, durationMs: Date.now() - start, success: true });
        return result;
      } catch (err) {
        pool.trackOperation(Date.now() - start, true);
        auditLog.record({ timestamp: Date.now(), sessionId, operation: operationName, durationMs: Date.now() - start, success: false, error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    });
  }

  // === Session management ===

  server.tool(
    "session_create",
    "Create a new browser session. Returns a session ID.",
    { url: z.string().url().optional().describe("Initial URL to navigate to") },
    async ({ url }) => {
      const sessionId = `session_${randomUUID()}`;
      const session = await getOrCreateSession(sessionId);
      await session.newPage(url ?? undefined);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ sessionId, url: url ?? "about:blank" }) }],
      };
    }
  );

  server.tool(
    "metrics_prometheus",
    "Return Prometheus-compatible runtime metrics for browser-pool, MCP operations, and LLM resilience.",
    {},
    async () => ({ content: [{ type: "text" as const, text: renderPrometheusMetrics(pool.getMetrics(), llmMetrics.snapshot()) }] })
  );

  server.tool(
    "session_close",
    "Close a browser session and release resources.",
    { sessionId: sessionIdParam },
    async ({ sessionId }) => {
      return mutex.run(sessionId, async () => {
        const session = sessions.get(sessionId);
        if (!session)
          return {
            content: [{ type: "text" as const, text: `Session ${sessionId} not found.` }],
            isError: true,
          };
        await pool.closeContext(sessionId);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ closed: sessionId }) }],
        };
      });
    }
  );

  // === Built-in browser tools ===

  server.tool("navigate", "Navigate the active page to a URL.", { sessionId: sessionIdParam, ...navigateSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "navigate", (session) => handleNavigate(session, params));
  });

  server.tool("click", "Click an element on the page by CSS selector.", { sessionId: sessionIdParam, ...clickSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "click", (session) => handleClick(session, params));
  });

  server.tool("type", "Type text into an input field. Optionally press Enter to submit.", { sessionId: sessionIdParam, ...typeSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "type", (session) => handleType(session, params));
  });

  server.tool("extract", "Extract data from elements matching a CSS selector.", { sessionId: sessionIdParam, ...extractSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "extract", (session) => handleExtract(session, params));
  });

  server.tool("screenshot", "Take a screenshot of the current page.", { sessionId: sessionIdParam, ...screenshotSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "screenshot", (session) => handleScreenshot(session, params));
  });

  server.tool("evaluate", "Execute JavaScript in the page context and return the result.", { sessionId: sessionIdParam, ...evaluateSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "evaluate", (session) => handleEvaluate(session, params));
  });

  server.tool("scroll", "Scroll the page up, down, or to the bottom.", { sessionId: sessionIdParam, ...scrollSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "scroll", (session) => handleScroll(session, params));
  });

  server.tool("wait", "Wait for a condition: element, network idle, page load, or timeout.", { sessionId: sessionIdParam, ...waitSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "wait", (session) => handleWait(session, params));
  });

  server.tool("get_page_info", "Get current page URL, title, and optionally full HTML.", { sessionId: sessionIdParam, includeHtml: z.boolean().default(false) }, async ({ sessionId, includeHtml }) => {
      return withConcurrency(sessionId, "get_page_info", async (session) => {
      const snapshot = await session.getSnapshot();
      const info: Record<string, unknown> = { url: snapshot.url, title: snapshot.title };
      if (includeHtml) info.html = snapshot.html;
      return { content: [{ type: "text" as const, text: JSON.stringify(info) }] };
    });
  });

  // === Dynamic page tools (Phase 2) ===

  server.tool("smart_wait", "Smart wait: DOM stability detection, custom JS condition, or element count stability.", { sessionId: sessionIdParam, ...smartWaitSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "smart_wait", (session) => handleSmartWait(session, params));
  });

  server.tool("infinite_scroll", "Auto-scroll page and detect new content loading. Returns count of new elements.", { sessionId: sessionIdParam, ...infiniteScrollSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "infinite_scroll", (session) => handleInfiniteScroll(session, params));
  });

  server.tool("shadow_extract", "Extract data from elements inside Shadow DOM (recursive piercing).", { sessionId: sessionIdParam, ...shadowExtractSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "shadow_extract", (session) => handleShadowExtract(session, params));
  });

  server.tool("switch_frame", "Switch browser context to an iframe or back to main frame.", { sessionId: sessionIdParam, ...switchFrameSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "switch_frame", (session) => handleSwitchFrame(session, params));
  });

  server.tool("frame_evaluate", "Evaluate JavaScript in the currently selected iframe.", { sessionId: sessionIdParam, ...frameEvaluateSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "frame_evaluate", (session) => handleFrameEvaluate(session, params));
  });

  server.tool("frame_extract", "Extract text from matching elements in the currently selected iframe.", { sessionId: sessionIdParam, ...frameExtractSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "frame_extract", (session) => handleFrameExtract(session, params));
  });

  server.tool("spa_monitor", "Start or stop monitoring SPA route changes (pushState/popstate/hashchange).", { sessionId: sessionIdParam, ...spaMonitorSchema.shape }, async ({ sessionId, ...params }) => {
    return withConcurrency(sessionId, "spa_monitor", (session) => handleSpaMonitor(session, params));
  });

  // === Self-healing tool (Phase 3) ===

  server.tool(
    "self_healing_run",
    "Execute a browser action with automatic self-healing. When the action fails, the engine diagnoses the cause (using LLM if available) and retries with fixes. Supports: navigate, click, type, extract, wait_for.",
    { sessionId: sessionIdParam, ...selfHealingRunSchema.shape },
    async ({ sessionId, ...params }) => {
      return withConcurrency(sessionId, "self_healing_run", (session) => handleSelfHealingRun(session, params));
    }
  );

  // === Phase 4: Pool stats ===

  server.tool(
    "pool_stats",
    "Get pool and concurrency statistics: active sessions, queue depth, utilization, error rate.",
    {},
    async () => {
      const stats = pool.getMetrics();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(stats) }],
      };
    }
  );

  server.tool(
    "health",
    "Return MCP service and browser-pool readiness. The server is ready before a browser is lazily launched.",
    {},
    async () => ({ content: [{ type: "text" as const, text: JSON.stringify(pool.health()) }] })
  );

  server.tool(
    "audit_events",
    "Return recent bounded audit events. Error text is included; do not expose this tool to untrusted tenants.",
    { limit: z.number().int().min(1).max(500).default(100), sessionId: z.string().optional() },
    async ({ limit, sessionId }) => ({ content: [{ type: "text" as const, text: JSON.stringify({ events: auditLog.recent(limit, sessionId) }) }] })
  );

  // Cleanup
  const cleanup = async () => {
    await pool.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  return server;
}
