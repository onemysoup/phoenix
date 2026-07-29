import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const frameEvaluateSchema: z.ZodObject<{
    script: z.ZodString;
}, "strip", z.ZodTypeAny, {
    script: string;
}, {
    script: string;
}>;
export declare function handleFrameEvaluate(session: BrowserSession, params: z.infer<typeof frameEvaluateSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
