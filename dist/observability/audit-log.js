/** Bounded in-memory audit trail for local MCP deployments. */
export class AuditLog {
    maxEvents;
    events = [];
    constructor(maxEvents = 500) {
        this.maxEvents = maxEvents;
    }
    record(event) {
        this.events.push(event);
        if (this.events.length > this.maxEvents)
            this.events.splice(0, this.events.length - this.maxEvents);
    }
    recent(limit = 100, sessionId) {
        const bounded = Math.max(1, Math.min(limit, this.maxEvents));
        const events = sessionId ? this.events.filter((event) => event.sessionId === sessionId) : this.events;
        return events.slice(-bounded);
    }
}
//# sourceMappingURL=audit-log.js.map