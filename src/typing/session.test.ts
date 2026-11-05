import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageKind } from "./messages";
import {
  TypingSession,
  type LiveStats,
  type PauseReason,
  type SessionEventLike,
} from "./session";
import type {
  JournalEvent,
  KeystrokeEvent,
  SessionEnded,
  SessionPlan,
  Settings,
} from "./types";

const SETTINGS: Settings = {
  on_error: "continue",
  backspace: "allowed",
  theme: "light",
  live_figures: true,
  theme_chosen: false,
};

const WORDS_PLAN: SessionPlan = {
  mode: "words",
  text: "ab",
  source: { kind: "words", seed: 1, pool: 1000, count: 1 },
  detail: "",
};

function key(
  keyName: string,
  timeStamp: number,
  overrides: Partial<SessionEventLike> = {},
): SessionEventLike & { prevented: boolean } {
  const event = {
    code: `Key${keyName.toUpperCase()}`,
    key: keyName,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    timeStamp,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
    ...overrides,
  };
  return event;
}

function setup(plan: SessionPlan = WORDS_PLAN, settings: Settings = SETTINGS) {
  const events: JournalEvent[] = [];
  const hints: Array<MessageKind | null> = [];
  const live: LiveStats[] = [];
  const pauses: PauseReason[] = [];
  const ended: Array<[string | null, string]> = [];
  const saved: boolean[] = [];
  let paused = 0;
  let clock = 1000;
  const session = new TypingSession({
    plan,
    settings,
    appVersion: "1.2.3",
    send: (batch) => {
      events.push(...batch);
      return Promise.resolve();
    },
    callbacks: {
      live: (stats) => live.push(stats),
      message: (kind) => hints.push(kind),
      paused: (reason) => {
        paused += 1;
        pauses.push(reason);
      },
      ended: (sid, reason, wasSaved) => {
        ended.push([sid, reason]);
        saved.push(wasSaved);
      },
    },
    now: () => clock,
    newId: () => "sid-1",
    wallClock: () => "2026-11-04T12:00:00+02:00",
  });
  const moved: number[] = [];
  const zen = { text: "" };
  session.attachView(
    plan.mode === "zen"
      ? {
          append: (c: string) => {
            zen.text += c;
          },
          backspace: () => {
            if (zen.text.length === 0) return false;
            zen.text = zen.text.slice(0, -1);
            return true;
          },
          dispose: () => {},
        }
      : {
          moveCursor: (cursor: number) => moved.push(cursor),
          dispose: () => {},
        },
  );
  return {
    session,
    events,
    hints,
    live,
    pauses,
    saved,
    ended,
    moved,
    zen,
    pausedCount: () => paused,
    setClock: (value: number) => {
      clock = value;
    },
  };
}

function strokes(events: JournalEvent[]): KeystrokeEvent[] {
  return events.filter((e): e is KeystrokeEvent => e.type === "keystroke");
}

describe("TypingSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes nothing until the first character", async () => {
    const { session, events, ended } = setup();
    session.handleKeyDown(key("Shift", 10, { code: "ShiftLeft" }));
    session.handleKeyDown(key("Backspace", 20, { code: "Backspace" }));
    await session.finish("aborted");
    expect(events).toEqual([]);
    expect(ended).toEqual([[null, "aborted"]]);
  });

  it("starts the clock at the first character and journals the session", async () => {
    const { session, events, ended, moved } = setup();
    session.handleKeyDown(key("a", 500));
    session.handleKeyDown(key("x", 750.1234));
    await vi.advanceTimersByTimeAsync(0);

    expect(ended).toEqual([["sid-1", "completed"]]);
    expect(moved).toEqual([1, 2]);
    expect(events.map((e) => [e.type, e.seq])).toEqual([
      ["session_started", 1],
      ["keystroke", 2],
      ["keystroke", 3],
      ["session_ended", 4],
    ]);
    expect(events[0]).toMatchObject({
      sid: "sid-1",
      mode: "words",
      layout: "en-qwerty",
      app: "1.2.3",
      ts: "2026-11-04T12:00:00+02:00",
      settings: SETTINGS,
    });
    expect(strokes(events)).toEqual([
      expect.objectContaining({
        t: 0,
        kind: "char",
        code: "KeyA",
        key: "a",
        expected: "a",
        correct: true,
        pos: 0,
      }),
      expect.objectContaining({
        t: 250.123,
        key: "x",
        expected: "b",
        correct: false,
        pos: 1,
      }),
    ]);
    const end = events[3] as SessionEnded;
    expect(end).toMatchObject({
      t: 250.123,
      reason: "completed",
      duration: 250.123,
    });
  });

  it("prevents the default of typing keys so Space never scrolls", () => {
    const { session } = setup();
    const space = key(" ", 1, { code: "Space" });
    session.handleKeyDown(space);
    expect(space.prevented).toBe(true);
  });

  it("records held modifiers with a press", async () => {
    const { session, events } = setup();
    session.handleKeyDown(key("Shift", 1, { code: "ShiftLeft" }));
    session.handleKeyDown(key("A", 2, { code: "KeyA" }));
    session.handleKeyDown(key("Shift", 3, { code: "ShiftRight" }));
    session.handleKeyUp({ code: "ShiftLeft" });
    session.handleKeyUp({ code: "ShiftRight" });
    await session.finish("aborted");
    const list = strokes(events);
    expect(list[0]).toMatchObject({ kind: "char", mods: ["ShiftLeft"] });
    expect(list[1]).toMatchObject({ kind: "modifier", mods: ["ShiftLeft"] });
    expect(list[1].code).toBe("ShiftRight");
  });

  it("does not start on the wrong layout and hints instead", async () => {
    const { session, events, hints } = setup();
    session.handleKeyDown(key("ф", 1, { code: "KeyA" }));
    await session.finish("aborted");
    expect(events).toEqual([]);
    expect(hints).toEqual(["layout"]);
  });

  it("journals a layout press during a session without moving the text", async () => {
    const { session, events, hints, moved } = setup();
    session.handleKeyDown(key("a", 1));
    session.handleKeyDown(key("ф", 2, { code: "KeyS" }));
    expect(moved).toEqual([1]);
    expect(hints).toEqual(["layout"]);
    session.handleKeyDown(key("b", 3));
    expect(hints).toEqual(["layout", null]);
    await vi.advanceTimersByTimeAsync(0);
    expect(strokes(events)[1]).toMatchObject({ ignored: "layout", key: "ф" });
    expect(strokes(events)[1].correct).toBeUndefined();
  });

  it("logs a blocked Backspace without changing anything", async () => {
    const { session, events, moved } = setup(WORDS_PLAN, {
      ...SETTINGS,
      backspace: "blocked",
    });
    session.handleKeyDown(key("a", 1));
    session.handleKeyDown(key("Backspace", 2, { code: "Backspace" }));
    expect(session.engine.cursor).toBe(1);
    expect(moved).toEqual([1]);
    await session.finish("aborted");
    expect(strokes(events)[1]).toMatchObject({
      kind: "backspace",
      ignored: "policy",
    });
  });

  it("applies Backspace when allowed", async () => {
    const { session, events, moved } = setup();
    session.handleKeyDown(key("a", 1));
    session.handleKeyDown(key("Backspace", 2, { code: "Backspace" }));
    expect(session.engine.cursor).toBe(0);
    expect(moved).toEqual([1, 0]);
    await session.finish("aborted");
    expect(strokes(events)[1]).toMatchObject({ kind: "backspace", pos: 0 });
  });

  it("hints when Caps Lock is on", () => {
    const { session, hints } = setup();
    session.handleKeyDown(
      key("A", 1, {
        code: "KeyA",
        getModifierState: (name) => name === "CapsLock",
      }),
    );
    expect(hints).toEqual(["caps"]);
  });

  it("watches Caps Lock on the release too", () => {
    const { session, hints } = setup();
    session.handleKeyDown(
      key("a", 1, { getModifierState: (name) => name === "CapsLock" }),
    );
    session.handleKeyUp({ code: "CapsLock", getModifierState: () => false });
    expect(hints).toEqual(["caps", null]);
  });

  it("waits a moment before it says a stop-mode session stopped", () => {
    const { session, hints } = setup(WORDS_PLAN, {
      ...SETTINGS,
      on_error: "stop",
    });
    session.handleKeyDown(key("x", 1));
    vi.advanceTimersByTime(500);
    expect(hints).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(hints).toEqual(["stop"]);
    session.handleKeyDown(key("a", 700));
    expect(hints).toEqual(["stop", null]);
  });

  it("says nothing when the right key comes in time", () => {
    const { session, hints } = setup(WORDS_PLAN, {
      ...SETTINGS,
      on_error: "stop",
    });
    session.handleKeyDown(key("x", 1));
    session.handleKeyDown(key("a", 100));
    vi.advanceTimersByTime(1000);
    expect(hints).toEqual([]);
  });

  it("explains a blocked Backspace until the next key or a few seconds", () => {
    const { session, hints } = setup(
      { ...WORDS_PLAN, text: "abc" },
      { ...SETTINGS, backspace: "blocked" },
    );
    session.handleKeyDown(key("a", 1));
    session.handleKeyDown(key("Backspace", 2, { code: "Backspace" }));
    expect(hints).toEqual(["backspace"]);
    session.handleKeyDown(key("b", 3));
    expect(hints).toEqual(["backspace", null]);
    session.handleKeyDown(key("Backspace", 4, { code: "Backspace" }));
    vi.advanceTimersByTime(3000);
    expect(hints).toEqual(["backspace", null, "backspace", null]);
  });

  it("says when the clock of a timed session starts", () => {
    const { session, hints } = setup({ ...WORDS_PLAN, seconds: 60 });
    expect(hints).toEqual(["ready"]);
    session.handleKeyDown(key("a", 1));
    expect(hints).toEqual(["ready", null]);
  });

  it("reports whether the end of a session reached the disk", async () => {
    const hints: Array<MessageKind | null> = [];
    const saved: boolean[] = [];
    const session = new TypingSession({
      plan: WORDS_PLAN,
      settings: SETTINGS,
      appVersion: "1",
      send: () => Promise.reject(new Error("disk")),
      callbacks: {
        live: () => {},
        message: (kind) => hints.push(kind),
        paused: () => {},
        ended: (_sid, _reason, wasSaved) => saved.push(wasSaved),
      },
      newId: () => "sid",
    });
    session.handleKeyDown(key("a", 1));
    const done = session.finish("aborted");
    await vi.advanceTimersByTimeAsync(60000);
    await done;
    expect(hints).toContain("disk");
    expect(saved).toEqual([false]);
    session.dispose();
  });

  it("tells a pause by Esc from one by a lost focus", () => {
    const { session, pauses } = setup();
    session.handleKeyDown(key("a", 1));
    session.handleKeyDown(key("Escape", 2, { code: "Escape" }));
    session.resume();
    session.handleBlur();
    expect(pauses).toEqual(["esc", "blur"]);
  });

  it("reports progress through the text", () => {
    const { session, live } = setup({ ...WORDS_PLAN, text: "abcd" });
    session.handleKeyDown(key("a", 1));
    session.handleKeyDown(key("b", 2));
    vi.advanceTimersByTime(500);
    expect(live[live.length - 1]?.progress).toBe(0.5);
  });

  it("reports the time left as progress in a timed session", () => {
    const { session, live, setClock } = setup({ ...WORDS_PLAN, seconds: 10 });
    session.handleKeyDown(key("a", 1000));
    setClock(6000);
    vi.advanceTimersByTime(500);
    expect(live[live.length - 1]?.progress).toBeCloseTo(0.5, 5);
  });

  it("runs no live timer when nothing on the screen would change", () => {
    const { session, live } = setup(WORDS_PLAN, {
      ...SETTINGS,
      live_figures: false,
    });
    session.handleKeyDown(key("a", 1));
    vi.advanceTimersByTime(2000);
    expect(live).toEqual([]);
  });

  it("keeps the clock of a timed session with the figures off", () => {
    const { session, live } = setup(
      { ...WORDS_PLAN, seconds: 60 },
      { ...SETTINGS, live_figures: false },
    );
    session.handleKeyDown(key("a", 1));
    vi.advanceTimersByTime(500);
    expect(live.length).toBeGreaterThan(0);
  });

  it("runs no live timer in Zen", () => {
    const { session, live } = setup({
      mode: "zen",
      text: "",
      source: { kind: "zen" },
      detail: "",
    });
    session.handleKeyDown(key("a", 1));
    vi.advanceTimersByTime(2000);
    expect(live).toEqual([]);
  });

  it("makes Enter a new line in Zen and nothing elsewhere", async () => {
    const zen = setup({
      mode: "zen",
      text: "",
      source: { kind: "zen" },
      detail: "",
    });
    zen.session.handleKeyDown(key("a", 1));
    const enter = key("Enter", 2, { code: "Enter" });
    zen.session.handleKeyDown(enter);
    expect(enter.prevented).toBe(true);
    expect(zen.zen.text).toBe("a\n");
    await zen.session.finish("completed");
    expect(strokes(zen.events)[1]).toMatchObject({
      kind: "char",
      code: "Enter",
      key: "\n",
      pos: 1,
    });

    const words = setup();
    const other = key("Enter", 1, { code: "Enter" });
    words.session.handleKeyDown(other);
    expect(other.prevented).toBe(true);
    expect(words.session.started).toBe(false);
  });

  it("leaves the keyboard to the dialog while paused", async () => {
    const { session, events, pausedCount, setClock } = setup();
    session.handleKeyDown(key("a", 1000));
    setClock(1100);
    session.handleKeyDown(key("Escape", 1100, { code: "Escape" }));
    expect(pausedCount()).toBe(1);

    for (const k of [
      key(" ", 1200, { code: "Space" }),
      key("Enter", 1200, { code: "Enter" }),
    ]) {
      session.handleKeyDown(k);
      expect(k.prevented).toBe(false);
    }
    expect(session.engine.cursor).toBe(1);

    setClock(3100);
    session.resume();
    session.handleKeyDown(key("b", 3200));
    await vi.advanceTimersByTimeAsync(0);

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "session_started",
      "keystroke",
      "session_paused",
      "session_resumed",
      "keystroke",
      "session_ended",
    ]);
    expect(events[2]).toMatchObject({ t: 100 });
    expect(events[3]).toMatchObject({ t: 2100 });
    // 2200 ms from the first to the last press, of which 2000 were a pause.
    expect(events[5]).toMatchObject({ t: 2200, duration: 200 });
  });

  it("still blocks reload keys and a held Esc while paused", () => {
    const { session } = setup();
    session.handleKeyDown(key("Escape", 1, { code: "Escape" }));
    for (const k of [
      key("F5", 2, { code: "F5" }),
      key("r", 2, { ctrlKey: true }),
      key("Escape", 2, { code: "Escape", repeat: true }),
    ]) {
      session.handleKeyDown(k);
      expect(k.prevented).toBe(true);
    }
    const esc = key("Escape", 3, { code: "Escape" });
    session.handleKeyDown(esc);
    expect(esc.prevented).toBe(false);
  });

  it("pauses on blur only once a session runs", () => {
    const { session, pausedCount } = setup();
    session.handleBlur();
    expect(pausedCount()).toBe(0);
    session.handleKeyDown(key("a", 1));
    session.handleBlur();
    session.handleBlur();
    expect(pausedCount()).toBe(1);
  });

  it("forgets modifiers on blur, because the release may never arrive", async () => {
    const { session, events } = setup();
    session.handleKeyDown(key("Shift", 1, { code: "ShiftLeft" }));
    session.handleBlur();
    session.handleKeyDown(key("a", 2));
    await session.finish("aborted");
    expect(strokes(events)[0].mods).toBeUndefined();
  });

  it("ends a timed session at the limit, without counting pauses", async () => {
    const { session, events, ended, setClock } = setup({
      ...WORDS_PLAN,
      seconds: 1,
    });
    setClock(0);
    session.handleKeyDown(key("a", 0));
    setClock(900);
    await vi.advanceTimersByTimeAsync(100);
    expect(ended).toEqual([]);

    session.pause();
    setClock(5000);
    await vi.advanceTimersByTimeAsync(500);
    expect(ended).toEqual([]);
    session.resume();

    setClock(5100);
    await vi.advanceTimersByTimeAsync(100);
    expect(ended).toEqual([["sid-1", "completed"]]);
    expect(events[events.length - 1].type).toBe("session_ended");
  });

  it("reports nothing twice when finished twice", async () => {
    const { session, ended } = setup();
    session.handleKeyDown(key("a", 1));
    await session.finish("aborted");
    await session.finish("completed");
    expect(ended).toEqual([["sid-1", "aborted"]]);
  });

  it("types freely in Zen, with no expected character", async () => {
    const { session, events, zen } = setup({
      mode: "zen",
      text: "",
      source: { kind: "zen" },
      detail: "",
    });
    session.handleKeyDown(key("h", 1));
    session.handleKeyDown(key("i", 2));
    session.handleKeyDown(key("Backspace", 3, { code: "Backspace" }));
    session.handleKeyDown(key("o", 4));
    expect(zen.text).toBe("ho");
    await session.finish("completed");

    const list = strokes(events);
    expect(list.map((s) => s.pos)).toEqual([0, 1, 1, 1]);
    expect(list[0].expected).toBeUndefined();
    expect(list[0].correct).toBeUndefined();
    expect(events[0]).toMatchObject({ mode: "zen", source: { kind: "zen" } });
  });

  it("allows Backspace in Zen even when it is blocked elsewhere", () => {
    const { session, zen } = setup(
      { mode: "zen", text: "", source: { kind: "zen" }, detail: "" },
      { ...SETTINGS, backspace: "blocked" },
    );
    session.handleKeyDown(key("h", 1));
    session.handleKeyDown(key("Backspace", 2, { code: "Backspace" }));
    expect(zen.text).toBe("");
  });
});
