/**
 * Selector Healer — Phase 3 Core Innovation
 *
 * When a CSS selector fails, use LLM to analyze the page HTML
 * and generate a new working selector.
 *
 * This is the most novel part of the self-healing engine.
 */

import { PageSnapshot } from "../browser/context.js";
import { LLMProvider, LLMMessage } from "./llm-provider.js";

const SELECTOR_HEAL_PROMPT = `You are a CSS selector expert. A selector stopped working on a webpage. Analyze the HTML and generate a new working selector.

## Original Selector
{originalSelector}

## What the selector was trying to find
{intent}

## Current Page HTML (truncated)
{pageHtml}

## Task
Generate a new CSS selector that targets the same element. Consider:
1. The element might have been renamed, moved, or had its classes changed
2. Use semantic attributes (role, aria-label, data-testid, name, type) when possible
3. Use text content matching as a fallback
4. Prefer stable selectors (IDs, data attributes) over fragile ones (nth-child, classes)

Respond in JSON:
{
  "newSelector": "the new CSS selector",
  "fallbackSelectors": ["alternative selector 1", "alternative selector 2"],
  "strategy": "how you found it (e.g., 'aria-label match', 'text content match', 'structural analysis')",
  "confidence": 0.9
}`;

export interface SelectorHealResult {
  newSelector: string;
  fallbackSelectors: string[];
  strategy: string;
  confidence: number;
}

export async function healSelector(
  originalSelector: string,
  intent: string,
  snapshot: PageSnapshot,
  llm: LLMProvider
): Promise<SelectorHealResult> {
  const prompt = SELECTOR_HEAL_PROMPT
    .replace("{originalSelector}", originalSelector)
    .replace("{intent}", intent)
    .replace("{pageHtml}", snapshot.html.slice(0, 6000));

  const messages: LLMMessage[] = [
    { role: "system", content: "You are a CSS selector expert. Always respond with valid JSON only." },
    { role: "user", content: prompt },
  ];

  const resp = await llm.chat(messages, { temperature: 0.1, maxTokens: 1024 });

  try {
    const parsed = JSON.parse(resp.content);
    return {
      newSelector: parsed.newSelector ?? originalSelector,
      fallbackSelectors: parsed.fallbackSelectors ?? [],
      strategy: parsed.strategy ?? "unknown",
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
    // Try to extract a selector from the response text
    const match = resp.content.match(/["']([#.][\w\s.#\[\]=":_-]+)["']/);
    return {
      newSelector: match?.[1] ?? originalSelector,
      fallbackSelectors: [],
      strategy: "extracted from text",
      confidence: 0.3,
    };
  }
}
