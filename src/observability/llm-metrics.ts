export interface LLMMetricsSnapshot {
  requests: number;
  successes: number;
  failures: number;
  retries: number;
  rateLimited: number;
  circuitOpen: boolean;
  avgLatencyMs: number;
}

class LLMMetrics {
  private requests = 0;
  private successes = 0;
  private failures = 0;
  private retries = 0;
  private rateLimited = 0;
  private latencySum = 0;
  private circuitOpen = false;

  request(): void { this.requests++; }
  retry(): void { this.retries++; }
  rateLimit(): void { this.rateLimited++; }
  complete(durationMs: number, success: boolean): void {
    this.latencySum += durationMs;
    if (success) this.successes++; else this.failures++;
  }
  setCircuitOpen(open: boolean): void { this.circuitOpen = open; }
  snapshot(): LLMMetricsSnapshot {
    return {
      requests: this.requests, successes: this.successes, failures: this.failures,
      retries: this.retries, rateLimited: this.rateLimited, circuitOpen: this.circuitOpen,
      avgLatencyMs: this.requests ? Math.round(this.latencySum / this.requests) : 0,
    };
  }
}

export const llmMetrics = new LLMMetrics();
