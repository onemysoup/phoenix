export function renderPrometheusMetrics(pool, llm) {
    const lines = [
        "# HELP phoenix_browser_active_sessions Active browser sessions.",
        "# TYPE phoenix_browser_active_sessions gauge",
        `phoenix_browser_active_sessions ${pool.activeSessions}`,
        "# TYPE phoenix_browser_pool_utilization ratio",
        `phoenix_browser_pool_utilization ${pool.poolUtilization}`,
        "# TYPE phoenix_browser_queue_waiting gauge",
        `phoenix_browser_queue_waiting ${pool.queueStats.waiting}`,
        "# TYPE phoenix_mcp_operations_total counter",
        `phoenix_mcp_operations_total ${pool.totalOperations}`,
        "# TYPE phoenix_mcp_errors_total counter",
        `phoenix_mcp_errors_total ${pool.totalErrors}`,
        "# TYPE phoenix_mcp_latency_p95_ms gauge",
        `phoenix_mcp_latency_p95_ms ${pool.p95LatencyMs}`,
        "# TYPE phoenix_llm_requests_total counter",
        `phoenix_llm_requests_total ${llm.requests}`,
        "# TYPE phoenix_llm_successes_total counter",
        `phoenix_llm_successes_total ${llm.successes}`,
        "# TYPE phoenix_llm_failures_total counter",
        `phoenix_llm_failures_total ${llm.failures}`,
        "# TYPE phoenix_llm_retries_total counter",
        `phoenix_llm_retries_total ${llm.retries}`,
        "# TYPE phoenix_llm_rate_limited_total counter",
        `phoenix_llm_rate_limited_total ${llm.rateLimited}`,
        "# TYPE phoenix_llm_circuit_open gauge",
        `phoenix_llm_circuit_open ${llm.circuitOpen ? 1 : 0}`,
        "# TYPE phoenix_llm_avg_latency_ms gauge",
        `phoenix_llm_avg_latency_ms ${llm.avgLatencyMs}`,
    ];
    return `${lines.join("\n")}\n`;
}
//# sourceMappingURL=prometheus.js.map