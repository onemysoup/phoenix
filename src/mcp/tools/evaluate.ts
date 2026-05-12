import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";

export const evaluateSchema = z.object({
  script: z
    .string()
    .describe("JavaScript expression to evaluate. Result must be JSON-serializable."),
});

export async function handleEvaluate(
  session: BrowserSession,
  params: z.infer<typeof evaluateSchema>
) {
  const result = await session.evaluate(params.script);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, result }),
      },
    ],
  };
}
