/**
 * Repair Cache
 *
 * Caches successful repair rules so the same failure pattern
 * is resolved instantly on subsequent occurrences — zero LLM cost.
 *
 * Cache key: normalized (domain + selector pattern + error pattern)
 * Cache value: repair rule (new selector + metadata)
 *
 * This turns the self-healing system from "every failure costs an LLM call"
 * into "first failure costs an LLM call, all subsequent failures are free".
 */

export interface RepairRule {
  originalSelector: string;
  healedSelector: string;
  domain: string;
  intent: string;
  confidence: number;
  createdAt: number;
  hitCount: number;
  fingerprintHash: string;  // Hash of the target element's fingerprint for validation
  // Verification tracking
  verifySuccessCount: number;   // Times post-action verification passed
  verifyFailCount: number;      // Times post-action verification failed
  lastVerifiedAt: number;       // Last successful verification timestamp
  expiresAt: number;            // TTL expiration timestamp
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CONSECUTIVE_FAILS = 3; // Evict after 3 consecutive verification failures

export class RepairCache {
  private cache: Map<string, RepairRule> = new Map();
  private maxSize: number;
  private persistPath?: string;

  constructor(options?: { maxSize?: number; persistPath?: string }) {
    this.maxSize = options?.maxSize ?? 500;
    this.persistPath = options?.persistPath;
    if (this.persistPath) this.loadFromDisk();
  }

  /**
   * Generate a cache key from failure context.
   * Same domain + same broken selector + similar error → same key.
   */
  private makeKey(domain: string, selector: string): string {
    return `${domain}::${selector}`;
  }

  /**
   * Look up a cached repair rule.
   */
  get(domain: string, selector: string): RepairRule | undefined {
    const key = this.makeKey(domain, selector);
    const rule = this.cache.get(key);
    if (!rule) return undefined;

    // TTL check: evict expired entries
    if (Date.now() > rule.expiresAt) {
      this.cache.delete(key);
      this.saveToDisk();
      return undefined;
    }

    // Consecutive fail check: evict poisoned entries
    if (rule.verifyFailCount >= MAX_CONSECUTIVE_FAILS) {
      this.cache.delete(key);
      this.saveToDisk();
      return undefined;
    }

    rule.hitCount++;
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, rule);
    return rule;
  }

  /**
   * Store a successful repair.
   */
  set(domain: string, rule: RepairRule): void {
    const key = this.makeKey(domain, rule.originalSelector);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    // Initialize verification fields if not set
    if (rule.verifySuccessCount === undefined) rule.verifySuccessCount = 0;
    if (rule.verifyFailCount === undefined) rule.verifyFailCount = 0;
    if (rule.lastVerifiedAt === undefined) rule.lastVerifiedAt = Date.now();
    if (rule.expiresAt === undefined) rule.expiresAt = Date.now() + DEFAULT_TTL_MS;

    this.cache.set(key, rule);
    this.saveToDisk();
  }

  /**
   * Persist cache to disk (JSON file).
   */
  private saveToDisk(): void {
    if (!this.persistPath) return;
    try {
      const fs = require("fs");
      fs.writeFileSync(this.persistPath, this.export(), "utf-8");
    } catch {}
  }

  /**
   * Load cache from disk.
   */
  private loadFromDisk(): void {
    if (!this.persistPath) return;
    try {
      const fs = require("fs");
      if (fs.existsSync(this.persistPath)) {
        this.import(fs.readFileSync(this.persistPath, "utf-8"));
      }
    } catch {}
  }

  /**
   * Validate a cached rule against current page state.
   * Returns true if the healed selector still resolves to a valid element.
   */
  async validate(rule: RepairRule, page: { evaluate: (fn: (sel: string) => boolean, arg: string) => Promise<boolean> }): Promise<boolean> {
    try {
      return await page.evaluate(
        (sel: string) => {
          try {
            const el = document.querySelector(sel);
            return el !== null && (el as HTMLElement).offsetParent !== null; // exists and visible
          } catch {
            return false;
          }
        },
        rule.healedSelector
      );
    } catch {
      return false;
    }
  }

  /**
   * Record a successful post-action verification.
   * Resets fail counter and extends TTL.
   */
  recordVerifySuccess(domain: string, selector: string): void {
    const key = this.makeKey(domain, selector);
    const rule = this.cache.get(key);
    if (!rule) return;
    rule.verifySuccessCount++;
    rule.verifyFailCount = 0; // Reset consecutive fail counter
    rule.lastVerifiedAt = Date.now();
    rule.expiresAt = Date.now() + DEFAULT_TTL_MS; // Extend TTL on success
    this.saveToDisk();
  }

  /**
   * Record a failed post-action verification.
   * After MAX_CONSECUTIVE_FAILS, the entry will be evicted on next get().
   */
  recordVerifyFailure(domain: string, selector: string): void {
    const key = this.makeKey(domain, selector);
    const rule = this.cache.get(key);
    if (!rule) return;
    rule.verifyFailCount++;
    this.saveToDisk();
  }

  /**
   * Manually invalidate a cache entry (e.g., when post-action verification
   * detects the healed selector no longer produces expected results).
   */
  invalidate(domain: string, selector: string): void {
    const key = this.makeKey(domain, selector);
    this.cache.delete(key);
    this.saveToDisk();
  }

  /**
   * Get cache statistics.
   */
  stats(): { size: number; totalHits: number; rules: RepairRule[] } {
    const rules = Array.from(this.cache.values());
    return {
      size: this.cache.size,
      totalHits: rules.reduce((sum, r) => sum + r.hitCount, 0),
      rules,
    };
  }

  /**
   * Export cache as JSON for persistence.
   */
  export(): string {
    return JSON.stringify(Array.from(this.cache.entries()));
  }

  /**
   * Import cache from JSON.
   */
  import(json: string): void {
    try {
      const entries = JSON.parse(json) as [string, RepairRule][];
      for (const [key, rule] of entries) {
        this.cache.set(key, rule);
      }
    } catch {}
  }

  clear(): void {
    this.cache.clear();
  }
}
