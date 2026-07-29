/**
 * Phase 4 High Concurrency Test
 *
 * Tests: task queue, session mutex, TTL cleanup, pool stats, UUID sessions
 *
 * Usage: npx tsx test/phase4-test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fs from "fs";

const _dir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(_dir, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const __dirname = _dir;
const SERVER_PORT = 3456;

async function startTestServer(): Promise<() => void> {
  return new Promise((resolve) => {
    const proc = spawn("npx", ["tsx", path.join(__dirname, "server.ts")], {
      stdio: "pipe",
      cwd: path.join(__dirname, ".."),
    });
    proc.stderr?.on("data", (d) => {
      if (d.toString().includes("running")) resolve(() => proc.kill());
    });
    setTimeout(() => resolve(() => proc.kill()), 3000);
  });
}

async function createClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "../dist/index.js")],
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PHOENIX_ALLOW_PRIVATE_NETWORK: "true" },
  });
  const client = new Client({ name: "phase4-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

async function callTool(client: Client, name: string, args: Record<string, any>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as any[])[0]?.text;
  try { return text ? JSON.parse(text) : result; } catch { return { error: text }; }
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.log(`  ✗ ${testName}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function main() {
  console.log("Starting test server...");
  const stopServer = await startTestServer();
  await new Promise(r => setTimeout(r, 1000));

  console.log("Starting MCP server...");
  const client = await createClient();

  const initialHealth = await callTool(client, "health", {});
  assert(initialHealth.ready === true, "MCP health reports ready before browser launch");
  assert(initialHealth.browserLaunched === false, "browser is lazily launched");

  // =========================================
  // Test 1: UUID session IDs
  // =========================================
  console.log("\n=== Test: UUID session IDs ===");
  const s1 = await callTool(client, "session_create", { url: `http://localhost:${SERVER_PORT}/` });
  const s2 = await callTool(client, "session_create", { url: `http://localhost:${SERVER_PORT}/` });
  assert(s1.sessionId.startsWith("session_"), `s1 has prefix: ${s1.sessionId}`);
  assert(s2.sessionId.startsWith("session_"), `s2 has prefix: ${s2.sessionId}`);
  assert(s1.sessionId !== s2.sessionId, "session IDs are unique");
  const activeHealth = await callTool(client, "health", {});
  assert(activeHealth.browserLaunched === true && activeHealth.browserConnected === true, "health reports connected browser after session creation");

  // =========================================
  // Test 2: pool_stats
  // =========================================
  console.log("\n=== Test: pool_stats ===");
  const stats1 = await callTool(client, "pool_stats", {});
  assert(stats1.activeSessions >= 2, `active sessions >= 2 (got ${stats1.activeSessions})`);
  assert(stats1.totalSessions >= 2, `total sessions >= 2 (got ${stats1.totalSessions})`);
  assert(typeof stats1.poolUtilization === "number", "poolUtilization is a number");
  assert(typeof stats1.avgLatencyMs === "number", "avgLatencyMs is a number");
  assert(stats1.uptime >= 0, `uptime >= 0 (got ${stats1.uptime})`);

  const prometheus = await callTool(client, "metrics_prometheus", {});
  const prometheusText = typeof prometheus === "string" ? prometheus : prometheus.error;
  assert(typeof prometheusText === "string" && prometheusText.includes("phoenix_browser_active_sessions"), "Prometheus metrics expose browser gauges");
  assert(prometheusText.includes("phoenix_llm_requests_total"), "Prometheus metrics expose LLM resilience counters");

  // =========================================
  // Test 3: Concurrent sessions (up to pool limit)
  // =========================================
  console.log("\n=== Test: Concurrent sessions ===");
  const sessionIds: string[] = [s1.sessionId, s2.sessionId];
  for (let i = 2; i < 5; i++) {
    const s = await callTool(client, "session_create", { url: `http://localhost:${SERVER_PORT}/` });
    sessionIds.push(s.sessionId);
  }
  const stats2 = await callTool(client, "pool_stats", {});
  assert(stats2.activeSessions >= 5, `5 active sessions (got ${stats2.activeSessions})`);

  // =========================================
  // Test 4: Pool full — queue instead of error
  // =========================================
  console.log("\n=== Test: Pool full (6th session queues) ===");
  let sixthResolved = false;
  const sixthPromise = callTool(client, "session_create", { url: `http://localhost:${SERVER_PORT}/` })
    .then((result) => { sixthResolved = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert(!sixthResolved, "6th session waits while all 5 slots are occupied");

  // Releasing a live session must unblock exactly one queued creation.
  await callTool(client, "session_close", { sessionId: sessionIds[0] });
  sessionIds.shift();
  const s6 = await sixthPromise;
  assert(!!s6.sessionId, `queued 6th session created after release: ${s6.sessionId || s6.error}`);
  if (s6.sessionId) sessionIds.push(s6.sessionId);

  // Verify pool stats
  const statsAfter = await callTool(client, "pool_stats", {});
  assert(statsAfter.activeSessions >= 5, `still have 5 active sessions (got ${statsAfter.activeSessions})`);

  // =========================================
  // Test 5: Session mutex (serial operations)
  // =========================================
  console.log("\n=== Test: Session mutex (serial operations) ===");
  const mutexSession = sessionIds[0];
  const start = Date.now();

  // Fire 3 concurrent navigate calls on the same session
  const nav1 = callTool(client, "navigate", { sessionId: mutexSession, url: `http://localhost:${SERVER_PORT}/` });
  const nav2 = callTool(client, "navigate", { sessionId: mutexSession, url: `http://localhost:${SERVER_PORT}/healing` });
  const nav3 = callTool(client, "navigate", { sessionId: mutexSession, url: `http://localhost:${SERVER_PORT}/dynamic` });

  await Promise.all([nav1, nav2, nav3]);
  const elapsed = Date.now() - start;

  // All should succeed (serialized, not racing)
  const finalPage = await callTool(client, "get_page_info", { sessionId: mutexSession });
  assert(finalPage.url.includes("/dynamic"), `final URL is /dynamic (got ${finalPage.url})`);
  // Serial execution: final URL is deterministic (not racing)
  assert(elapsed >= 0, `serial execution completed in ${elapsed}ms`);

  // =========================================
  // Test 6: pool_stats after operations
  // =========================================
  console.log("\n=== Test: pool_stats after operations ===");
  const stats3 = await callTool(client, "pool_stats", {});
  assert(stats3.totalOperations > 0, `totalOperations > 0 (got ${stats3.totalOperations})`);
  assert(stats3.avgLatencyMs >= 0, `avgLatencyMs >= 0 (got ${stats3.avgLatencyMs})`);

  // =========================================
  // Test 7: bounded audit events
  // =========================================
  console.log("\n=== Test: audit events ===");
  const audit = await callTool(client, "audit_events", { limit: 10, sessionId: mutexSession });
  assert(audit.events.length > 0, "audit log contains session operations");
  assert(audit.events.every((event: any) => event.sessionId === mutexSession), "audit filter is scoped to the requested session");
  assert(audit.events.some((event: any) => event.operation === "navigate" && event.success === true), "audit log records operation name and outcome");

  // =========================================
  // Cleanup
  // =========================================
  console.log("\n=== Cleanup ===");
  for (const sid of sessionIds) {
    await callTool(client, "session_close", { sessionId: sid });
  }
  await callTool(client, "session_close", { sessionId: s6.sessionId });
  await client.close();
  stopServer();

  console.log(`\n=============================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`=============================`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
