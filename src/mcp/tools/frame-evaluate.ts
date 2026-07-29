import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";

export const frameEvaluateSchema = z.object({
  script: z.string().describe("JavaScript expression evaluated inside the selected iframe"),
});

export async function handleFrameEvaluate(session: BrowserSession, params: z.infer<typeof frameEvaluateSchema>) {
  const frame = session.getActiveFrame();
  if (!frame) throw new Error("No iframe selected. Call switch_frame with action='into' first.");
  const result = await frame.evaluate(params.script);
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, result }) }] };
}
