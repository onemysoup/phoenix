/**
 * DOM Sanitizer — Security Layer for LLM Calls
 *
 * Two defenses:
 *   1. Anti-Prompt-Injection: strip HTML comments, scripts, event handlers,
 *      and long non-structural text that could contain hidden instructions.
 *   2. PII Redaction: mask emails, phone numbers, credit cards, and other
 *      sensitive data before sending to external LLM providers.
 *
 * Applied to ALL DOM content before it enters any LLM prompt.
 */
// ========== Anti-Prompt-Injection ==========
/**
 * Strip content that could contain hidden instructions for the LLM.
 * Removes: HTML comments, script/style blocks, inline event handlers,
 * data URIs, and long opaque strings (base64, encoded blobs).
 */
export function sanitizeForLLM(html) {
    let s = html;
    // 1. Remove HTML comments: <!-- ... -->
    s = s.replace(/<!--[\s\S]*?-->/g, "");
    // 2. Remove script and style blocks entirely
    s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
    s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
    // 3. Remove inline event handlers: onclick=, onerror=, etc.
    s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "");
    // 4. Remove data: URIs (can contain scripts)
    s = s.replace(/data:[^;\s"']+/gi, "data:[redacted]");
    // 5. Remove long opaque strings (>100 chars of alphanumeric without spaces)
    //    These are often base64 blobs, encoded tokens, or injection payloads.
    s = s.replace(/(?<=>|^|\s)[A-Za-z0-9+/=]{100,}(?=<|\s|$)/g, "[truncated]");
    // 6. Remove javascript: URIs
    s = s.replace(/javascript\s*:/gi, "[blocked]:");
    return s;
}
// ========== PII Redaction ==========
const PII_PATTERNS = [
    // Email addresses
    { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "[email]" },
    // Phone numbers (international formats: +1-xxx, +86 xxx, (xxx) xxx-xxxx, etc.)
    { pattern: /\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g, replacement: "[phone]" },
    // Credit card numbers (13-19 digits, possibly spaced/dashed)
    { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/g, replacement: "[card]" },
    // SSN (US: xxx-xx-xxxx)
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[ssn]" },
    // IP addresses (not ideal for masking but can be sensitive)
    { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "[ip]" },
    // JWT tokens (eyJ...)
    { pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: "[token]" },
    // API keys (common patterns: sk-, pk-, key-, api_)
    { pattern: /\b(sk|pk|key|api)[_-][A-Za-z0-9]{20,}\b/g, replacement: "[api_key]" },
];
/**
 * Redact PII from text before sending to LLM.
 * Masks emails, phone numbers, credit cards, SSNs, IPs, JWTs, API keys.
 */
export function redactPII(text) {
    let s = text;
    for (const { pattern, replacement } of PII_PATTERNS) {
        s = s.replace(pattern, replacement);
    }
    return s;
}
/**
 * Combined: sanitize HTML and redact PII in one pass.
 */
export function sanitizeDOMForLLM(html) {
    return redactPII(sanitizeForLLM(html));
}
// ========== Output Validation ==========
/**
 * Validate that LLM response contains only safe selector output.
 * Rejects responses that contain executable code patterns.
 */
export function validateLLMOutput(raw) {
    // Try to parse as JSON
    let parsed;
    try {
        // Extract JSON from possible markdown code block
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, raw];
        parsed = JSON.parse(jsonMatch[1].trim());
    }
    catch {
        return { valid: false, error: "Response is not valid JSON" };
    }
    // Check for dangerous patterns in any string value
    const dangerous = /javascript:|data:|on\w+\s*=|<script|eval\(|Function\(|setTimeout\(|setInterval\(/i;
    const flat = JSON.stringify(parsed);
    if (dangerous.test(flat)) {
        return { valid: false, error: "Response contains potentially executable content" };
    }
    // If there's a newSelector field, validate it's a reasonable CSS selector
    const selector = parsed.fix?.newSelector ?? parsed.newSelector;
    if (selector && typeof selector === "string") {
        // Reject if it's too long (>200 chars) or contains suspicious patterns
        if (selector.length > 200) {
            return { valid: false, error: "Selector is unreasonably long" };
        }
        if (/javascript:|data:|<script|on\w+=/i.test(selector)) {
            return { valid: false, error: "Selector contains executable content" };
        }
    }
    if (parsed.confidence !== undefined && (typeof parsed.confidence !== "number" || !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1)) {
        return { valid: false, error: "Confidence must be a number between 0 and 1" };
    }
    if (parsed.fix?.action !== undefined) {
        const allowedActions = new Set(["retry", "new_selector", "wait_and_retry", "switch_proxy", "handle_captcha", "modify_headers", "abort"]);
        if (typeof parsed.fix.action !== "string" || !allowedActions.has(parsed.fix.action)) {
            return { valid: false, error: "Response contains an unsupported fix action" };
        }
    }
    return { valid: true, parsed };
}
//# sourceMappingURL=sanitizer.js.map