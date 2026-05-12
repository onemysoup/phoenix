import { z } from "zod";
export const waitSchema = z.object({
    condition: z
        .enum(["selector", "networkidle", "load", "timeout"])
        .describe("Wait condition type"),
    selector: z.string().optional().describe("CSS selector (required when condition is 'selector')"),
    timeout: z.number().default(10000).describe("Maximum wait time in milliseconds"),
});
export async function handleWait(session, params) {
    const page = session.getActivePage();
    switch (params.condition) {
        case "selector":
            if (!params.selector)
                throw new Error("selector is required when condition is 'selector'");
            await page.waitForSelector(params.selector, { timeout: params.timeout });
            break;
        case "networkidle":
            await page.waitForLoadState("networkidle", { timeout: params.timeout });
            break;
        case "load":
            await page.waitForLoadState("load", { timeout: params.timeout });
            break;
        case "timeout":
            await new Promise((r) => setTimeout(r, params.timeout));
            break;
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ success: true, condition: params.condition, url: page.url() }),
            },
        ],
    };
}
//# sourceMappingURL=wait.js.map