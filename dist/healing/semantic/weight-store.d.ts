/**
 * Weight Store — Self-Evolving Weights
 *
 * When Tier 3 (LLM) successfully repairs a selector, we analyze why
 * Tier 2 (semantic matching) failed and adjust weights to make Tier 2
 * succeed next time for similar patterns.
 *
 * Weights are stored per-domain because different sites have different
 * DOM patterns (e.g., e-commerce sites use data-testid heavily, while
 * news sites rely on text and headings).
 *
 * Learning rate is conservative (5-15% per adjustment) to avoid
 * overfitting to a single example.
 */
export interface WeightAdjustment {
    signal: string;
    delta: number;
    reason: string;
    timestamp: number;
}
export interface DomainWeights {
    domain: string;
    weights: Record<string, number>;
    adjustments: WeightAdjustment[];
    lastUpdated: number;
    successCount: number;
    failCount: number;
}
export declare class WeightStore {
    private domains;
    private persistPath?;
    constructor(options?: {
        persistPath?: string;
    });
    /**
     * Get weights for a domain (with dynamic overrides applied).
     */
    getWeights(domain: string): Record<string, number>;
    /**
     * Learn from a successful LLM repair.
     * Analyzes why Tier 2 failed and adjusts weights.
     */
    learn(domain: string, correctSignalBreakdown: Record<string, number>, tier2TopScores: Array<{
        index: number;
        combined: number;
        breakdown: Record<string, number>;
    }>, correctElementIndex: number): WeightAdjustment[];
    /**
     * Record a Tier 2 success (after learning) to track effectiveness.
     */
    recordSuccess(domain: string): void;
    /**
     * Record a Tier 2 failure (after learning) to detect weight drift.
     */
    recordFailure(domain: string): void;
    /**
     * Get stats for a domain.
     */
    stats(domain: string): {
        weights: Record<string, number>;
        adjustments: number;
        successRate: number;
    };
    private getOrCreateDomain;
    private resetDomain;
    private saveToDisk;
    private loadFromDisk;
}
