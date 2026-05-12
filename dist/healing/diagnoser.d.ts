/**
 * LLM-Powered Diagnoser — Phase 3 Self-Healing Engine
 *
 * Two-tier diagnosis:
 *   1. Rule-based: fast, no API call, handles obvious cases
 *   2. LLM-based: slower, handles complex/ambiguous failures
 *
 * Flow: classified error + page snapshot → diagnosis + fix strategy
 */
import { ClassifiedError, ErrorType } from "./detector.js";
import { PageSnapshot } from "../browser/context.js";
import { LLMProvider } from "./llm-provider.js";
export interface Diagnosis {
    errorType: ErrorType;
    rootCause: string;
    suggestedFix: FixStrategy;
    confidence: number;
    method: "rule" | "llm";
}
export interface FixStrategy {
    action: "retry" | "new_selector" | "wait_and_retry" | "switch_proxy" | "handle_captcha" | "modify_headers" | "abort";
    newSelector?: string;
    waitMs?: number;
    extraHeaders?: Record<string, string>;
    reason: string;
}
export declare function diagnoseWithRules(error: ClassifiedError): Diagnosis;
export declare function diagnoseWithLLM(error: ClassifiedError, snapshot: PageSnapshot, llm: LLMProvider): Promise<Diagnosis>;
export declare function diagnose(error: ClassifiedError, snapshot?: PageSnapshot, llm?: LLMProvider): Promise<Diagnosis>;
