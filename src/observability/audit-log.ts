export interface AuditEvent {
  timestamp: number;
  sessionId: string;
  operation: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

/** Bounded in-memory audit trail for local MCP deployments. */
export class AuditLog {
  private readonly events: AuditEvent[] = [];

  constructor(private readonly maxEvents = 500) {}

  record(event: AuditEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
  }

  recent(limit = 100, sessionId?: string): AuditEvent[] {
    const bounded = Math.max(1, Math.min(limit, this.maxEvents));
    const events = sessionId ? this.events.filter((event) => event.sessionId === sessionId) : this.events;
    return events.slice(-bounded);
  }
}
