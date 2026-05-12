import { z } from "zod";
export const navigateSchema = z.object({
    url: z.string().url().describe("The URL to navigate to"),
    waitUntil: z
        .enum(["load", "domcontentloaded", "networkidle"])
        .default("domcontentloaded")
        .describe("When to consider navigation complete"),
});
export async function handleNavigate(session, params) {
    await session.navigate(params.url, params.waitUntil);
    const page = session.getActivePage();
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    url: page.url(),
                    title: await page.title(),
                }),
            },
        ],
    };
}
//# sourceMappingURL=navigate.js.map