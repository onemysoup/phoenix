import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const scrollSchema: z.ZodObject<{
    direction: z.ZodDefault<z.ZodEnum<["down", "up", "toBottom"]>>;
    pixels: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    direction: "down" | "up" | "toBottom";
    pixels: number;
}, {
    direction?: "down" | "up" | "toBottom" | undefined;
    pixels?: number | undefined;
}>;
export declare function handleScroll(session: BrowserSession, params: z.infer<typeof scrollSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
