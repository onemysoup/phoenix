import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";

export const clickSchema = z.object({
  selector: z.string().describe("CSS selector of the element to click"),
  timeout: z.number().default(10000).describe("Timeout in milliseconds"),
});

export async function handleClick(
  session: BrowserSession,
  params: z.infer<typeof clickSchema>
) {
  await session.click(params.selector, params.timeout);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, selector: params.selector }),
      },
    ],
  };
}
