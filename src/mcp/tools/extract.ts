import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";

export const extractSchema = z.object({
  selector: z.string().describe("CSS selector for target elements"),
  attributes: z
    .array(z.enum(["textContent", "innerHTML", "href", "src", "class", "id", "alt", "title", "value"]))
    .default(["textContent"])
    .describe("Attributes to extract from each element"),
  limit: z.number().default(100).describe("Maximum number of elements to extract"),
});

export async function handleExtract(
  session: BrowserSession,
  params: z.infer<typeof extractSchema>
) {
  const page = session.getActivePage();
  const elements = await page.locator(params.selector).all();
  const sliced = elements.slice(0, params.limit);

  const results: Record<string, string | null>[] = [];
  for (const el of sliced) {
    const row: Record<string, string | null> = {};
    for (const attr of params.attributes) {
      if (attr === "textContent") row[attr] = await el.textContent();
      else if (attr === "innerHTML") row[attr] = await el.innerHTML();
      else row[attr] = await el.getAttribute(attr);
    }
    results.push(row);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, count: results.length, data: results }),
      },
    ],
  };
}
