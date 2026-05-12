import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const extractSchema: z.ZodObject<{
    selector: z.ZodString;
    attributes: z.ZodDefault<z.ZodArray<z.ZodEnum<["textContent", "innerHTML", "href", "src", "class", "id", "alt", "title", "value"]>, "many">>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    selector: string;
    attributes: ("id" | "textContent" | "innerHTML" | "title" | "value" | "href" | "src" | "class" | "alt")[];
    limit: number;
}, {
    selector: string;
    attributes?: ("id" | "textContent" | "innerHTML" | "title" | "value" | "href" | "src" | "class" | "alt")[] | undefined;
    limit?: number | undefined;
}>;
export declare function handleExtract(session: BrowserSession, params: z.infer<typeof extractSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
