/**
 * Real-provider Tier-3 smoke test. This is intentionally separate from the
 * deterministic suite: it requires a local .env and can incur provider cost.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startTestServer(): Promise<() => void> {
  return new Promise((resolve) => {
    const proc = spawn("npx", ["tsx", path.join(__dirname, "server.ts")], {
      stdio: "pipe",
      cwd: path.join(__dirname, ".."),
    });
    const stop = () => proc.kill();
    proc.stderr?.on("data", (data) => {
      if (data.toString().includes("running")) resolve(stop);
    });
    setTimeout(() => resolve(stop), 3_000);
  });
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ text?: string }>)[0]?.text;
  if (!text) throw new Error(`MCP tool ${name} returned no text response`);
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    throw new Error(`MCP tool ${name} failed: ${text}`);
  }
}

let stopServer: (() => void) | undefined;
let client: Client | undefined;

try {
  stopServer = await startTestServer();
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "../dist/index.js")],
    cwd: path.join(__dirname, ".."),
    // The SDK uses a safe default allowlist; local test traffic is explicit.
    env: { ...process.env, PHOENIX_ALLOW_PRIVATE_NETWORK: "true" },
  });
  client = new Client({ name: "llm-integration-test", version: "1.0.0" });
  await client.connect(transport);

  const session = await callTool(client, "session_create", {});
  const sessionId = session.sessionId as string;
  const brokenSelector = `.obsolete-control-${randomUUID()}`;
  await callTool(client, "navigate", { sessionId, url: "http://localhost:3456/healing" });
  const result = await callTool(client, "self_healing_run", {
    sessionId,
    action: "click",
    // Deliberately provide no reusable class, tag, or text signal. The page
    // has one actionable control, so this exercises Tier 3 rather than the
    // deterministic semantic matcher.
    selector: brokenSelector,
    intent: "the action a user should take on this page",
    maxRetries: 3,
    useLLM: true,
  });

  // A history entry keeps the initial deterministic diagnosis and records the
  // eventual repair tier in its action label.
  const llmUsed = result.history?.some((entry: { action?: string }) => entry.action?.startsWith("healed(llm)"));
  assert.equal(result.llmUsed, true, "LLM provider was not configured in the MCP server");
  assert.equal(llmUsed, true, `Tier-3 LLM diagnosis was not reached: ${JSON.stringify(result.history)}`);
  assert.equal(result.success, true, `LLM repair failed: ${JSON.stringify(result.history)}`);
  assert.notEqual(result.healedSelector, brokenSelector);
  console.log(`LLM integration passed: healed selector ${result.healedSelector}`);

  await callTool(client, "session_close", { sessionId });
} finally {
  await client?.close().catch(() => {});
  stopServer?.();
}
