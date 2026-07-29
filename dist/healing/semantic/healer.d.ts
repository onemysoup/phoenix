/**
 * Semantic Healer — The Core Innovation
 *
 * Three-tier healing with multi-dimensional fingerprinting:
 *
 *   Tier 1: Repair Cache Lookup (~0ms, zero cost)
 *   Tier 2: Semantic + Visual Matching (~80ms, zero cost)
 *   Tier 3: LLM Analysis (~2s, costs money)
 *
 * Multi-dimensional fingerprint:
 *   - DOM semantics (tag, role, text, attributes, structure)
 *   - Visual features (position, size, color, layout)
 *   - Combined: semantic × 0.65 + visual × 0.35
 */
import { Page } from "playwright";
import { RepairCache, type RepairRule } from "./repair-cache.js";
import { WeightStore } from "./weight-store.js";
import { LLMProvider } from "../llm-provider.js";
import { PageSnapshot } from "../../browser/context.js";
export interface HealResult {
    success: boolean;
    newSelector?: string;
    confidence: number;
    method: "cache" | "semantic" | "semantic+visual" | "llm" | "failed";
    score?: number;
    semanticScore?: number;
    visualScore?: number;
    duration: number;
}
export declare class SemanticHealer {
    private cache;
    private weightStore;
    constructor(cache?: RepairCache, weightStore?: WeightStore);
    heal(page: Page, brokenSelector: string, intent: string, snapshot?: PageSnapshot, llm?: LLMProvider): Promise<HealResult>;
    /**
     * Multi-dimensional matching: semantic + visual.
     * Single pass through the DOM, extracts both fingerprint types.
     */
    private multiDimensionalMatch;
    private llmHeal;
    private validateSelector;
    private cacheRepair;
    /** Persist a repair only after the caller has successfully executed it. */
    rememberSuccessfulRepair(page: Page, original: string, healed: string, intent: string, confidence: number): Promise<void>;
    private fingerprintHash;
    /**
     * Weight Self-Evolution: Learn from LLM success to improve Tier 2.
     *
     * When Tier 3 (LLM) finds the correct element, re-run Tier 2 scoring
     * to see where the correct element ranked, then adjust weights so
     * Tier 2 would have found it next time.
     */
    private learnFromLLMRepair;
    getCacheStats(): {
        size: number;
        totalHits: number;
        rules: RepairRule[];
    };
    getWeightStats(domain: string): {
        weights: Record<string, number>;
        adjustments: number;
        successRate: number;
    };
    getCache(): RepairCache;
}
