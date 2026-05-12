/**
 * Selector Healer — Phase 3 Core Innovation
 *
 * When a CSS selector fails, use LLM to analyze the page HTML
 * and generate a new working selector.
 *
 * This is the most novel part of the self-healing engine.
 */
import { PageSnapshot } from "../browser/context.js";
import { LLMProvider } from "./llm-provider.js";
export interface SelectorHealResult {
    newSelector: string;
    fallbackSelectors: string[];
    strategy: string;
    confidence: number;
}
export declare function healSelector(originalSelector: string, intent: string, snapshot: PageSnapshot, llm: LLMProvider): Promise<SelectorHealResult>;
