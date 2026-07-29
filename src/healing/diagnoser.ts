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
import { LLMProvider, LLMMessage } from "./llm-provider.js";
import { sanitizeDOMForLLM, validateLLMOutput } from "./sanitizer.js";

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

// ========== Rule-based diagnosis (fast fallback) ==========

export function diagnoseWithRules(error: ClassifiedError): Diagnosis {
  switch (error.type) {
    case ErrorType.SELECTOR_NOT_FOUND:
      return {
        errorType: error.type,
        rootCause: `Element not found: ${error.selector}`,
        suggestedFix: { action: "new_selector", reason: "Selector may have changed, need LLM to generate new one" },
        confidence: 0.5,
        method: "rule",
      };
    case ErrorType.TIMEOUT:
      return {
        errorType: error.type,
        rootCause: "Operation timed out",
        suggestedFix: { action: "wait_and_retry", waitMs: 3000, reason: "Page may be slow" },
        confidence: 0.6,
        method: "rule",
      };
    case ErrorType.ANTI_BOT:
      return {
        errorType: error.type,
        rootCause: "Anti-bot mechanism triggered",
        suggestedFix: { action: "handle_captcha", reason: "Need to handle anti-bot challenge" },
        confidence: 0.7,
        method: "rule",
      };
    case ErrorType.NAVIGATION_FAILED:
      return {
        errorType: error.type,
        rootCause: `Navigation failed: ${error.url}`,
        suggestedFix: { action: "retry", reason: "Transient network error" },
        confidence: 0.4,
        method: "rule",
      };
    default:
      return {
        errorType: ErrorType.UNKNOWN,
        rootCause: error.message,
        suggestedFix: { action: "retry", reason: "Unknown error, try once more" },
        confidence: 0.2,
        method: "rule",
      };
  }
}

// ========== LLM-based diagnosis (deep analysis) ==========

const DIAGNOSIS_PROMPT = `You are a browser automation debugging expert. Analyze the failure and suggest a fix.

## Error Information
- Error type: {errorType}
- Error message: {errorMessage}
- Selector used: {selector}
- URL: {url}

## Page Context
- Current URL: {pageUrl}
- Page title: {pageTitle}
- Page HTML (truncated): {pageHtml}

## Task
Diagnose the root cause and suggest a specific fix. Respond in JSON:
{
  "rootCause": "explanation of why it failed",
  "fix": {
    "action": "retry|new_selector|wait_and_retry|handle_captcha|modify_headers|abort",
    "newSelector": "CSS selector if action is new_selector",
    "waitMs": 3000,
    "reason": "why this fix should work"
  },
  "confidence": 0.8
}`;

export async function diagnoseWithLLM(
  error: ClassifiedError,
  snapshot: PageSnapshot,
  llm: LLMProvider
): Promise<Diagnosis> {
  const prompt = DIAGNOSIS_PROMPT
    .replace("{errorType}", error.type)
    .replace("{errorMessage}", error.message)
    .replace("{selector}", error.selector ?? "N/A")
    .replace("{url}", error.url ?? "N/A")
    .replace("{pageUrl}", snapshot.url)
    .replace("{pageTitle}", snapshot.title)
    .replace("{pageHtml}", sanitizeDOMForLLM(snapshot.html).slice(0, 4000));

  const messages: LLMMessage[] = [
    { role: "system", content: "You are a browser automation expert. Always respond with valid JSON only." },
    { role: "user", content: prompt },
  ];

  try {
    const resp = await llm.chat(messages, { temperature: 0.1, maxTokens: 1024 });

    const validation = validateLLMOutput(resp.content);
    if (!validation.valid) {
      const fallback = diagnoseWithRules(error);
      fallback.rootCause += ` (LLM output rejected: ${validation.error})`;
      return fallback;
    }
    const parsed = validation.parsed;

    return {
      errorType: error.type,
      rootCause: parsed.rootCause ?? "LLM diagnosis",
      suggestedFix: {
        action: parsed.fix?.action ?? "retry",
        newSelector: parsed.fix?.newSelector,
        waitMs: parsed.fix?.waitMs,
        extraHeaders: parsed.fix?.extraHeaders,
        reason: parsed.fix?.reason ?? "LLM suggested fix",
      },
      confidence: parsed.confidence ?? 0.6,
      method: "llm",
    };
  } catch (e) {
    // LLM failed (bad JSON, API error, etc.) — fall back to rules
    const fallback = diagnoseWithRules(error);
    fallback.rootCause += ` (LLM fallback: ${e instanceof Error ? e.message : String(e)})`;
    return fallback;
  }
}

// ========== Auto-select diagnosis method ==========

export async function diagnose(
  error: ClassifiedError,
  snapshot?: PageSnapshot,
  llm?: LLMProvider
): Promise<Diagnosis> {
  // For selector errors, always prefer LLM (it can analyze the HTML)
  if (error.type === ErrorType.SELECTOR_NOT_FOUND && snapshot && llm) {
    return diagnoseWithLLM(error, snapshot, llm);
  }
  // For anti-bot, prefer LLM
  if (error.type === ErrorType.ANTI_BOT && snapshot && llm) {
    return diagnoseWithLLM(error, snapshot, llm);
  }
  // For simple cases, rules are enough
  if (error.type === ErrorType.TIMEOUT || error.type === ErrorType.NAVIGATION_FAILED) {
    return diagnoseWithRules(error);
  }
  // For unknown errors with LLM available, use LLM
  if (llm && snapshot) {
    return diagnoseWithLLM(error, snapshot, llm);
  }
  return diagnoseWithRules(error);
}
