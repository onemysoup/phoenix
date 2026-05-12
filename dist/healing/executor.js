/**
 * Healing Executor — Phase 3 Self-Healing Engine
 *
 * Core loop: execute → fail → diagnose → heal → retry
 *
 * Healing strategy (in priority order):
 *   1. Repair Cache — instant lookup of past fixes (0ms, $0)
 *   2. Semantic Match — deterministic DOM fingerprint matching (~50ms, $0)
 *   3. LLM Analysis — last resort, deep analysis (~2s, costs money)
 */
import { classifyError, ErrorType } from "./detector.js";
import { diagnose } from "./diagnoser.js";
import { SemanticHealer } from "./semantic/healer.js";
import { WeightStore } from "./semantic/weight-store.js";
import { detectAntiBot, analyzeAntiBotWithLLM, applyAntiBotStrategy, getAntiBotStrategy } from "./anti-bot.js";
/**
 * Capture a lightweight page state snapshot for post-action verification.
 */
async function capturePageState(page) {
    try {
        const state = await page.evaluate(() => ({
            url: location.href,
            contentHash: document.body?.innerText?.slice(0, 500) ?? "",
        }));
        return state;
    }
    catch {
        return { url: page.url(), contentHash: "" };
    }
}
/**
 * Determine if post-action verification should apply.
 * Not all actions benefit from page-state verification:
 * - navigate: always verify (URL should change)
 * - click: verify only if we expect a navigation (intent mentions "link", "go to", "navigate")
 * - type: skip (the operation itself validates the input)
 * - extract: skip (data extraction has its own validation)
 * - wait_for: skip (wait already validates the condition)
 */
function shouldVerify(context) {
    if (!context?.intent)
        return false;
    const intent = context.intent.toLowerCase();
    // Only verify when intent suggests a navigation or page change
    return /navigate|go to|link|open|submit|redirect|login|sign in/i.test(intent);
}
// Shared healer instance (with cache) across all operations
let sharedHealer = null;
export function getSharedHealer() {
    if (!sharedHealer)
        sharedHealer = new SemanticHealer(undefined, new WeightStore());
    return sharedHealer;
}
/**
 * Execute a browser operation with automatic self-healing.
 * The operation receives the current page and an optional "effective selector"
 * that may have been healed by a previous attempt.
 */
export async function executeWithHealing(session, operation, options = {}) {
    const maxRetries = options.maxRetries ?? 3;
    const healer = options.healer ?? getSharedHealer();
    const history = [];
    let lastError;
    let lastDiagnosis;
    let currentSelector = options.context?.selector;
    let healMethod;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const startTime = Date.now();
        try {
            // Capture before-state when using a healed selector (for verification)
            const useVerification = healMethod && shouldVerify(options.context);
            const beforeState = useVerification ? await capturePageState(session.getActivePage()) : null;
            const result = await operation(session.getActivePage(), currentSelector);
            // Post-action verification: only for actions where "success" doesn't guarantee correctness
            if (beforeState && currentSelector && options.context?.selector && currentSelector !== options.context.selector) {
                const afterState = await capturePageState(session.getActivePage());
                const urlChanged = beforeState.url !== afterState.url;
                const contentChanged = beforeState.contentHash !== afterState.contentHash;
                if (!urlChanged && !contentChanged) {
                    // Verification failed: healed selector resolved but produced no visible effect
                    const domain = new URL(session.getActivePage().url()).hostname;
                    healer.getCache().recordVerifyFailure(domain, options.context.selector);
                    history.push({
                        attempt,
                        action: `verify_failed: healed selector resolved but page unchanged, invalidating cache`,
                        duration: Date.now() - startTime,
                    });
                    // Don't return success — fall through to retry with higher-tier healing
                    continue;
                }
                // Verification passed
                const domain = new URL(session.getActivePage().url()).hostname;
                healer.getCache().recordVerifySuccess(domain, options.context.selector);
            }
            history.push({ attempt, action: "execute", duration: Date.now() - startTime });
            return {
                success: true,
                result,
                attempts: attempt,
                history,
                healedSelector: currentSelector !== options.context?.selector ? currentSelector : undefined,
                healMethod,
            };
        }
        catch (rawError) {
            const error = rawError instanceof Error ? rawError : new Error(String(rawError));
            const classified = classifyError(error, { ...options.context, selector: currentSelector });
            lastError = classified;
            // Capture page snapshot
            let snapshot;
            try {
                snapshot = await session.getSnapshot();
            }
            catch { }
            // === Anti-bot check ===
            if (classified.type === ErrorType.ANTI_BOT || classified.type === ErrorType.UNKNOWN) {
                try {
                    const antiBot = await detectAntiBot(session.getActivePage(), snapshot ?? undefined);
                    if (antiBot) {
                        const strategy = options.llm && snapshot
                            ? await analyzeAntiBotWithLLM(antiBot, snapshot, options.llm)
                            : getAntiBotStrategy(antiBot);
                        history.push({
                            attempt,
                            error: classified,
                            action: `anti_bot: ${antiBot.type} → ${strategy.action}`,
                            duration: Date.now() - startTime,
                        });
                        if (strategy.action === "abort")
                            return { success: false, attempts: attempt, history, lastError: classified };
                        await applyAntiBotStrategy(session.getActivePage(), strategy, session.context);
                        continue;
                    }
                }
                catch { }
            }
            // === Diagnosis ===
            lastDiagnosis = await diagnose(classified, snapshot, options.llm);
            // === Apply fix ===
            const fix = lastDiagnosis.suggestedFix;
            if (fix.action === "abort") {
                history.push({ attempt, error: classified, diagnosis: lastDiagnosis, action: "abort", duration: Date.now() - startTime });
                return { success: false, attempts: attempt, history, lastError: classified, lastDiagnosis, healMethod };
            }
            if (fix.action === "wait_and_retry") {
                history.push({ attempt, error: classified, diagnosis: lastDiagnosis, action: `wait ${fix.waitMs}ms`, duration: Date.now() - startTime });
                await new Promise((r) => setTimeout(r, fix.waitMs ?? 2000));
                continue;
            }
            if (fix.action === "modify_headers" && fix.extraHeaders) {
                await session.context.setExtraHTTPHeaders(fix.extraHeaders);
                history.push({ attempt, error: classified, action: "modify_headers", duration: Date.now() - startTime });
                continue;
            }
            if (fix.action === "new_selector" && currentSelector) {
                // Three-tier healing: cache → semantic → LLM
                const healResult = await healer.heal(session.getActivePage(), currentSelector, options.context?.intent ?? "the target element", snapshot, options.llm);
                if (healResult.success && healResult.newSelector) {
                    currentSelector = healResult.newSelector;
                    healMethod = healResult.method;
                    history.push({
                        attempt,
                        error: classified,
                        diagnosis: lastDiagnosis,
                        action: `healed(${healResult.method}): ${options.context?.selector} → ${currentSelector} (conf: ${healResult.confidence.toFixed(2)})`,
                        duration: Date.now() - startTime,
                    });
                    continue;
                }
                // Fallback: LLM diagnosis already suggested a selector
                if (fix.newSelector && fix.newSelector !== currentSelector) {
                    currentSelector = fix.newSelector;
                    healMethod = "llm";
                    history.push({
                        attempt,
                        error: classified,
                        action: `llm_fix: ${options.context?.selector} → ${currentSelector}`,
                        duration: Date.now() - startTime,
                    });
                    continue;
                }
                history.push({
                    attempt,
                    error: classified,
                    action: `heal_failed: no match found`,
                    duration: Date.now() - startTime,
                });
            }
            // Default: retry
            history.push({ attempt, error: classified, diagnosis: lastDiagnosis, action: "retry", duration: Date.now() - startTime });
        }
    }
    return {
        success: false,
        attempts: maxRetries,
        history,
        lastError,
        lastDiagnosis,
        healedSelector: currentSelector !== options.context?.selector ? currentSelector : undefined,
        healMethod,
    };
}
//# sourceMappingURL=executor.js.map