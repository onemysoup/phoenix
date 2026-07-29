import { z } from "zod";
export const frameEvaluateSchema = z.object({
    script: z.string().describe("JavaScript expression evaluated inside the selected iframe"),
});
export async function handleFrameEvaluate(session, params) {
    const frame = session.getActiveFrame();
    if (!frame)
        throw new Error("No iframe selected. Call switch_frame with action='into' first.");
    const result = await frame.evaluate(params.script);
    return { content: [{ type: "text", text: JSON.stringify({ success: true, result }) }] };
}
//# sourceMappingURL=frame-evaluate.js.map