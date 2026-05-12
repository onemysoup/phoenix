import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const waitSchema: z.ZodObject<{
    condition: z.ZodEnum<["selector", "networkidle", "load", "timeout"]>;
    selector: z.ZodOptional<z.ZodString>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    timeout: number;
    condition: "timeout" | "load" | "networkidle" | "selector";
    selector?: string | undefined;
}, {
    condition: "timeout" | "load" | "networkidle" | "selector";
    timeout?: number | undefined;
    selector?: string | undefined;
}>;
export declare function handleWait(session: BrowserSession, params: z.infer<typeof waitSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
