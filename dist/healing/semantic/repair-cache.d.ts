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
    fingerprintHash: string;
    visualFingerprint?: {
        relX: number;
        relY: number;
        relWidth: number;
        relHeight: number;
        parentRelX: number;
        parentRelY: number;
        isAboveFold: boolean;
        shape: "square" | "wide" | "tall" | "tiny";
        bgColor: string;
        textColor: string;
        borderColor: string;
    };
    verifySuccessCount: number;
    verifyFailCount: number;
    lastVerifiedAt: number;
    expiresAt: number;
}
export declare class RepairCache {
    private cache;
    private maxSize;
    private persistPath?;
    constructor(options?: {
        maxSize?: number;
        persistPath?: string;
    });
    /**
     * Generate a cache key from failure context.
     * Same domain + same broken selector + similar error → same key.
     */
    private makeKey;
    /**
     * Look up a cached repair rule.
     */
    get(domain: string, selector: string): RepairRule | undefined;
    /**
     * Store a successful repair.
     */
    set(domain: string, rule: RepairRule): void;
    /**
     * Persist cache to disk (JSON file).
     */
    private saveToDisk;
    /**
     * Load cache from disk.
     */
    private loadFromDisk;
    /**
     * Validate a cached rule against current page state.
     * Returns true if the healed selector still resolves to a valid element.
     */
    validate(rule: RepairRule, page: {
        locator: (selector: string) => {
            count: () => Promise<number>;
            first: () => {
                isVisible: () => Promise<boolean>;
            };
        };
    }): Promise<boolean>;
    /**
     * Record a successful post-action verification.
     * Resets fail counter and extends TTL.
     */
    recordVerifySuccess(domain: string, selector: string): void;
    /**
     * Record a failed post-action verification.
     * After MAX_CONSECUTIVE_FAILS, the entry will be evicted on next get().
     */
    recordVerifyFailure(domain: string, selector: string): void;
    /**
     * Manually invalidate a cache entry (e.g., when post-action verification
     * detects the healed selector no longer produces expected results).
     */
    invalidate(domain: string, selector: string): void;
    /**
     * Get cache statistics.
     */
    stats(): {
        size: number;
        totalHits: number;
        rules: RepairRule[];
    };
    /**
     * Export cache as JSON for persistence.
     */
    export(): string;
    /**
     * Import cache from JSON.
     */
    import(json: string): void;
    clear(): void;
}
