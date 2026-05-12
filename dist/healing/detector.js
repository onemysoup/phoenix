/**
 * Failure Detector — Phase 3 Self-Healing Engine
 *
 * Captures and classifies all browser operation failures:
 * - Selector not found
 * - Page load timeout
 * - Anti-bot trigger (captcha, 403, rate limit)
 * - DOM structure change
 */
export var ErrorType;
(function (ErrorType) {
    ErrorType["SELECTOR_NOT_FOUND"] = "selector_not_found";
    ErrorType["TIMEOUT"] = "timeout";
    ErrorType["NAVIGATION_FAILED"] = "navigation_failed";
    ErrorType["ANTI_BOT"] = "anti_bot";
    ErrorType["DOM_CHANGED"] = "dom_changed";
    ErrorType["UNKNOWN"] = "unknown";
})(ErrorType || (ErrorType = {}));
export function classifyError(error, context) {
    const msg = error.message.toLowerCase();
    let type = ErrorType.UNKNOWN;
    // Playwright "locator.click: Timeout ... waiting for locator(...)" is a selector issue, not a real timeout
    if (msg.includes("waiting for locator") || (msg.includes("locator") && msg.includes("timeout"))) {
        type = ErrorType.SELECTOR_NOT_FOUND;
    }
    else if (msg.includes("selector") && (msg.includes("not found") || msg.includes("timeout") || msg.includes("strict mode violation"))) {
        type = ErrorType.SELECTOR_NOT_FOUND;
    }
    else if (msg.includes("timeout") || msg.includes("timed out")) {
        type = ErrorType.TIMEOUT;
    }
    else if (msg.includes("navigation") || msg.includes("net::err") || msg.includes("404")) {
        type = ErrorType.NAVIGATION_FAILED;
    }
    else if (msg.includes("captcha") || msg.includes("403") || msg.includes("429") || msg.includes("blocked") || msg.includes("cloudflare")) {
        type = ErrorType.ANTI_BOT;
    }
    return {
        type,
        message: error.message,
        selector: context?.selector,
        url: context?.url,
        timestamp: Date.now(),
        rawError: error,
    };
}
//# sourceMappingURL=detector.js.map