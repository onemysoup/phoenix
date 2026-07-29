export interface AuditEvent {
    timestamp: number;
    sessionId: string;
    operation: string;
    durationMs: number;
    success: boolean;
    error?: string;
}
/** Bounded in-memory audit trail for local MCP deployments. */
export declare class AuditLog {
    private readonly maxEvents;
    private readonly events;
    constructor(maxEvents?: number);
    record(event: AuditEvent): void;
    recent(limit?: number, sessionId?: string): AuditEvent[];
}
