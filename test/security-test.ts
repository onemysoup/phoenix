import assert from "node:assert/strict";
import { assertNavigationAllowed, assertResolvedNavigationAllowed } from "../src/security/url-policy.js";

function rejects(url: string): void {
  assert.throws(() => assertNavigationAllowed(url), /blocked|not allowed|absolute HTTP/);
}

assert.equal(assertNavigationAllowed("https://example.com/path").hostname, "example.com");
rejects("file:///etc/passwd");
rejects("javascript:alert(1)");
rejects("http://127.0.0.1:3000");
rejects("http://[::1]:3000");
rejects("http://[fd00::1]/");
rejects("http://169.254.169.254/latest/meta-data");
rejects("http://metadata.google.internal/computeMetadata/v1");
rejects("https://user:password@example.com/");

await assert.rejects(
  () => assertResolvedNavigationAllowed("http://localhost.:3000"),
  /private-network address/,
);

console.log("URL policy tests passed");
