import { z } from "zod";
export const evaluateSchema = z.object({
    script: z
        .string()
        .describe("JavaScript expression to evaluate. Result must be JSON-serializable."),
});
export async function handleEvaluate(session, params) {
    const result = await session.evaluate(params.script);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ success: true, result }),
            },
        ],
    };
}
//# sourceMappingURL=evaluate.js.map