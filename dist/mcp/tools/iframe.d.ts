import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const switchFrameSchema: z.ZodObject<{
    action: z.ZodEnum<["into", "back", "list"]>;
    selector: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "into" | "back" | "list";
    selector?: string | undefined;
}, {
    action: "into" | "back" | "list";
    selector?: string | undefined;
}>;
export declare function handleSwitchFrame(session: BrowserSession, params: z.infer<typeof switchFrameSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
