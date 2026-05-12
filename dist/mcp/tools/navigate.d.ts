import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const navigateSchema: z.ZodObject<{
    url: z.ZodString;
    waitUntil: z.ZodDefault<z.ZodEnum<["load", "domcontentloaded", "networkidle"]>>;
}, "strip", z.ZodTypeAny, {
    waitUntil: "load" | "domcontentloaded" | "networkidle";
    url: string;
}, {
    url: string;
    waitUntil?: "load" | "domcontentloaded" | "networkidle" | undefined;
}>;
export declare function handleNavigate(session: BrowserSession, params: z.infer<typeof navigateSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
