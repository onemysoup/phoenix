/**
 * Task Queue — Backpressure for concurrent session requests
 *
 * When the browser pool is full, incoming requests queue up
 * and drain as slots free up. Prevents hard errors under load.
 */
export class TaskQueue {
    active = 0;
    queue = [];
    maxSize;
    timeout;
    constructor(options) {
        this.maxSize = options?.maxSize ?? 20;
        this.timeout = options?.timeout ?? 30000;
    }
    /**
     * Acquire a slot. Resolves when a slot is available.
     * Rejects if queue is full or timeout expires.
     */
    async acquire() {
        // Fast path: slot available immediately
        if (this.active < this.maxSize) {
            this.active++;
            return;
        }
        // Queue is full
        if (this.queue.length >= this.maxSize) {
            throw new Error(`Task queue full (${this.maxSize} waiting)`);
        }
        // Wait for a slot
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const idx = this.queue.findIndex(w => w.resolve === resolve);
                if (idx !== -1)
                    this.queue.splice(idx, 1);
                reject(new Error(`Task queue timeout (${this.timeout}ms)`));
            }, this.timeout);
            this.queue.push({ resolve, reject, timer });
        });
    }
    /**
     * Release a slot. Triggers the next waiter in queue.
     */
    release() {
        this.active = Math.max(0, this.active - 1);
        const next = this.queue.shift();
        if (next) {
            clearTimeout(next.timer);
            this.active++;
            next.resolve();
        }
    }
    /**
     * Current queue stats.
     */
    stats() {
        return {
            active: this.active,
            waiting: this.queue.length,
            capacity: this.maxSize,
        };
    }
}
//# sourceMappingURL=task-queue.js.map