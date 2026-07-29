import assert from "node:assert/strict";
import { BrowserPool } from "../src/browser/pool.js";

const pool = new BrowserPool({
  maxContexts: 1,
  queueSize: 1,
  queueTimeout: 1_000,
  sessionTTL: 30,
  cleanupInterval: 10,
});

const closed: string[] = [];
pool.setContextClosedListener((id, reason) => {
  if (reason === "expired") closed.push(id);
});

try {
  await pool.launch();
  await pool.createContext("expiring-session");
  assert.equal(pool.activeCount, 1);

  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(pool.activeCount, 0, "expired context should leave the pool");
  assert.deepEqual(closed, ["expiring-session"], "TTL should notify the owning session registry");

  // The released slot must be reusable without waiting for the queue timeout.
  await pool.createContext("replacement-session");
  assert.equal(pool.activeCount, 1);
} finally {
  await pool.shutdown();
}

console.log("Browser pool TTL tests passed");
