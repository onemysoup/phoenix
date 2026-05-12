import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const shadowExtractSchema: z.ZodObject<{
    hostSelector: z.ZodString;
    innerSelector: z.ZodString;
    attributes: z.ZodDefault<z.ZodArray<z.ZodEnum<["textContent", "innerHTML", "href", "src", "class", "id", "alt", "title", "value"]>, "many">>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    attributes: ("id" | "textContent" | "innerHTML" | "title" | "value" | "href" | "src" | "class" | "alt")[];
    limit: number;
    hostSelector: string;
    innerSelector: string;
}, {
    hostSelector: string;
    innerSelector: string;
    attributes?: ("id" | "textContent" | "innerHTML" | "title" | "value" | "href" | "src" | "class" | "alt")[] | undefined;
    limit?: number | undefined;
}>;
/**
 * Recursively pierce Shadow DOM: query inside shadow roots.
 * Uses page.evaluate to traverse the shadow tree from JS context.
 */
export declare function handleShadowExtract(session: BrowserSession, params: z.infer<typeof shadowExtractSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
