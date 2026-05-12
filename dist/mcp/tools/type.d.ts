import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const typeSchema: z.ZodObject<{
    selector: z.ZodString;
    text: z.ZodString;
    submit: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    text: string;
    selector: string;
    submit: boolean;
}, {
    text: string;
    selector: string;
    submit?: boolean | undefined;
}>;
export declare function handleType(session: BrowserSession, params: z.infer<typeof typeSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
