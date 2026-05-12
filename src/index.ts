#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp/server.js";

// Load .env file if present
const envPath = path.join(process.cwd(), ".env");
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
  console.error(`[phoenix] Loaded .env from ${envPath}, LLM_API_KEY=${process.env.LLM_API_KEY ? "set" : "not set"}`);
} else {
  console.error(`[phoenix] No .env found at ${envPath}`);
}

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Phoenix MCP server started on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
