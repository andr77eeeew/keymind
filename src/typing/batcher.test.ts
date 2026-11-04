import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Batcher } from "./batcher";

describe("Batcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(fail: () => boolean = () => false) {
    const sent: number[][] = [];
    const health: boolean[] = [];
    const batcher = new Batcher<number>(
      (events) => {
        if (fail()) {
          return Promise.reject(new Error("disk"));
        }
        sent.push(events);
        return Promise.resolve();
      },
      { onHealthChange: (healthy) => health.push(healthy) },
    );
    return { batcher, sent, health };
  }

  it("never sends inside push", () => {
    const { batcher, sent } = setup();
    for (let i = 0; i < 60; i += 1) {
      batcher.push(i);
    }
    expect(sent).toEqual([]);
  });

  it("sends after the interval", async () => {
    const { batcher, sent } = setup();
    batcher.push(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([[1]]);
  });

  it("sends early when the batch is full", async () => {
    const { batcher, sent } = setup();
    for (let i = 0; i < 50; i += 1) {
      batcher.push(i);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(sent[0]).toHaveLength(50);
  });

  it("keeps order and retries a failed batch with growing pauses", async () => {
    let failing = true;
    const { batcher, sent, health } = setup(() => failing);
    batcher.push(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual([]);
    expect(health).toEqual([false]);
    expect(batcher.pending).toBe(1);

    batcher.push(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(batcher.pending).toBe(2);

    failing = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toEqual([[1, 2]]);
    expect(health).toEqual([false, true]);
    expect(batcher.pending).toBe(0);
  });

  it("keeps one batch in flight at a time", async () => {
    const release: Array<() => void> = [];
    const calls: number[][] = [];
    const batcher = new Batcher<number>((events) => {
      calls.push(events);
      return new Promise((resolve) => release.push(resolve));
    });
    batcher.push(1);
    await vi.advanceTimersByTimeAsync(1000);
    batcher.push(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual([[1]]);
    release[0]();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual([[1], [2]]);
    release[1]();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("drains everything and waits for it", async () => {
    const { batcher, sent } = setup();
    batcher.push(1);
    batcher.push(2);
    await batcher.drain();
    expect(sent).toEqual([[1, 2]]);
  });

  it("drain rejects on failure and keeps the events", async () => {
    const { batcher } = setup(() => true);
    batcher.push(1);
    await expect(batcher.drain()).rejects.toThrow();
    expect(batcher.pending).toBe(1);
  });
});
