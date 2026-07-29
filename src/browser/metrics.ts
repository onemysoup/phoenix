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
  p95LatencyMs: number;
  maxLatencyMs: number;
  poolUtilization: number;
  queueStats: { active: number; waiting: number; capacity: number; queueCapacity: number };
  uptime: number;
}

export class Metrics {
  private startTime = Date.now();
  private _activeSessions = 0;
  private _totalSessions = 0;
  private _totalOperations = 0;
  private _totalErrors = 0;
  private _latencySum = 0;
  private _latencyCount = 0;
  private readonly latencySamples: number[] = [];
  private readonly maxLatencySamples = 1_000;

  sessionCreated(): void {
    this._activeSessions++;
    this._totalSessions++;
  }

  sessionClosed(): void {
    this._activeSessions = Math.max(0, this._activeSessions - 1);
  }

  operationComplete(durationMs: number, error = false): void {
    this._totalOperations++;
    this._latencySum += durationMs;
    this._latencyCount++;
    this.latencySamples.push(durationMs);
    if (this.latencySamples.length > this.maxLatencySamples) this.latencySamples.shift();
    if (error) this._totalErrors++;
  }

  snapshot(queueStats: { active: number; waiting: number; capacity: number; queueCapacity: number }): MetricsSnapshot {
    const avgLatency = this._latencyCount > 0 ? this._latencySum / this._latencyCount : 0;
    const errorRate = this._totalOperations > 0 ? this._totalErrors / this._totalOperations : 0;
    const poolUtilization = queueStats.capacity > 0 ? queueStats.active / queueStats.capacity : 0;
    const sortedLatency = [...this.latencySamples].sort((a, b) => a - b);
    const p95Index = sortedLatency.length > 0 ? Math.ceil(sortedLatency.length * 0.95) - 1 : 0;

    return {
      activeSessions: this._activeSessions,
      totalSessions: this._totalSessions,
      totalOperations: this._totalOperations,
      totalErrors: this._totalErrors,
      errorRate: Math.round(errorRate * 100) / 100,
      avgLatencyMs: Math.round(avgLatency),
      p95LatencyMs: Math.round(sortedLatency[p95Index] ?? 0),
      maxLatencyMs: Math.round(sortedLatency.at(-1) ?? 0),
      poolUtilization: Math.round(poolUtilization * 100) / 100,
      queueStats,
      uptime: Math.round((Date.now() - this.startTime) / 1000),
    };
  }
}
