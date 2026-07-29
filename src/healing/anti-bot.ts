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

import { Page, BrowserContext } from "playwright";
import { PageSnapshot } from "../browser/context.js";
import { LLMProvider, LLMMessage } from "./llm-provider.js";
import { sanitizeDOMForLLM, validateLLMOutput } from "./sanitizer.js";

export enum AntiBotType {
  CAPTCHA = "captcha",
  IP_BLOCKED = "ip_blocked",
  RATE_LIMITED = "rate_limited",
  CLOUDFLARE_CHALLENGE = "cloudflare_challenge",
  FINGERPRINT_DETECTED = "fingerprint_detected",
  UNKNOWN = "unknown",
}

export interface AntiBotDetection {
  type: AntiBotType;
  confidence: number;
  evidence: string;
}

// ========== Detection ==========

export async function detectAntiBot(page: Page, snapshot?: PageSnapshot): Promise<AntiBotDetection | null> {
  const html = snapshot?.html ?? await page.content();
  const url = snapshot?.url ?? page.url();
  const lowerHtml = html.toLowerCase();

  // Cloudflare challenge
  if (lowerHtml.includes("cloudflare") && (lowerHtml.includes("challenge") || lowerHtml.includes("checking your browser"))) {
    return { type: AntiBotType.CLOUDFLARE_CHALLENGE, confidence: 0.95, evidence: "Cloudflare challenge page detected" };
  }

  // CAPTCHA
  if (lowerHtml.includes("recaptcha") || lowerHtml.includes("hcaptcha") || lowerHtml.includes("turnstile")) {
    return { type: AntiBotType.CAPTCHA, confidence: 0.9, evidence: "CAPTCHA widget detected in page" };
  }

  // 403 page
  if (lowerHtml.includes("403") && (lowerHtml.includes("forbidden") || lowerHtml.includes("access denied"))) {
    return { type: AntiBotType.IP_BLOCKED, confidence: 0.85, evidence: "403 Forbidden page" };
  }

  // Rate limit
  if (lowerHtml.includes("429") || lowerHtml.includes("too many requests") || lowerHtml.includes("rate limit")) {
    return { type: AntiBotType.RATE_LIMITED, confidence: 0.85, evidence: "Rate limit page detected" };
  }

  // Check page title for anti-bot signals
  const title = (snapshot?.title ?? await page.title()).toLowerCase();
  if (title.includes("just a moment") || title.includes("attention required")) {
    return { type: AntiBotType.CLOUDFLARE_CHALLENGE, confidence: 0.8, evidence: `Suspicious title: ${title}` };
  }

  // Check for empty body (JS challenge that hasn't rendered)
  const bodyText = await page.evaluate(() => document.body?.innerText?.trim() ?? "").catch(() => "");
  if (bodyText.length < 50 && html.length > 1000) {
    // Lots of HTML but no visible content — likely a JS challenge
    return { type: AntiBotType.CLOUDFLARE_CHALLENGE, confidence: 0.6, evidence: "Page has HTML but no visible content (JS challenge?)" };
  }

  return null;
}

// ========== Handling Strategies ==========

export interface AntiBotStrategy {
  action: "wait_and_retry" | "modify_headers" | "abort";
  waitMs?: number;
  extraHeaders?: Record<string, string>;
  reason: string;
}

export function getAntiBotStrategy(detection: AntiBotDetection): AntiBotStrategy {
  switch (detection.type) {
    case AntiBotType.CLOUDFLARE_CHALLENGE:
      return {
        action: "wait_and_retry",
        waitMs: 8000,
        reason: "Wait for Cloudflare challenge to auto-resolve",
      };
    case AntiBotType.CAPTCHA:
      return {
        action: "abort",
        reason: "CAPTCHA requires human intervention — cannot auto-solve",
      };
    case AntiBotType.RATE_LIMITED:
      return {
        action: "wait_and_retry",
        waitMs: 10000,
        reason: "Wait for rate limit window to reset",
      };
    case AntiBotType.IP_BLOCKED:
      return {
        action: "modify_headers",
        extraHeaders: { "User-Agent": getRandomUserAgent() },
        reason: "Try with different User-Agent",
      };
    case AntiBotType.FINGERPRINT_DETECTED:
      return {
        action: "modify_headers",
        reason: "Modify browser fingerprint headers",
      };
    default:
      return {
        action: "wait_and_retry",
        waitMs: 5000,
        reason: "Unknown anti-bot, wait and retry",
      };
  }
}

export async function applyAntiBotStrategy(
  page: Page,
  strategy: AntiBotStrategy,
  context?: BrowserContext
): Promise<void> {
  if (strategy.waitMs) {
    await new Promise((r) => setTimeout(r, strategy.waitMs));
  }
  if (strategy.extraHeaders && context) {
    await context.setExtraHTTPHeaders(strategy.extraHeaders);
  }
}

function getRandomUserAgent(): string {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

// ========== LLM-powered anti-bot analysis ==========

const ANTIBOT_PROMPT = `You are an anti-bot detection expert. Analyze the page content and suggest a handling strategy.

## Page URL
{url}

## Page HTML (truncated)
{pageHtml}

## Detection Result
Type: {detectionType}
Evidence: {evidence}

## Task
Suggest the best strategy to handle this anti-bot mechanism. Consider:
1. Can it be bypassed by waiting?
2. Does it require header modifications?
3. Is it a hard block (CAPTCHA) that needs human intervention?

Respond in JSON:
{
  "strategy": "wait|modify_headers|abort",
  "waitMs": 8000,
  "headers": {"User-Agent": "..."},
  "reasoning": "why this strategy should work",
  "confidence": 0.7
}`;

export async function analyzeAntiBotWithLLM(
  detection: AntiBotDetection,
  snapshot: PageSnapshot,
  llm: LLMProvider
): Promise<AntiBotStrategy> {
  const prompt = ANTIBOT_PROMPT
    .replace("{url}", snapshot.url)
    .replace("{pageHtml}", sanitizeDOMForLLM(snapshot.html).slice(0, 4000))
    .replace("{detectionType}", detection.type)
    .replace("{evidence}", detection.evidence);

  try {
    const resp = await llm.chat(
      [
        { role: "system", content: "You are an anti-bot expert. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      { temperature: 0.1, maxTokens: 512 }
    );
    const validation = validateLLMOutput(resp.content);
    if (!validation.valid) return getAntiBotStrategy(detection);
    const parsed = validation.parsed;
    return {
      action: parsed.strategy === "wait" ? "wait_and_retry" : parsed.strategy === "abort" ? "abort" : "modify_headers",
      waitMs: parsed.waitMs,
      extraHeaders: parsed.headers,
      reason: parsed.reasoning ?? "LLM suggested strategy",
    };
  } catch {
    return getAntiBotStrategy(detection);
  }
}
