class LLMMetrics {
    requests = 0;
    successes = 0;
    failures = 0;
    retries = 0;
    rateLimited = 0;
    latencySum = 0;
    circuitOpen = false;
    request() { this.requests++; }
    retry() { this.retries++; }
    rateLimit() { this.rateLimited++; }
    complete(durationMs, success) {
        this.latencySum += durationMs;
        if (success)
            this.successes++;
        else
            this.failures++;
    }
    setCircuitOpen(open) { this.circuitOpen = open; }
    snapshot() {
        return {
            requests: this.requests, successes: this.successes, failures: this.failures,
            retries: this.retries, rateLimited: this.rateLimited, circuitOpen: this.circuitOpen,
            avgLatencyMs: this.requests ? Math.round(this.latencySum / this.requests) : 0,
        };
    }
}
export const llmMetrics = new LLMMetrics();
//# sourceMappingURL=llm-metrics.js.map