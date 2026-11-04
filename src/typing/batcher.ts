export type SendBatch<T> = (events: T[]) => Promise<void>;

export interface BatcherOptions {
  maxEvents?: number;
  intervalMs?: number;
  maxBackoffMs?: number;
  /** Called when writing starts to fail and when it recovers. */
  onHealthChange?: (healthy: boolean) => void;
}

/**
 * Collects events and sends them in batches. `push` only appends to an array, so it is safe on the
 * input path: sending always happens later, in its own task.
 *
 * A failed batch stays at the front of the queue and is retried. If a write fails after it reached
 * the disk, the retry leaves a repeat that the reader drops by `(sid, seq)`, so nothing is lost and
 * nothing counts twice.
 */
export class Batcher<T> {
  private queue: T[] = [];
  private inFlight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private readonly send: SendBatch<T>;
  private readonly maxEvents: number;
  private readonly intervalMs: number;
  private readonly maxBackoffMs: number;
  private readonly onHealthChange?: (healthy: boolean) => void;

  constructor(send: SendBatch<T>, options: BatcherOptions = {}) {
    this.send = send;
    this.maxEvents = options.maxEvents ?? 50;
    this.intervalMs = options.intervalMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 8000;
    this.onHealthChange = options.onHealthChange;
  }

  get pending(): number {
    return this.queue.length;
  }

  push(event: T): void {
    this.queue.push(event);
    if (this.failures > 0) {
      return; // The retry timer is already running, and it sends everything.
    }
    if (this.queue.length >= this.maxEvents) {
      this.schedule(0);
    } else if (this.timer === null) {
      this.schedule(this.intervalMs);
    }
  }

  /** Sends now, in a later task. For blur and pause, where nobody waits for the result. */
  flushSoon(): void {
    if (this.queue.length > 0 && this.failures === 0) {
      this.schedule(0);
    }
  }

  /** Sends everything and waits. Rejects if the disk still refuses, leaving the events queued. */
  async drain(): Promise<void> {
    this.cancelTimer();
    while (this.inFlight) {
      await this.inFlight;
    }
    while (this.queue.length > 0) {
      const before = this.failures;
      await this.sendNext();
      if (this.failures > before) {
        throw new Error("the journal could not be written");
      }
    }
  }

  private schedule(delay: number): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sendNext();
    }, delay);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private sendNext(): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.queue.length === 0) {
      return Promise.resolve();
    }
    const batch = this.queue;
    this.queue = [];
    const attempt = this.send(batch).then(
      () => this.onSent(),
      () => this.onFailed(batch),
    );
    this.inFlight = attempt.finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private onSent(): void {
    if (this.failures > 0) {
      this.failures = 0;
      this.onHealthChange?.(true);
    }
    if (this.queue.length >= this.maxEvents) {
      this.schedule(0);
    } else if (this.queue.length > 0 && this.timer === null) {
      this.schedule(this.intervalMs);
    }
  }

  private onFailed(batch: T[]): void {
    this.queue = batch.concat(this.queue);
    this.failures += 1;
    if (this.failures === 1) {
      this.onHealthChange?.(false);
    }
    const backoff = Math.min(
      this.intervalMs * 2 ** (this.failures - 1),
      this.maxBackoffMs,
    );
    this.schedule(backoff);
  }
}
