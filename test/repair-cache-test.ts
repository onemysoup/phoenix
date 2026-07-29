import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepairCache, type RepairRule } from "../src/healing/semantic/repair-cache.js";

function rule(originalSelector: string, expiresAt = Date.now() + 60_000): RepairRule {
  return {
    originalSelector,
    healedSelector: "#healed",
    domain: "example.com",
    intent: "target button",
    confidence: 0.9,
    createdAt: Date.now(),
    hitCount: 0,
    fingerprintHash: "abc",
    verifySuccessCount: 0,
    verifyFailCount: 0,
    lastVerifiedAt: Date.now(),
    expiresAt,
  };
}

const cache = new RepairCache({ maxSize: 2 });
cache.set("example.com", rule("#first"));
cache.set("example.com", rule("#second"));
assert.equal(cache.get("example.com", "#first")?.healedSelector, "#healed");
cache.set("example.com", rule("#third"));
assert.equal(cache.get("example.com", "#second"), undefined, "LRU entry should be evicted");

cache.set("example.com", rule("#expired", Date.now() - 1));
assert.equal(cache.get("example.com", "#expired"), undefined, "expired entry should be evicted");

cache.set("example.com", rule("#poisoned"));
cache.recordVerifyFailure("example.com", "#poisoned");
cache.recordVerifyFailure("example.com", "#poisoned");
cache.recordVerifyFailure("example.com", "#poisoned");
assert.equal(cache.get("example.com", "#poisoned"), undefined, "three failed verifications should evict entry");

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "phoenix-cache-"));
try {
  const persistPath = path.join(stateDir, "repairs.json");
  const persisted = new RepairCache({ persistPath });
  persisted.set("example.com", rule("#persisted"));
  const reloaded = new RepairCache({ persistPath });
  assert.equal(reloaded.get("example.com", "#persisted")?.healedSelector, "#healed", "cache survives process restart");
} finally {
  fs.rmSync(stateDir, { recursive: true, force: true });
}

console.log("Repair cache tests passed");
