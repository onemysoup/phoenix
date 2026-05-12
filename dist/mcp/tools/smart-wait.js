import { z } from "zod";
export const smartWaitSchema = z.object({
    mode: z
        .enum(["dom_stable", "condition", "element_count"])
        .describe("Wait mode: " +
        "'dom_stable' waits until DOM stops changing, " +
        "'condition' waits until a JS expression returns true, " +
        "'element_count' waits until element count stabilizes"),
    selector: z
        .string()
        .optional()
        .describe("CSS selector for element_count mode"),
    expression: z
        .string()
        .optional()
        .describe("JS expression that must return true (for condition mode)"),
    stableMs: z
        .number()
        .default(1500)
        .describe("Milliseconds of inactivity before DOM is considered stable (dom_stable/element_count)"),
    timeout: z
        .number()
        .default(15000)
        .describe("Maximum wait time in milliseconds"),
});
export async function handleSmartWait(session, params) {
    const page = session.getActivePage();
    const deadline = Date.now() + params.timeout;
    switch (params.mode) {
        case "dom_stable": {
            // Inject MutationObserver and wait for DOM to stop changing
            const stable = await page.evaluate(({ stableMs, timeout }) => {
                return new Promise((resolve) => {
                    let timer = null;
                    let settled = false;
                    const done = (result) => {
                        if (settled)
                            return;
                        settled = true;
                        observer.disconnect();
                        if (timer)
                            clearTimeout(timer);
                        resolve(result);
                    };
                    const observer = new MutationObserver(() => {
                        if (timer)
                            clearTimeout(timer);
                        timer = setTimeout(() => done(true), stableMs);
                    });
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        characterData: true,
                    });
                    // Start the first timer
                    timer = setTimeout(() => done(true), stableMs);
                    // Overall timeout
                    setTimeout(() => done(false), timeout);
                });
            }, { stableMs: params.stableMs, timeout: params.timeout });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: stable,
                            mode: "dom_stable",
                            message: stable
                                ? `DOM stabilized after ${params.stableMs}ms of inactivity`
                                : `Timeout ${params.timeout}ms reached without DOM stability`,
                        }),
                    },
                ],
            };
        }
        case "condition": {
            if (!params.expression)
                throw new Error("expression is required for condition mode");
            let result = false;
            while (Date.now() < deadline) {
                try {
                    result = await page.evaluate(params.expression);
                    if (result)
                        break;
                }
                catch {
                    // Expression may fail while page is loading
                }
                await new Promise((r) => setTimeout(r, 200));
            }
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: result,
                            mode: "condition",
                            expression: params.expression,
                            message: result
                                ? "Condition became true"
                                : `Timeout ${params.timeout}ms reached, condition still false`,
                        }),
                    },
                ],
            };
        }
        case "element_count": {
            if (!params.selector)
                throw new Error("selector is required for element_count mode");
            let lastCount = -1;
            let stableStart = 0;
            let finalCount = 0;
            while (Date.now() < deadline) {
                const count = await page.locator(params.selector).count();
                if (count !== lastCount) {
                    lastCount = count;
                    stableStart = Date.now();
                }
                else if (Date.now() - stableStart >= params.stableMs) {
                    finalCount = count;
                    break;
                }
                await new Promise((r) => setTimeout(r, 200));
                finalCount = count;
            }
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            mode: "element_count",
                            selector: params.selector,
                            finalCount,
                            message: `Element count stabilized at ${finalCount}`,
                        }),
                    },
                ],
            };
        }
    }
}
//# sourceMappingURL=smart-wait.js.map