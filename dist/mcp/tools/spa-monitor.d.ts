import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const spaMonitorSchema: z.ZodObject<{
    action: z.ZodEnum<["start", "stop", "get_changes"]>;
}, "strip", z.ZodTypeAny, {
    action: "stop" | "start" | "get_changes";
}, {
    action: "stop" | "start" | "get_changes";
}>;
export declare function handleSpaMonitor(session: BrowserSession, params: z.infer<typeof spaMonitorSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
    isError?: undefined;
} | {
    content: {
        type: "text";
        text: string;
    }[];
    isError: boolean;
}>;
