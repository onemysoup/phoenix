/**
 * Anti-Bot Handler — Phase 3
 *
 * Detects and handles common anti-bot mechanisms:
 * - CAPTCHA (reCAPTCHA, hCaptcha, Cloudflare Turnstile)
 * - IP blocking (403)
 * - Rate limiting (429)
 * - Cloudflare challenge pages
 * - Browser fingerprint detection
 */
import { Page, BrowserContext } from "playwright-core";
import { PageSnapshot } from "../browser/context.js";
import { LLMProvider } from "./llm-provider.js";
export declare enum AntiBotType {
    CAPTCHA = "captcha",
    IP_BLOCKED = "ip_blocked",
    RATE_LIMITED = "rate_limited",
    CLOUDFLARE_CHALLENGE = "cloudflare_challenge",
    FINGERPRINT_DETECTED = "fingerprint_detected",
    UNKNOWN = "unknown"
}
export interface AntiBotDetection {
    type: AntiBotType;
    confidence: number;
    evidence: string;
}
export declare function detectAntiBot(page: Page, snapshot?: PageSnapshot): Promise<AntiBotDetection | null>;
export interface AntiBotStrategy {
    action: "wait_and_retry" | "modify_headers" | "switch_proxy" | "abort";
    waitMs?: number;
    extraHeaders?: Record<string, string>;
    reason: string;
}
export declare function getAntiBotStrategy(detection: AntiBotDetection): AntiBotStrategy;
export declare function applyAntiBotStrategy(page: Page, strategy: AntiBotStrategy, context?: BrowserContext): Promise<void>;
export declare function analyzeAntiBotWithLLM(detection: AntiBotDetection, snapshot: PageSnapshot, llm: LLMProvider): Promise<AntiBotStrategy>;
