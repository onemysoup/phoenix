/**
 * Phase 2 Tools Test Script
 *
 * Tests: smart_wait, infinite_scroll, shadow_extract, switch_frame, spa_monitor
 *
 * Usage: npx tsx test/phase2-test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PORT = 3456;

async function startTestServer(): Promise<() => void> {
  return new Promise((resolve) => {
    const proc = spawn("npx", ["tsx", path.join(__dirname, "server.ts")], {
      stdio: "pipe",
      cwd: path.join(__dirname, ".."),
    });
    proc.stderr?.on("data", (d) => {
      const msg = d.toString();
      if (msg.includes("running")) {
        resolve(() => proc.kill());
      }
    });
    // Fallback resolve
    setTimeout(() => resolve(() => proc.kill()), 3000);
  });
}

async function createClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "../dist/index.js")],
    cwd: path.join(__dirname, ".."),
    // The SDK deliberately inherits only a safe env allowlist by default.
    // Pass this test-only override explicitly so localhost remains reachable.
    env: { ...process.env, PHOENIX_ALLOW_PRIVATE_NETWORK: "true" },
  });
  const client = new Client({ name: "test", version: "1.0.0" });
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

  // Create session
  const session = await callTool(client, "session_create", {
    url: `http://localhost:${SERVER_PORT}/`,
  });
  const sessionId = session.sessionId;
  console.log(`Session created: ${sessionId}\n`);

  // =========================================
  // Test 1: smart_wait — dom_stable
  // =========================================
  console.log("=== Test: smart_wait (dom_stable) ===");
  // Use static home page — /dynamic has a setInterval that prevents stability
  await callTool(client, "navigate", {
    sessionId,
    url: `http://localhost:${SERVER_PORT}/`,
  });
  const sw1 = await callTool(client, "smart_wait", {
    sessionId,
    mode: "dom_stable",
    stableMs: 800,
    timeout: 5000,
  });
  console.log("    dom_stable response:", JSON.stringify(sw1));
  assert(sw1.success === true, "dom_stable returns success");
  assert(sw1.mode === "dom_stable", "mode is dom_stable");

  // =========================================
  // Test 2: smart_wait — condition
  // =========================================
  console.log("\n=== Test: smart_wait (condition) ===");
  await callTool(client, "navigate", { sessionId, url: `http://localhost:${SERVER_PORT}/dynamic` });
  // Click button to trigger dynamic content, then wait for it
  await callTool(client, "click", { sessionId, selector: "#load-btn" });
  const sw2 = await callTool(client, "smart_wait", {
    sessionId,
    mode: "condition",
    expression: "document.querySelector('.loaded') !== null",
    timeout: 5000,
  });
  assert(sw2.success === true, "condition wait detects dynamic content");

  // =========================================
  // Test 3: smart_wait — element_count
  // =========================================
  console.log("\n=== Test: smart_wait (element_count) ===");
  await callTool(client, "navigate", {
    sessionId,
    url: `http://localhost:${SERVER_PORT}/infinite`,
  });
  const sw3 = await callTool(client, "smart_wait", {
    sessionId,
    mode: "element_count",
    selector: ".item",
    stableMs: 500,
    timeout: 5000,
  });
  assert(sw3.success === true, "element_count stabilizes");
  assert(sw3.finalCount > 0, `finalCount > 0 (got ${sw3.finalCount})`);

  // =========================================
  // Test 4: infinite_scroll
  // =========================================
  console.log("\n=== Test: infinite_scroll ===");
  const is1 = await callTool(client, "infinite_scroll", {
    sessionId,
    contentSelector: ".item",
    maxScrolls: 5,
    scrollDelay: 500,
    stableRounds: 2,
  });
  assert(is1.success === true, "infinite_scroll returns success");
  assert(is1.totalNewItems > 0, `loaded new items (got ${is1.totalNewItems})`);
  assert(is1.finalCount > 10, `final count > 10 (got ${is1.finalCount})`);

  // =========================================
  // Test 5: shadow_extract
  // =========================================
  console.log("\n=== Test: shadow_extract ===");
  await callTool(client, "navigate", {
    sessionId,
    url: `http://localhost:${SERVER_PORT}/shadow`,
  });
  const se1 = await callTool(client, "shadow_extract", {
    sessionId,
    hostSelector: "#shadow-host",
    innerSelector: "h2",
    attributes: ["textContent"],
  });
  assert(se1.success === true, "shadow_extract returns success");
  assert(se1.count > 0, `found shadow elements (got ${se1.count})`);
  assert(
    se1.data?.[0]?.textContent?.includes("Shadow Title"),
    "extracted correct shadow content"
  );

  // =========================================
  // Test 6: shadow_extract — nested
  // =========================================
  console.log("\n=== Test: shadow_extract (nested) ===");
  const se2 = await callTool(client, "shadow_extract", {
    sessionId,
    hostSelector: "#nested-host",
    innerSelector: ".deep-text",
    attributes: ["textContent"],
  });
  assert(se2.success === true, "nested shadow_extract returns success");
  assert(
    se2.data?.[0]?.textContent?.includes("Deep nested"),
    "extracted deeply nested shadow content"
  );

  // =========================================
  // Test 7: switch_frame — list
  // =========================================
  console.log("\n=== Test: switch_frame (list) ===");
  await callTool(client, "navigate", {
    sessionId,
    url: `http://localhost:${SERVER_PORT}/iframe`,
  });
  const sf1 = await callTool(client, "switch_frame", {
    sessionId,
    action: "list",
  });
  assert(sf1.success === true, "frame list returns success");
  assert(sf1.frames.length >= 3, `found >= 3 frames (got ${sf1.frames.length})`);

  // =========================================
  // Test 8: switch_frame — into
  // =========================================
  console.log("\n=== Test: switch_frame (into) ===");
  const sf2 = await callTool(client, "switch_frame", {
    sessionId,
    action: "into",
    selector: "#frame1",
  });
  assert(sf2.success === true, "switch into iframe succeeds");
  assert(sf2.frameName === "content-frame", `frame name is content-frame`);

  const frameExtract = await callTool(client, "frame_extract", {
    sessionId,
    selector: "h2",
  });
  assert(frameExtract.success === true, "frame_extract succeeds after selecting iframe");
  assert(frameExtract.data?.[0]?.includes("Iframe Content"), "frame_extract reads selected iframe content");

  // =========================================
  // Test 9: switch_frame — back
  // =========================================
  console.log("\n=== Test: switch_frame (back) ===");
  const sf3 = await callTool(client, "switch_frame", {
    sessionId,
    action: "back",
  });
  assert(sf3.success === true, "switch back to main frame succeeds");

  // =========================================
  // Test 10: spa_monitor — start
  // =========================================
  console.log("\n=== Test: spa_monitor ===");
  await callTool(client, "navigate", {
    sessionId,
    url: `http://localhost:${SERVER_PORT}/spa`,
  });
  const sm1 = await callTool(client, "spa_monitor", {
    sessionId,
    action: "start",
  });
  assert(sm1.success === true, "spa_monitor start succeeds");

  // Trigger a SPA navigation
  await callTool(client, "evaluate", {
    sessionId,
    script: `history.pushState({route: '/spa/about'}, '', '/spa/about')`,
  });
  await new Promise((r) => setTimeout(r, 200));

  // Trigger another
  await callTool(client, "evaluate", {
    sessionId,
    script: `history.pushState({route: '/spa/contact'}, '', '/spa/contact')`,
  });
  await new Promise((r) => setTimeout(r, 200));

  // Get changes
  const sm2 = await callTool(client, "spa_monitor", {
    sessionId,
    action: "get_changes",
  });
  assert(sm2.success === true, "get_changes returns success");
  assert(sm2.count >= 2, `captured >= 2 route changes (got ${sm2.count})`);
  assert(sm2.changes[0]?.type === "pushState", "change type is pushState");

  // Stop
  const sm3 = await callTool(client, "spa_monitor", {
    sessionId,
    action: "stop",
  });
  assert(sm3.success === true, "spa_monitor stop succeeds");

  // =========================================
  // Cleanup
  // =========================================
  console.log("\n=== Cleanup ===");
  await callTool(client, "session_close", { sessionId });
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
