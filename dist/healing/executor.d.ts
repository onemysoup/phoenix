/**
 * Healing Executor — Phase 3 Self-Healing Engine
 *
 * Core loop: execute → fail → diagnose → heal → retry
 *
 * Healing strategy (in priority order):
 *   1. Repair Cache — instant lookup of past fixes (0ms, $0)
 *   2. Semantic Match — deterministic DOM fingerprint matching (~50ms, $0)
 *   3. LLM Analysis — last resort, deep analysis (~2s, costs money)
 */
import { Page } from "playwright-core";
import { BrowserSession } from "../browser/context.js";
import { ClassifiedError } from "./detector.js";
import { Diagnosis } from "./diagnoser.js";
import { SemanticHealer } from "./semantic/healer.js";
import { LLMProvider } from "./llm-provider.js";
export interface HealingResult<T> {
    success: boolean;
    result?: T;
    attempts: number;
    history: HealingAttempt[];
    lastError?: ClassifiedError;
    lastDiagnosis?: Diagnosis;
    healedSelector?: string;
    healMethod?: "cache" | "semantic" | "semantic+visual" | "llm" | "rule" | "failed";
}
export interface HealingAttempt {
    attempt: number;
    error?: ClassifiedError;
    diagnosis?: Diagnosis;
    action: string;
    duration: number;
}
export declare function getSharedHealer(): SemanticHealer;
/**
 * Execute a browser operation with automatic self-healing.
 * The operation receives the current page and an optional "effective selector"
 * that may have been healed by a previous attempt.
 */
export declare function executeWithHealing<T>(session: BrowserSession, operation: (page: Page, effectiveSelector?: string) => Promise<T>, options?: {
    maxRetries?: number;
    llm?: LLMProvider;
    context?: {
        selector?: string;
        url?: string;
        intent?: string;
    };
    healer?: SemanticHealer;
}): Promise<HealingResult<T>>;
