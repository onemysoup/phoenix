/**
 * self_healing_run — MCP Tool
 *
 * Execute a browser operation with automatic self-healing.
 * This is the core Phase 3 tool that wraps any browser action
 * in the execute → fail → diagnose → heal → retry loop.
 */
import { z } from "zod";
import { executeWithHealing } from "../../healing/executor.js";
import { createLLMProvider } from "../../healing/llm-provider.js";
import { assertNavigationAllowed } from "../../security/url-policy.js";
// Lazy LLM provider — only created when needed
let llmInstance = null;
function getLLM() {
    if (llmInstance)
        return llmInstance;
    if (!process.env.LLM_API_KEY)
        return null;
    try {
        llmInstance = createLLMProvider();
        return llmInstance;
    }
    catch {
        return null;
    }
}
export const selfHealingRunSchema = z.object({
    action: z
        .enum(["navigate", "click", "type", "extract", "wait_for"])
        .describe("Browser action to execute with self-healing"),
    url: z.string().optional().describe("URL for navigate action"),
    selector: z.string().optional().describe("CSS selector for click/type/extract/wait_for actions"),
    text: z.string().optional().describe("Text for type action"),
    intent: z
        .string()
        .optional()
        .describe("Natural language description of what the selector targets (helps LLM heal selectors)"),
    waitCondition: z
        .enum(["visible", "hidden", "stable"])
        .default("visible")
        .describe("Condition for wait_for action"),
    maxRetries: z.number().int().min(1).max(5).default(3).describe("Maximum retry attempts (1-5)"),
    useLLM: z.boolean().default(true).describe("Use LLM for diagnosis (requires LLM_API_KEY)"),
    expectedUrl: z.string().url().optional().describe("Postcondition: expected final URL after a healed action"),
    expectedSelector: z.string().optional().describe("Postcondition: selector that must exist and be visible after a healed action"),
    expectedText: z.string().max(500).optional().describe("Postcondition: text that must appear in the page after a healed action"),
});
export async function handleSelfHealingRun(session, params) {
    const llm = params.useLLM ? (getLLM() ?? undefined) : undefined;
    const result = await executeWithHealing(session, async (page, effectiveSelector) => {
        const sel = effectiveSelector ?? params.selector;
        switch (params.action) {
            case "navigate": {
                if (!params.url)
                    throw new Error("url is required for navigate");
                await page.goto(assertNavigationAllowed(params.url).toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
                return { url: page.url(), title: await page.title() };
            }
            case "click": {
                if (!sel)
                    throw new Error("selector is required for click");
                await page.locator(sel).click({ timeout: 5000 });
                return { clicked: sel };
            }
            case "type": {
                if (!sel)
                    throw new Error("selector is required for type");
                if (!params.text)
                    throw new Error("text is required for type");
                await page.locator(sel).fill(params.text);
                return { typed: params.text, selector: sel };
            }
            case "extract": {
                if (!sel)
                    throw new Error("selector is required for extract");
                const elements = await page.locator(sel).all();
                const texts = [];
                for (const el of elements.slice(0, 50)) {
                    const text = await el.textContent();
                    if (text)
                        texts.push(text.trim());
                }
                return { count: texts.length, data: texts };
            }
            case "wait_for": {
                if (!sel)
                    throw new Error("selector is required for wait_for");
                await page.waitForSelector(sel, {
                    state: params.waitCondition === "hidden" ? "hidden" : "visible",
                    timeout: 15000,
                });
                return { waited: sel, condition: params.waitCondition };
            }
        }
    }, {
        maxRetries: params.maxRetries,
        llm,
        context: {
            selector: params.selector,
            url: params.url,
            intent: params.intent,
        },
        verify: async (page, _result, effectiveSelector) => {
            if (params.expectedUrl && page.url() !== assertNavigationAllowed(params.expectedUrl).toString())
                return false;
            if (params.expectedSelector && !await page.locator(params.expectedSelector).first().isVisible().catch(() => false))
                return false;
            if (params.expectedText && !await page.locator("body").innerText().then((text) => text.includes(params.expectedText)).catch(() => false))
                return false;
            if (params.expectedUrl || params.expectedSelector || params.expectedText)
                return true;
            switch (params.action) {
                case "navigate":
                    return !!params.url && page.url() === assertNavigationAllowed(params.url).toString();
                case "type":
                    return !!effectiveSelector && !!params.text && await page.locator(effectiveSelector).inputValue() === params.text;
                case "extract":
                    // Empty extraction is valid for a legitimate selector, but a healed
                    // selector must resolve to at least one visible target.
                    return !!effectiveSelector && await page.locator(effectiveSelector).count() > 0;
                case "wait_for":
                    return !!effectiveSelector && await page.locator(effectiveSelector).first().isVisible();
                case "click":
                    // Click has no universal DOM postcondition. The generic page-state
                    // verifier in executor remains the conservative fallback.
                    return undefined;
            }
        },
    });
    // If selector was healed, include that info
    const healedSelector = result.healedSelector;
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: result.success,
                    result: result.result,
                    attempts: result.attempts,
                    healedSelector,
                    history: result.history.map((h) => ({
                        attempt: h.attempt,
                        action: h.action,
                        error: h.error?.message,
                        diagnosis: h.diagnosis
                            ? {
                                rootCause: h.diagnosis.rootCause,
                                fix: h.diagnosis.suggestedFix.action,
                                confidence: h.diagnosis.confidence,
                                method: h.diagnosis.method,
                            }
                            : undefined,
                        duration: h.duration,
                    })),
                    llmUsed: !!llm,
                }),
            },
        ],
    };
}
//# sourceMappingURL=self-healing-run.js.map