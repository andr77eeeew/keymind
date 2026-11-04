/**
 * Latency probes for `scripts/latency-bench.mjs`. They exist only in a build made with
 * VITE_LATENCY_PROBE=1: `probe` is then a real object, and in every other build the constant
 * condition below lets the bundler remove this code entirely.
 */
export interface LatencyProbe {
  /** `timeStamp` is `event.timeStamp`, and the two others are `performance.now()` values. */
  key(timeStamp: number, handlerStart: number, handlerEnd: number): void;
}

interface ProbeData {
  queue: number[];
  handler: number[];
  frame: number[];
  eventTiming: number[];
  longTasks: number[];
}

function emptyData(): ProbeData {
  return { queue: [], handler: [], frame: [], eventTiming: [], longTasks: [] };
}

function createProbe(): LatencyProbe {
  let data = emptyData();

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "keydown") {
          data.eventTiming.push(entry.duration);
        }
      }
    }).observe({
      type: "event",
      durationThreshold: 16,
      buffered: false,
    } as PerformanceObserverInit);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        data.longTasks.push(entry.duration);
      }
    }).observe({ type: "longtask", buffered: false });
  } catch {
    // An engine without these entry types still gives the other figures.
  }

  const probe = {
    key(timeStamp: number, handlerStart: number, handlerEnd: number): void {
      data.queue.push(handlerStart - timeStamp);
      data.handler.push(handlerEnd - handlerStart);
      // The next frame callback runs just before the paint that shows this press.
      requestAnimationFrame(() => {
        data.frame.push(performance.now() - timeStamp);
      });
    },
    reset(): void {
      data = emptyData();
    },
    read(): ProbeData {
      return data;
    },
  };
  (window as unknown as { __keymindProbe: typeof probe }).__keymindProbe =
    probe;
  return probe;
}

export const probe: LatencyProbe | null = import.meta.env.VITE_LATENCY_PROBE
  ? createProbe()
  : null;
