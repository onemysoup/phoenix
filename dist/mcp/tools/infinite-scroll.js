import { z } from "zod";
export const infiniteScrollSchema = z.object({
    contentSelector: z
        .string()
        .optional()
        .describe("CSS selector to track new content (e.g. '.item', 'article'). If omitted, tracks total page height."),
    maxScrolls: z
        .number().int().min(1).max(100)
        .default(20)
        .describe("Maximum number of scroll attempts"),
    scrollDelay: z
        .number().int().min(50).max(30_000)
        .default(1000)
        .describe("Milliseconds to wait between scrolls for new content to load"),
    stableRounds: z
        .number().int().min(1).max(10)
        .default(2)
        .describe("Number of consecutive scrolls with no new content before stopping"),
});
export async function handleInfiniteScroll(session, params) {
    const page = session.getActivePage();
    const getContentCount = async () => {
        if (params.contentSelector) {
            return page.locator(params.contentSelector).count();
        }
        return page.evaluate(() => document.body.scrollHeight);
    };
    let previousCount = await getContentCount();
    let totalNewItems = 0;
    let stableRounds = 0;
    let scrollCount = 0;
    for (let i = 0; i < params.maxScrolls; i++) {
        // Scroll to bottom and dispatch scroll event to ensure listeners fire
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
            window.dispatchEvent(new Event("scroll"));
        });
        scrollCount++;
        // Wait for content to load
        await new Promise((r) => setTimeout(r, params.scrollDelay));
        const currentCount = await getContentCount();
        const newItems = currentCount - previousCount;
        if (newItems > 0) {
            totalNewItems += newItems;
            previousCount = currentCount;
            stableRounds = 0;
        }
        else {
            stableRounds++;
            if (stableRounds >= params.stableRounds)
                break;
        }
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    scrollCount,
                    totalNewItems,
                    finalCount: previousCount,
                    stoppedBecause: stableRounds >= params.stableRounds ? "no_new_content" : "max_scrolls_reached",
                }),
            },
        ],
    };
}
//# sourceMappingURL=infinite-scroll.js.map