import { z } from "zod";
export const scrollSchema = z.object({
    direction: z.enum(["down", "up", "toBottom"]).default("down").describe("Scroll direction"),
    pixels: z.number().default(500).describe("Pixels to scroll (ignored for toBottom)"),
});
export async function handleScroll(session, params) {
    if (params.direction === "toBottom") {
        await session.scrollToBottom();
    }
    else {
        const delta = params.direction === "up" ? -params.pixels : params.pixels;
        await session.scrollDown(delta);
    }
    await new Promise((r) => setTimeout(r, 500));
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ success: true, direction: params.direction }),
            },
        ],
    };
}
//# sourceMappingURL=scroll.js.map