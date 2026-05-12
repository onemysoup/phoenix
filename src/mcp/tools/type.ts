import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";

export const typeSchema = z.object({
  selector: z.string().describe("CSS selector of the input element"),
  text: z.string().describe("Text to type into the element"),
  submit: z.boolean().default(false).describe("Press Enter after typing"),
});

export async function handleType(
  session: BrowserSession,
  params: z.infer<typeof typeSchema>
) {
  await session.type(params.selector, params.text, params.submit);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          selector: params.selector,
          text: params.text,
          submitted: params.submit,
        }),
      },
    ],
  };
}
