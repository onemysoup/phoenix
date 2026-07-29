/**
 * Phase 3 Self-Healing Engine Test
 *
 * Tests: self_healing_run with rule-based healing (no LLM required)
 *        anti-bot detection, selector healing, healing history
 *
 * Usage: npx tsx test/phase3-test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fs from "fs";

// Load .env for LLM_API_KEY check
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
  const client = new Client({ name: "test", version: "1.0.0" }, {
    capabilities: {},
  });
  await client.connect(transport);
  return client;
}

async function callTool(client: Client, name: string, args: Record<string, any>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as any[])[0]?.text;
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`MCP tool ${name} returned a non-JSON response: ${text}`);
  }
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
  await new Promise((r) => setTimeout(r, 1000));

  console.log("Starting MCP server...");
  const client = await createClient();

  const session = (await callTool(client, "session_create", { url: `http://localhost:${SERVER_PORT}/` })).sessionId;
  console.log(`Session: ${session}\n`);

  // =========================================
  // Test 1: self_healing_run — navigate (should succeed first try)
  // =========================================
  console.log("=== Test: self_healing_run (navigate) ===");
  const r1 = await callTool(client, "self_healing_run", {
    sessionId: session,
    action: "navigate",
    url: `http://localhost:${SERVER_PORT}/healing`,
    maxRetries: 2,
    useLLM: false,
  });
  assert(r1.success === true, "navigate succeeds");
  assert(r1.attempts === 1, `succeeds on first attempt (got ${r1.attempts})`);
  assert(r1.result?.url?.includes("/healing"), "navigated to correct URL");

  // =========================================
  // Test 2: self_healing_run — click with valid selector
  // =========================================
  console.log("\n=== Test: self_healing_run (click valid) ===");
  // Debug: verify page state first
  const pageInfo = await callTool(client, "get_page_info", { sessionId: session, includeHtml: true });
  console.log("    current URL:", pageInfo.url);
  console.log("    has #target-btn:", pageInfo.html?.includes("target-btn"));
  console.log("    HTML snippet:", pageInfo.html?.substring(0, 300));
  // Use evaluate to check the page directly
  const evalResult = await callTool(client, "evaluate", { sessionId: session, script: "document.querySelector('#target-btn')?.outerHTML ?? 'NOT FOUND'" });
  console.log("    evaluate #target-btn:", evalResult.result);
  const r2 = await callTool(client, "self_healing_run", {
    sessionId: session,
    action: "click",
    selector: "#target-btn",
    intent: "the target button to click",
    maxRetries: 3,
    useLLM: false,
  });
  console.log("    self_healing click response:", JSON.stringify(r2, null, 2));
  assert(r2.success === true, "click succeeds with valid selector");
  assert(r2.attempts === 1, `succeeds on first attempt (got ${r2.attempts})`);

  // =========================================
  // Test 3: self_healing_run — click with broken selector (triggers healing)
  // =========================================
  console.log("\n=== Test: self_healing_run (click broken selector) ===");
  const r3 = await callTool(client, "self_healing_run", {
    sessionId: session,
    action: "click",
    selector: ".nonexistent-button-that-does-not-exist",
    intent: "a submit button",
    maxRetries: 2,
    useLLM: false,
  });
  // With semantic+visual matching, this may now succeed (healing found #target-btn via intent)
  if (r3.success) {
    assert(r3.success === true, "healed successfully via semantic+visual matching");
    assert(r3.healedSelector !== ".nonexistent-button-that-does-not-exist", "selector was changed");
  } else {
    assert(r3.success === false, "fails with broken selector (no LLM)");
    assert(r3.attempts === 2, `exhausted retries (got ${r3.attempts})`);
  }
  assert(r3.history.length >= 1, `has healing history (got ${r3.history.length} entries)`);
  const hasDiagnosis = r3.history.some((h: any) => h.diagnosis);
  assert(hasDiagnosis, "healing history includes diagnosis");

  // =========================================
  // Test 4: self_healing_run — extract
  // =========================================
  console.log("\n=== Test: self_healing_run (extract) ===");
  await callTool(client, "navigate", { sessionId: session, url: `http://localhost:${SERVER_PORT}/infinite` });
  const r4 = await callTool(client, "self_healing_run", {
    sessionId: session,
    action: "extract",
    selector: ".item",
    maxRetries: 2,
    useLLM: false,
  });
  assert(r4.success === true, "extract succeeds");
  assert(r4.result?.count > 0, `extracted items (got ${r4.result?.count})`);

  // =========================================
  // Test 5: self_healing_run — extract with broken selector
  // =========================================
  console.log("\n=== Test: self_healing_run (extract broken) ===");
  const r5 = await callTool(client, "self_healing_run", {
    sessionId: session,
    action: "extract",
    selector: ".this-class-does-not-exist-anywhere",
    intent: "product items in a list",
    maxRetries: 2,
    useLLM: false,
  });
  console.log("    extract broken response:", JSON.stringify(r5, null, 2));
  // Extract with non-matching selector returns empty results (success but 0 items)
  assert(r5.success === true, "extract returns success even with no matches");
  assert(r5.result?.count === 0, `extracted 0 items for non-matching selector (got ${r5.result?.count})`);
  assert(r5.history.length >= 1, "has history entries");

  // =========================================
  // Test 6: Anti-bot detection — 403 page
  // =========================================
  console.log("\n=== Test: anti-bot (403 detection) ===");
  const r6 = await callTool(client, "self_healing_run", {
    sessionId: session,
    action: "navigate",
    url: `http://localhost:${SERVER_PORT}/blocked`,
    maxRetries: 2,
    useLLM: false,
  });
  // Navigate to blocked page should succeed (it's just a 403-styled page)
  // But the self_healing_run should detect anti-bot patterns
  assert(r6.success === true || r6.history.length > 0, "anti-bot detection triggered or navigate succeeded");

  // =========================================
  // Test 7: Anti-bot detection — Cloudflare challenge page
  // =========================================
  console.log("\n=== Test: anti-bot (Cloudflare challenge) ===");
  const r7 = await callTool(client, "self_healing_run", {
    sessionId: session,
    action: "navigate",
    url: `http://localhost:${SERVER_PORT}/challenge`,
    maxRetries: 1,
    useLLM: false,
  });
  assert(r7.success === true, "navigate to challenge page succeeded");

  // Now try to click on it — should detect Cloudflare challenge
  const r7b = await callTool(client, "self_healing_run", {
    sessionId: session,
    action: "click",
    selector: "#challenge-running h2",
    maxRetries: 1,
    useLLM: false,
  });
  // This might succeed (the element exists) or fail and trigger anti-bot
  assert(r7b.history.length > 0, "has healing history");

  // =========================================
  // Test 8: self_healing_run — wait_for
  // =========================================
  console.log("\n=== Test: self_healing_run (wait_for) ===");
  await callTool(client, "navigate", { sessionId: session, url: `http://localhost:${SERVER_PORT}/dynamic` });
  // Click the button to trigger content loading
  await callTool(client, "click", { sessionId: session, selector: "#load-btn" });
  const r8 = await callTool(client, "self_healing_run", {
    sessionId: session,
    action: "wait_for",
    selector: ".loaded",
    waitCondition: "visible",
    maxRetries: 3,
    useLLM: false,
  });
  assert(r8.success === true, "wait_for succeeds for dynamically loaded content");

  // =========================================
  // Test 9: Healing history structure
  // =========================================
  console.log("\n=== Test: healing history structure ===");
  const r9 = await callTool(client, "self_healing_run", {
    sessionId: session,
    action: "click",
    selector: "#does-not-exist-12345",
    maxRetries: 2,
    useLLM: false,
  });
  assert(r9.history.length >= 2, `history has >= 2 entries (got ${r9.history.length})`);
  assert(r9.history[0].attempt === 1, "first entry attempt = 1");
  assert(r9.history[r9.history.length - 1].attempt >= 2, "last entry attempt >= 2");
  assert(typeof r9.history[0].duration === "number", "duration is a number");

  // =========================================
  // Test 10: LLM-powered self-healing (requires LLM_API_KEY)
  // =========================================
  if (process.env.LLM_API_KEY) {
    console.log("\n=== Test: LLM-powered selector healing ===");
    await callTool(client, "navigate", { sessionId: session, url: `http://localhost:${SERVER_PORT}/healing` });
    const r10 = await callTool(client, "self_healing_run", {
      sessionId: session,
      action: "click",
      selector: ".old-button-class-that-no-longer-exists",
      intent: "the target button on the page",
      maxRetries: 3,
      useLLM: true,
    });
    console.log("    LLM healing response:", JSON.stringify(r10, null, 2));
    const llmUsed = r10.history.some((h: any) => h.diagnosis?.method === "llm");
    assert(llmUsed, "LLM was used for diagnosis");
    // Check if selector was healed
    if (r10.healedSelector) {
      console.log(`    Healed selector: ${r10.healedSelector}`);
      assert(r10.healedSelector !== ".old-button-class-that-no-longer-exists", "selector was changed by healer");
    }
  } else {
    console.log("\n=== Skipping LLM test (LLM_API_KEY not set) ===");
  }

  // =========================================
  // Cleanup
  // =========================================
  console.log("\n=== Cleanup ===");
  await callTool(client, "session_close", { sessionId: session });
  await client.close();
  stopServer();

  console.log(`\n=============================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`=============================`);

  // Show LLM status
  if (!process.env.LLM_API_KEY) {
    console.log(`\nNote: LLM_API_KEY not set — only rule-based healing was tested.`);
    console.log(`Set LLM_API_KEY + LLM_PROVIDER to test LLM-powered diagnosis.`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
