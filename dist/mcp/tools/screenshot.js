import { z } from "zod";
export const screenshotSchema = z.object({
    fullPage: z.boolean().default(false).describe("Capture the full scrollable page"),
});
export async function handleScreenshot(session, params) {
    const buffer = await session.screenshot(params.fullPage);
    return {
        content: [
            {
                type: "image",
                data: buffer.toString("base64"),
                mimeType: "image/png",
            },
        ],
    };
}
//# sourceMappingURL=screenshot.js.map