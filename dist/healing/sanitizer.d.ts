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
/**
 * Strip content that could contain hidden instructions for the LLM.
 * Removes: HTML comments, script/style blocks, inline event handlers,
 * data URIs, and long opaque strings (base64, encoded blobs).
 */
export declare function sanitizeForLLM(html: string): string;
/**
 * Redact PII from text before sending to LLM.
 * Masks emails, phone numbers, credit cards, SSNs, IPs, JWTs, API keys.
 */
export declare function redactPII(text: string): string;
/**
 * Combined: sanitize HTML and redact PII in one pass.
 */
export declare function sanitizeDOMForLLM(html: string): string;
/**
 * Validate that LLM response contains only safe selector output.
 * Rejects responses that contain executable code patterns.
 */
export declare function validateLLMOutput(raw: string): {
    valid: boolean;
    parsed?: any;
    error?: string;
};
