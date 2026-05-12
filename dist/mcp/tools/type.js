import { z } from "zod";
export const typeSchema = z.object({
    selector: z.string().describe("CSS selector of the input element"),
    text: z.string().describe("Text to type into the element"),
    submit: z.boolean().default(false).describe("Press Enter after typing"),
});
export async function handleType(session, params) {
    await session.type(params.selector, params.text, params.submit);
    return {
        content: [
            {
                type: "text",
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
//# sourceMappingURL=type.js.map