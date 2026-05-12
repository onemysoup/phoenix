import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";

export const shadowExtractSchema = z.object({
  hostSelector: z
    .string()
    .describe("CSS selector for the shadow host element(s)"),
  innerSelector: z
    .string()
    .describe("CSS selector for elements inside the shadow root"),
  attributes: z
    .array(z.enum(["textContent", "innerHTML", "href", "src", "class", "id", "alt", "title", "value"]))
    .default(["textContent"])
    .describe("Attributes to extract"),
  limit: z.number().default(100).describe("Maximum elements to extract"),
});

/**
 * Recursively pierce Shadow DOM: query inside shadow roots.
 * Uses page.evaluate to traverse the shadow tree from JS context.
 */
export async function handleShadowExtract(
  session: BrowserSession,
  params: z.infer<typeof shadowExtractSchema>
) {
  const page = session.getActivePage();

  const results = await page.evaluate(
    ({ hostSelector, innerSelector, attributes, limit }) => {
      function queryShadowRoots(root: Document | ShadowRoot, selector: string): Element[] {
        const elements: Element[] = [];
        // Direct query
        elements.push(...Array.from(root.querySelectorAll(selector)));
        // Query inside nested shadow roots
        const allElements = root.querySelectorAll("*");
        for (const el of allElements) {
          if (el.shadowRoot) {
            elements.push(...queryShadowRoots(el.shadowRoot, selector));
          }
        }
        return elements;
      }

      // Find shadow hosts
      const hosts = Array.from(document.querySelectorAll(hostSelector));
      const allResults: Record<string, string | null>[] = [];

      for (const host of hosts) {
        if (!host.shadowRoot) continue;
        const innerElements = queryShadowRoots(host.shadowRoot, innerSelector);
        for (const el of innerElements.slice(0, limit - allResults.length)) {
          const row: Record<string, string | null> = {};
          for (const attr of attributes) {
            if (attr === "textContent") row[attr] = el.textContent;
            else if (attr === "innerHTML") row[attr] = (el as HTMLElement).innerHTML;
            else row[attr] = el.getAttribute(attr);
          }
          allResults.push(row);
          if (allResults.length >= limit) break;
        }
        if (allResults.length >= limit) break;
      }

      return allResults;
    },
    {
      hostSelector: params.hostSelector,
      innerSelector: params.innerSelector,
      attributes: params.attributes,
      limit: params.limit,
    }
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          count: results.length,
          data: results,
        }),
      },
    ],
  };
}
