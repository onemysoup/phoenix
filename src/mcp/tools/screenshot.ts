import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";

export const screenshotSchema = z.object({
  fullPage: z.boolean().default(false).describe("Capture the full scrollable page"),
});

export async function handleScreenshot(
  session: BrowserSession,
  params: z.infer<typeof screenshotSchema>
) {
  const buffer = await session.screenshot(params.fullPage);
  return {
    content: [
      {
        type: "image" as const,
        data: buffer.toString("base64"),
        mimeType: "image/png",
      },
    ],
  };
}
