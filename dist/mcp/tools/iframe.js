import { z } from "zod";
export const switchFrameSchema = z.object({
    action: z
        .enum(["into", "back", "list"])
        .describe("'into' switches into an iframe, 'back' returns to parent frame, 'list' lists all iframes"),
    selector: z
        .string()
        .optional()
        .describe("CSS selector for the iframe (required for 'into' action)"),
});
export async function handleSwitchFrame(session, params) {
    const page = session.getActivePage();
    switch (params.action) {
        case "list": {
            const frames = page.frames();
            const frameInfo = frames.map((f, i) => ({
                index: i,
                name: f.name(),
                url: f.url(),
                isDetached: f.isDetached(),
            }));
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ success: true, frames: frameInfo }),
                    },
                ],
            };
        }
        case "into": {
            if (!params.selector)
                throw new Error("selector is required for 'into' action");
            // Wait for the iframe to be available
            await page.waitForSelector(params.selector, { timeout: 10000 });
            const elementHandle = await page.$(params.selector);
            if (!elementHandle)
                throw new Error(`Iframe not found: ${params.selector}`);
            const frame = await elementHandle.contentFrame();
            if (!frame)
                throw new Error(`Cannot access iframe content: ${params.selector}`);
            session.setActiveFrame(frame);
            // Get frame info
            const frameUrl = frame.url();
            const frameName = frame.name();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            action: "into",
                            selector: params.selector,
                            frameUrl,
                            frameName,
                            message: `Switched into iframe. Use frame_evaluate or frame_extract to interact with frame content.`,
                        }),
                    },
                ],
            };
        }
        case "back": {
            session.clearActiveFrame();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            action: "back",
                            message: "Switched back to main frame",
                        }),
                    },
                ],
            };
        }
    }
}
//# sourceMappingURL=iframe.js.map