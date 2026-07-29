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
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CONSECUTIVE_FAILS = 3; // Evict after 3 consecutive verification failures
export class RepairCache {
    cache = new Map();
    maxSize;
    persistPath;
    constructor(options) {
        this.maxSize = options?.maxSize ?? 500;
        this.persistPath = options?.persistPath;
        if (this.persistPath)
            this.loadFromDisk();
    }
    /**
     * Generate a cache key from failure context.
     * Same domain + same broken selector + similar error → same key.
     */
    makeKey(domain, selector) {
        return `${domain}::${selector}`;
    }
    /**
     * Look up a cached repair rule.
     */
    get(domain, selector) {
        const key = this.makeKey(domain, selector);
        const rule = this.cache.get(key);
        if (!rule)
            return undefined;
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
    set(domain, rule) {
        const key = this.makeKey(domain, rule.originalSelector);
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey)
                this.cache.delete(firstKey);
        }
        // Initialize verification fields if not set
        if (rule.verifySuccessCount === undefined)
            rule.verifySuccessCount = 0;
        if (rule.verifyFailCount === undefined)
            rule.verifyFailCount = 0;
        if (rule.lastVerifiedAt === undefined)
            rule.lastVerifiedAt = Date.now();
        if (rule.expiresAt === undefined)
            rule.expiresAt = Date.now() + DEFAULT_TTL_MS;
        this.cache.set(key, rule);
        this.saveToDisk();
    }
    /**
     * Persist cache to disk (JSON file).
     */
    saveToDisk() {
        if (!this.persistPath)
            return;
        try {
            fs.writeFileSync(this.persistPath, this.export(), "utf-8");
        }
        catch { }
    }
    /**
     * Load cache from disk.
     */
    loadFromDisk() {
        if (!this.persistPath)
            return;
        try {
            if (fs.existsSync(this.persistPath)) {
                this.import(fs.readFileSync(this.persistPath, "utf-8"));
            }
        }
        catch { }
    }
    /**
     * Validate a cached rule against current page state.
     * Returns true if the healed selector still resolves to a valid element.
     */
    async validate(rule, page) {
        try {
            const locator = page.locator(rule.healedSelector);
            return await locator.count() === 1 && await locator.first().isVisible();
        }
        catch {
            return false;
        }
    }
    /**
     * Record a successful post-action verification.
     * Resets fail counter and extends TTL.
     */
    recordVerifySuccess(domain, selector) {
        const key = this.makeKey(domain, selector);
        const rule = this.cache.get(key);
        if (!rule)
            return;
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
    recordVerifyFailure(domain, selector) {
        const key = this.makeKey(domain, selector);
        const rule = this.cache.get(key);
        if (!rule)
            return;
        rule.verifyFailCount++;
        this.saveToDisk();
    }
    /**
     * Manually invalidate a cache entry (e.g., when post-action verification
     * detects the healed selector no longer produces expected results).
     */
    invalidate(domain, selector) {
        const key = this.makeKey(domain, selector);
        this.cache.delete(key);
        this.saveToDisk();
    }
    /**
     * Get cache statistics.
     */
    stats() {
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
    export() {
        return JSON.stringify(Array.from(this.cache.entries()));
    }
    /**
     * Import cache from JSON.
     */
    import(json) {
        try {
            const entries = JSON.parse(json);
            for (const [key, rule] of entries.slice(-this.maxSize)) {
                if (!rule || typeof rule.expiresAt !== "number" || Date.now() > rule.expiresAt)
                    continue;
                this.cache.set(key, rule);
            }
        }
        catch { }
    }
    clear() {
        this.cache.clear();
    }
}
import fs from "node:fs";
//# sourceMappingURL=repair-cache.js.map