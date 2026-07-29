/**
 * self_healing_run — MCP Tool
 *
 * Execute a browser operation with automatic self-healing.
 * This is the core Phase 3 tool that wraps any browser action
 * in the execute → fail → diagnose → heal → retry loop.
 */
import { z } from "zod";
import { BrowserSession } from "../../browser/context.js";
export declare const selfHealingRunSchema: z.ZodObject<{
    action: z.ZodEnum<["navigate", "click", "type", "extract", "wait_for"]>;
    url: z.ZodOptional<z.ZodString>;
    selector: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    intent: z.ZodOptional<z.ZodString>;
    waitCondition: z.ZodDefault<z.ZodEnum<["visible", "hidden", "stable"]>>;
    maxRetries: z.ZodDefault<z.ZodNumber>;
    useLLM: z.ZodDefault<z.ZodBoolean>;
    expectedUrl: z.ZodOptional<z.ZodString>;
    expectedSelector: z.ZodOptional<z.ZodString>;
    expectedText: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "type" | "click" | "navigate" | "extract" | "wait_for";
    waitCondition: "visible" | "hidden" | "stable";
    maxRetries: number;
    useLLM: boolean;
    url?: string | undefined;
    text?: string | undefined;
    selector?: string | undefined;
    intent?: string | undefined;
    expectedUrl?: string | undefined;
    expectedSelector?: string | undefined;
    expectedText?: string | undefined;
}, {
    action: "type" | "click" | "navigate" | "extract" | "wait_for";
    url?: string | undefined;
    text?: string | undefined;
    selector?: string | undefined;
    intent?: string | undefined;
    waitCondition?: "visible" | "hidden" | "stable" | undefined;
    maxRetries?: number | undefined;
    useLLM?: boolean | undefined;
    expectedUrl?: string | undefined;
    expectedSelector?: string | undefined;
    expectedText?: string | undefined;
}>;
export declare function handleSelfHealingRun(session: BrowserSession, params: z.infer<typeof selfHealingRunSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
