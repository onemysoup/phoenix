import { z } from "zod";
export const clickSchema = z.object({
    selector: z.string().describe("CSS selector of the element to click"),
    timeout: z.number().default(10000).describe("Timeout in milliseconds"),
});
export async function handleClick(session, params) {
    await session.click(params.selector, params.timeout);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ success: true, selector: params.selector }),
            },
        ],
    };
}
//# sourceMappingURL=click.js.map