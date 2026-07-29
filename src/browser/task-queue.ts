/**
 * Task Queue — Backpressure for concurrent session requests
 *
 * When the browser pool is full, incoming requests queue up
 * and drain as slots free up. Prevents hard errors under load.
 */

export interface TaskQueueOptions {
  concurrency: number; // Maximum granted slots
  maxSize: number;    // Max waiting in queue (default: 20)
  timeout: number;    // Max wait time in ms (default: 30000)
}

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class TaskQueue {
  private active = 0;
  private queue: Waiter[] = [];
  private concurrency: number;
  private maxSize: number;
  private timeout: number;

  constructor(options?: Partial<TaskQueueOptions>) {
    this.concurrency = options?.concurrency ?? 5;
    this.maxSize = options?.maxSize ?? 20;
    this.timeout = options?.timeout ?? 30000;
  }

  /**
   * Acquire a slot. Resolves when a slot is available.
   * Rejects if queue is full or timeout expires.
   */
  async acquire(): Promise<void> {
    // Fast path: slot available immediately
    if (this.active < this.concurrency) {
      this.active++;
      return;
    }

    // Queue is full
    if (this.queue.length >= this.maxSize) {
      throw new Error(`Task queue full (${this.maxSize} waiting)`);
    }

    // Wait for a slot
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex(w => w.resolve === resolve);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error(`Task queue timeout (${this.timeout}ms)`));
      }, this.timeout);

      this.queue.push({ resolve, reject, timer });
    });
  }

  /**
   * Release a slot. Triggers the next waiter in queue.
   */
  release(): void {
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
  stats(): { active: number; waiting: number; capacity: number; queueCapacity: number } {
    return {
      active: this.active,
      waiting: this.queue.length,
      capacity: this.concurrency,
      queueCapacity: this.maxSize,
    };
  }
}
