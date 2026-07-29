import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AuditLog } from "../src/observability/audit-log.js";
import { assertNavigationAllowed } from "../src/security/url-policy.js";
import { WeightStore } from "../src/healing/semantic/weight-store.js";

function withPrivateNetworkAllowed(test: () => void): void {
  const original = process.env.PHOENIX_ALLOW_PRIVATE_NETWORK;
  process.env.PHOENIX_ALLOW_PRIVATE_NETWORK = "true";
  try {
    test();
  } finally {
    if (original === undefined) delete process.env.PHOENIX_ALLOW_PRIVATE_NETWORK;
    else process.env.PHOENIX_ALLOW_PRIVATE_NETWORK = original;
  }
}

// The local-development escape hatch must be explicit and must apply to both
// IPv4 and IPv6 targets, which are otherwise denied by the default policy.
withPrivateNetworkAllowed(() => {
  assert.equal(assertNavigationAllowed("http://127.0.0.1:3000/").hostname, "127.0.0.1");
  assert.equal(assertNavigationAllowed("http://[::1]:3000/").hostname, "[::1]");
});
assert.throws(() => assertNavigationAllowed("http://127.0.0.1:3000/"), /blocked/);

// Audit events must remain bounded, preserve chronological order, and retain
// session filtering semantics after old events have been evicted.
const auditLog = new AuditLog(3);
for (let index = 1; index <= 5; index++) {
  auditLog.record({
    timestamp: index,
    sessionId: index % 2 === 0 ? "session-b" : "session-a",
    operation: `operation-${index}`,
    durationMs: index,
    success: true,
  });
}
assert.deepEqual(auditLog.recent(10).map((event) => event.operation), ["operation-3", "operation-4", "operation-5"]);
assert.deepEqual(auditLog.recent(10, "session-b").map((event) => event.operation), ["operation-4"]);
assert.deepEqual(auditLog.recent(0).map((event) => event.operation), ["operation-5"], "limit is clamped to one");

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "phoenix-weights-"));
try {
  const persistPath = path.join(stateDir, "weights.json");
  const domain = "example.com";
  const store = new WeightStore({ persistPath });
  const adjustments = store.learn(
    domain,
    { text: 1, tag: 0 },
    [
      { index: 0, combined: 0.9, breakdown: { text: 0, tag: 1 } },
      { index: 1, combined: 0.8, breakdown: { text: 1, tag: 0 } },
    ],
    1,
  );
  assert.ok(adjustments.some((adjustment) => adjustment.signal === "text"), "learning adjusts a discriminating signal");
  const learnedTextWeight = store.getWeights(domain).text;
  assert.ok(learnedTextWeight > 3, "learning raises the text weight");

  const reloaded = new WeightStore({ persistPath });
  assert.equal(reloaded.getWeights(domain).text, learnedTextWeight, "weights survive a new store instance");

  // Repeated failures reset a drifting domain back to defaults and persist the reset.
  for (let index = 0; index < 11; index++) reloaded.recordFailure(domain);
  assert.equal(reloaded.getWeights(domain).text, 3, "weight drift is reset after repeated failures");
  const resetReloaded = new WeightStore({ persistPath });
  assert.equal(resetReloaded.getWeights(domain).text, 3, "reset state is persisted");
} finally {
  fs.rmSync(stateDir, { recursive: true, force: true });
}

console.log("Quality regression tests passed");
