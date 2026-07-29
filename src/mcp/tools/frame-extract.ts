import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";

export const frameExtractSchema = z.object({
  selector: z.string(),
  limit: z.number().int().min(1).max(100).default(50),
});

export async function handleFrameExtract(session: BrowserSession, params: z.infer<typeof frameExtractSchema>) {
  const frame = session.getActiveFrame();
  if (!frame) throw new Error("No iframe selected. Call switch_frame with action='into' first.");
  const data = await frame.locator(params.selector).allTextContents();
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, count: Math.min(data.length, params.limit), data: data.slice(0, params.limit) }) }] };
}
