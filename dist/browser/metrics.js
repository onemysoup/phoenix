/**
 * Metrics — Observable concurrency stats
 *
 * Tracks active sessions, operation latency, error rates,
 * and pool utilization for monitoring and debugging.
 */
export class Metrics {
    startTime = Date.now();
    _activeSessions = 0;
    _totalSessions = 0;
    _totalOperations = 0;
    _totalErrors = 0;
    _latencySum = 0;
    _latencyCount = 0;
    sessionCreated() {
        this._activeSessions++;
        this._totalSessions++;
    }
    sessionClosed() {
        this._activeSessions = Math.max(0, this._activeSessions - 1);
    }
    operationComplete(durationMs, error = false) {
        this._totalOperations++;
        this._latencySum += durationMs;
        this._latencyCount++;
        if (error)
            this._totalErrors++;
    }
    snapshot(queueStats) {
        const avgLatency = this._latencyCount > 0 ? this._latencySum / this._latencyCount : 0;
        const errorRate = this._totalOperations > 0 ? this._totalErrors / this._totalOperations : 0;
        const poolUtilization = queueStats.capacity > 0 ? queueStats.active / queueStats.capacity : 0;
        return {
            activeSessions: this._activeSessions,
            totalSessions: this._totalSessions,
            totalOperations: this._totalOperations,
            totalErrors: this._totalErrors,
            errorRate: Math.round(errorRate * 100) / 100,
            avgLatencyMs: Math.round(avgLatency),
            poolUtilization: Math.round(poolUtilization * 100) / 100,
            queueStats,
            uptime: Math.round((Date.now() - this.startTime) / 1000),
        };
    }
}
//# sourceMappingURL=metrics.js.map