import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const evaluateSchema: z.ZodObject<{
    script: z.ZodString;
}, "strip", z.ZodTypeAny, {
    script: string;
}, {
    script: string;
}>;
export declare function handleEvaluate(session: BrowserSession, params: z.infer<typeof evaluateSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
