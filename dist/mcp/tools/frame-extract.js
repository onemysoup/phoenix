import { z } from "zod";
export const frameExtractSchema = z.object({
    selector: z.string(),
    limit: z.number().int().min(1).max(100).default(50),
});
export async function handleFrameExtract(session, params) {
    const frame = session.getActiveFrame();
    if (!frame)
        throw new Error("No iframe selected. Call switch_frame with action='into' first.");
    const data = await frame.locator(params.selector).allTextContents();
    return { content: [{ type: "text", text: JSON.stringify({ success: true, count: Math.min(data.length, params.limit), data: data.slice(0, params.limit) }) }] };
}
//# sourceMappingURL=frame-extract.js.map