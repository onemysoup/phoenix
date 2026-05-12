import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const smartWaitSchema: z.ZodObject<{
    mode: z.ZodEnum<["dom_stable", "condition", "element_count"]>;
    selector: z.ZodOptional<z.ZodString>;
    expression: z.ZodOptional<z.ZodString>;
    stableMs: z.ZodDefault<z.ZodNumber>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    timeout: number;
    mode: "condition" | "dom_stable" | "element_count";
    stableMs: number;
    selector?: string | undefined;
    expression?: string | undefined;
}, {
    mode: "condition" | "dom_stable" | "element_count";
    timeout?: number | undefined;
    selector?: string | undefined;
    expression?: string | undefined;
    stableMs?: number | undefined;
}>;
export declare function handleSmartWait(session: BrowserSession, params: z.infer<typeof smartWaitSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
