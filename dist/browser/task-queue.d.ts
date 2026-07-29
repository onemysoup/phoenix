/**
 * Task Queue — Backpressure for concurrent session requests
 *
 * When the browser pool is full, incoming requests queue up
 * and drain as slots free up. Prevents hard errors under load.
 */
export interface TaskQueueOptions {
    concurrency: number;
    maxSize: number;
    timeout: number;
}
export declare class TaskQueue {
    private active;
    private queue;
    private concurrency;
    private maxSize;
    private timeout;
    constructor(options?: Partial<TaskQueueOptions>);
    /**
     * Acquire a slot. Resolves when a slot is available.
     * Rejects if queue is full or timeout expires.
     */
    acquire(): Promise<void>;
    /**
     * Release a slot. Triggers the next waiter in queue.
     */
    release(): void;
    /**
     * Current queue stats.
     */
    stats(): {
        active: number;
        waiting: number;
        capacity: number;
        queueCapacity: number;
    };
}
