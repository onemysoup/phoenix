export interface LLMMetricsSnapshot {
    requests: number;
    successes: number;
    failures: number;
    retries: number;
    rateLimited: number;
    circuitOpen: boolean;
    avgLatencyMs: number;
}
declare class LLMMetrics {
    private requests;
    private successes;
    private failures;
    private retries;
    private rateLimited;
    private latencySum;
    private circuitOpen;
    request(): void;
    retry(): void;
    rateLimit(): void;
    complete(durationMs: number, success: boolean): void;
    setCircuitOpen(open: boolean): void;
    snapshot(): LLMMetricsSnapshot;
}
export declare const llmMetrics: LLMMetrics;
export {};
