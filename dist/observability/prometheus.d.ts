import type { MetricsSnapshot } from "../browser/metrics.js";
import type { LLMMetricsSnapshot } from "./llm-metrics.js";
export declare function renderPrometheusMetrics(pool: MetricsSnapshot, llm: LLMMetricsSnapshot): string;
