import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const screenshotSchema: z.ZodObject<{
    fullPage: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    fullPage: boolean;
}, {
    fullPage?: boolean | undefined;
}>;
export declare function handleScreenshot(session: BrowserSession, params: z.infer<typeof screenshotSchema>): Promise<{
    content: {
        type: "image";
        data: string;
        mimeType: string;
    }[];
}>;
