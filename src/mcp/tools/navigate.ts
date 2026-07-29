import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";

export const navigateSchema = z.object({
  url: z.string().url().describe("The URL to navigate to"),
  waitUntil: z
    .enum(["load", "domcontentloaded", "networkidle"])
    .default("domcontentloaded")
    .describe("When to consider navigation complete"),
});

export async function handleNavigate(
  session: BrowserSession,
  params: z.infer<typeof navigateSchema>
) {
  await session.navigate(params.url, params.waitUntil);
  const page = session.getActivePage();
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          url: page.url(),
          title: await page.title(),
        }),
      },
    ],
  };
}
