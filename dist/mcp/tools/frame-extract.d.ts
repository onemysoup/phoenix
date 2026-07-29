import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const frameExtractSchema: z.ZodObject<{
    selector: z.ZodString;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    selector: string;
    limit: number;
}, {
    selector: string;
    limit?: number | undefined;
}>;
export declare function handleFrameExtract(session: BrowserSession, params: z.infer<typeof frameExtractSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
