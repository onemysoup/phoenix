import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const infiniteScrollSchema: z.ZodObject<{
    contentSelector: z.ZodOptional<z.ZodString>;
    maxScrolls: z.ZodDefault<z.ZodNumber>;
    scrollDelay: z.ZodDefault<z.ZodNumber>;
    stableRounds: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    maxScrolls: number;
    scrollDelay: number;
    stableRounds: number;
    contentSelector?: string | undefined;
}, {
    contentSelector?: string | undefined;
    maxScrolls?: number | undefined;
    scrollDelay?: number | undefined;
    stableRounds?: number | undefined;
}>;
export declare function handleInfiniteScroll(session: BrowserSession, params: z.infer<typeof infiniteScrollSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
