import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const clickSchema: z.ZodObject<{
    selector: z.ZodString;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    timeout: number;
    selector: string;
}, {
    selector: string;
    timeout?: number | undefined;
}>;
export declare function handleClick(session: BrowserSession, params: z.infer<typeof clickSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
