/**
 * Failure Detector — Phase 3 Self-Healing Engine
 *
 * Captures and classifies all browser operation failures:
 * - Selector not found
 * - Page load timeout
 * - Anti-bot trigger (captcha, 403, rate limit)
 * - DOM structure change
 */
export declare enum ErrorType {
    SELECTOR_NOT_FOUND = "selector_not_found",
    TIMEOUT = "timeout",
    NAVIGATION_FAILED = "navigation_failed",
    ANTI_BOT = "anti_bot",
    DOM_CHANGED = "dom_changed",
    UNKNOWN = "unknown"
}
export interface ClassifiedError {
    type: ErrorType;
    message: string;
    selector?: string;
    url?: string;
    timestamp: number;
    rawError: Error;
}
export declare function classifyError(error: Error, context?: {
    selector?: string;
    url?: string;
}): ClassifiedError;
