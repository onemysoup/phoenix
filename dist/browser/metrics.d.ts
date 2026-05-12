/**
 * Metrics — Observable concurrency stats
 *
 * Tracks active sessions, operation latency, error rates,
 * and pool utilization for monitoring and debugging.
 */
export interface MetricsSnapshot {
    activeSessions: number;
    totalSessions: number;
    totalOperations: number;
    totalErrors: number;
    errorRate: number;
    avgLatencyMs: number;
    poolUtilization: number;
    queueStats: {
        active: number;
        waiting: number;
        capacity: number;
    };
    uptime: number;
}
export declare class Metrics {
    private startTime;
    private _activeSessions;
    private _totalSessions;
    private _totalOperations;
    private _totalErrors;
    private _latencySum;
    private _latencyCount;
    sessionCreated(): void;
    sessionClosed(): void;
    operationComplete(durationMs: number, error?: boolean): void;
    snapshot(queueStats: {
        active: number;
        waiting: number;
        capacity: number;
    }): MetricsSnapshot;
}
