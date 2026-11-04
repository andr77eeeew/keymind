import { Batcher } from "./batcher";
import {
  classifyKey,
  HeldModifiers,
  isAppShortcut,
  type KeyInput,
} from "./classify";
import { TypingEngine } from "./engine";
import { probe } from "./probe";
import type { TextView } from "./renderer";
import {
  SCHEMA_VERSION,
  type EndReason,
  type JournalEvent,
  type KeystrokeEvent,
  type SessionPlan,
  type Settings,
} from "./types";

const LAYOUT = "en-qwerty";
const LIVE_INTERVAL_MS = 500;
const LIMIT_CHECK_MS = 100;

export interface SessionEventLike extends KeyInput {
  timeStamp: number;
  preventDefault(): void;
  getModifierState?(key: string): boolean;
}

export interface LiveStats {
  /** Seconds of active typing, or the seconds left in a timed session. */
  seconds: number;
  wpm: number;
  /** Percent, `null` before the first press and in Zen. */
  accuracy: number | null;
}

export type Hint = "layout" | "caps" | null;

export interface SessionCallbacks {
  live(stats: LiveStats): void;
  hint(hint: Hint): void;
  /** Writing to the disk failed or recovered. */
  health(healthy: boolean): void;
  /** Esc or a lost focus. The view shows the pause dialog. */
  paused(): void;
  /** The session is over. `sid` is null if no press was ever made. */
  ended(sid: string | null, reason: EndReason): void;
}

/** A view for free typing, where text only grows at the end. */
export interface ZenView {
  append(key: string): void;
  backspace(): boolean;
  dispose(): void;
}

export interface SessionDeps {
  plan: SessionPlan;
  settings: Settings;
  appVersion: string;
  send(events: JournalEvent[]): Promise<void>;
  callbacks: SessionCallbacks;
  now?(): number;
  newId?(): string;
  wallClock?(): string;
}

/**
 * Connects a key press to the engine, the view and the journal. All state here is plain data, and
 * Vue never runs on this path. The live figures are written by a timer, not by the press.
 */
export class TypingSession {
  readonly engine: TypingEngine;
  private view: TextView | ZenView | null = null;
  private readonly plan: SessionPlan;
  private readonly settings: Settings;
  private readonly appVersion: string;
  private readonly callbacks: SessionCallbacks;
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly wallClock: () => string;
  private readonly batcher: Batcher<JournalEvent>;
  private readonly held = new HeldModifiers();

  private sid: string | null = null;
  private seq = 0;
  private t0 = 0;
  private lastPressT = 0;
  private pausedBeforeLastPress = 0;
  private zenLength = 0;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private chars = 0;
  private correct = 0;
  private hintShown: Hint = null;
  private ended = false;
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private limitTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: SessionDeps) {
    this.plan = deps.plan;
    this.settings = deps.settings;
    this.appVersion = deps.appVersion;
    this.callbacks = deps.callbacks;
    this.now = deps.now ?? (() => performance.now());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.wallClock = deps.wallClock ?? localTimestamp;
    this.engine = new TypingEngine(deps.plan.text, deps.settings.on_error);
    this.batcher = new Batcher(deps.send, {
      onHealthChange: deps.callbacks.health,
    });
  }

  get isZen(): boolean {
    return this.plan.mode === "zen";
  }

  get started(): boolean {
    return this.sid !== null;
  }

  get isPaused(): boolean {
    return this.pausedAt !== null;
  }

  get sessionId(): string | null {
    return this.sid;
  }

  attachView(view: TextView | ZenView): void {
    this.view = view;
  }

  handleKeyDown(event: SessionEventLike): void {
    const handlerStart = probe ? performance.now() : 0;
    this.held.press(event.code);
    if (this.ended) {
      return;
    }
    if (this.isPaused) {
      // The dialog owns the keyboard, so Space and Enter must reach its buttons. A held Esc must
      // not close the dialog that its first press opened.
      if (isAppShortcut(event) || (event.repeat && event.key === "Escape")) {
        event.preventDefault();
      }
      return;
    }
    const decision = classifyKey(event);

    switch (decision.action) {
      case "char":
        event.preventDefault();
        this.onChar(event, decision.key);
        break;
      case "backspace":
        event.preventDefault();
        this.onBackspace(event);
        break;
      case "modifier":
        if (this.started) {
          this.push(this.keystrokeBase(event, "modifier"));
        }
        break;
      case "layout":
        event.preventDefault();
        this.showHint("layout");
        if (this.started) {
          this.push({
            ...this.keystrokeBase(event, "char"),
            key: decision.key,
            ignored: "layout",
          });
        }
        break;
      case "escape":
        event.preventDefault();
        this.pause();
        break;
      case "none":
        if (decision.block) {
          event.preventDefault();
        }
        break;
    }
    if (probe) {
      probe.key(event.timeStamp, handlerStart, performance.now());
    }
  }

  handleKeyUp(code: string): void {
    this.held.release(code);
  }

  /** A blur pauses a running session, because no typing happens while another window has focus. */
  handleBlur(): void {
    this.held.reset();
    if (this.started) {
      this.pause();
    }
  }

  pause(): void {
    if (this.ended || this.isPaused) {
      return;
    }
    const at = this.now();
    this.pausedAt = at;
    this.stopTimers();
    if (this.started) {
      this.push({
        v: SCHEMA_VERSION,
        type: "session_paused",
        sid: this.sid as string,
        seq: this.nextSeq(),
        t: this.time(at),
      });
      this.batcher.flushSoon();
    }
    this.callbacks.paused();
  }

  resume(): void {
    if (this.ended || this.pausedAt === null) {
      return;
    }
    const at = this.now();
    this.pausedTotal += at - this.pausedAt;
    this.pausedAt = null;
    if (this.started) {
      this.push({
        v: SCHEMA_VERSION,
        type: "session_resumed",
        sid: this.sid as string,
        seq: this.nextSeq(),
        t: this.time(at),
      });
      this.startTimers();
    }
  }

  /** Ends the session and waits until every event is on disk. */
  async finish(reason: EndReason): Promise<void> {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.stopTimers();
    if (this.started) {
      this.push({
        v: SCHEMA_VERSION,
        type: "session_ended",
        sid: this.sid as string,
        seq: this.nextSeq(),
        t: this.lastPressT,
        reason,
        duration: this.activeUntilLastPress(),
      });
    }
    try {
      await this.batcher.drain();
    } catch {
      // The health callback has told the user. The batcher keeps retrying in the background.
    }
    this.callbacks.ended(this.sid, reason);
  }

  /** Stops timers and the view. `finish` must have run if anything was typed. */
  dispose(): void {
    this.stopTimers();
    this.view?.dispose();
    this.view = null;
  }

  private onChar(event: SessionEventLike, key: string): void {
    if (this.sid === null) {
      this.begin(event);
    }
    this.showHint(event.getModifierState?.("CapsLock") ? "caps" : null);

    const base = this.keystrokeBase(event, "char");
    this.notePress(base.t);
    this.chars += 1;

    if (this.isZen) {
      (this.view as ZenView | null)?.append(key);
      this.correct += 1;
      this.push({ ...base, key, pos: this.zenLength });
      this.zenLength += 1;
      return;
    }

    const result = this.engine.type(key);
    if (result === null) {
      return;
    }
    if (result.correct) {
      this.correct += 1;
    }
    (this.view as TextView | null)?.moveCursor(this.engine.cursor);
    this.push({
      ...base,
      key,
      expected: result.expected,
      correct: result.correct,
      pos: result.pos,
    });
    if (this.engine.finished) {
      void this.finish("completed");
    }
  }

  private onBackspace(event: SessionEventLike): void {
    if (!this.started) {
      return;
    }
    const base = this.keystrokeBase(event, "backspace");

    if (this.isZen) {
      if ((this.view as ZenView | null)?.backspace()) {
        this.notePress(base.t);
        this.zenLength -= 1;
        this.push({ ...base, pos: this.zenLength });
      }
      return;
    }

    if (this.settings.backspace === "blocked") {
      // Corrections are off, so the press is recorded and changes nothing.
      this.push({ ...base, ignored: "policy" });
      return;
    }
    const cleared = this.engine.backspace();
    if (cleared === null) {
      return;
    }
    this.notePress(base.t);
    (this.view as TextView | null)?.moveCursor(this.engine.cursor);
    this.push({ ...base, pos: cleared });
  }

  private begin(event: SessionEventLike): void {
    this.sid = this.newId();
    this.t0 = event.timeStamp;
    this.push({
      v: SCHEMA_VERSION,
      type: "session_started",
      sid: this.sid,
      seq: this.nextSeq(),
      ts: this.wallClock(),
      mode: this.plan.mode,
      layout: LAYOUT,
      source: this.plan.source,
      settings: this.settings,
      app: this.appVersion,
    });
    this.startTimers();
  }

  private keystrokeBase(
    event: SessionEventLike,
    kind: KeystrokeEvent["kind"],
  ): KeystrokeEvent {
    const mods = this.held.snapshot(
      kind === "modifier" ? event.code : undefined,
    );
    const stroke: KeystrokeEvent = {
      v: SCHEMA_VERSION,
      type: "keystroke",
      sid: this.sid as string,
      seq: this.nextSeq(),
      t: roundTime(event.timeStamp - this.t0),
      kind,
      code: event.code,
    };
    if (mods) {
      stroke.mods = mods;
    }
    return stroke;
  }

  private notePress(t: number): void {
    this.lastPressT = t;
    this.pausedBeforeLastPress = this.pausedTotal;
  }

  private push(event: JournalEvent): void {
    this.batcher.push(event);
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  private time(at: number): number {
    return roundTime(at - this.t0);
  }

  private activeElapsedMs(at: number): number {
    return Math.max(0, at - this.t0 - this.pausedTotal);
  }

  /** Mirrors the duration in `stats`: from the first press to the last, without pauses. */
  private activeUntilLastPress(): number {
    return roundTime(Math.max(0, this.lastPressT - this.pausedBeforeLastPress));
  }

  private startTimers(): void {
    this.stopTimers();
    this.liveTimer = setInterval(() => this.reportLive(), LIVE_INTERVAL_MS);
    if (this.plan.seconds !== undefined) {
      this.limitTimer = setInterval(() => this.checkLimit(), LIMIT_CHECK_MS);
    }
    this.reportLive();
  }

  private stopTimers(): void {
    if (this.liveTimer !== null) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
    }
    if (this.limitTimer !== null) {
      clearInterval(this.limitTimer);
      this.limitTimer = null;
    }
  }

  private reportLive(): void {
    const elapsed = this.activeElapsedMs(this.now());
    const seconds =
      this.plan.seconds !== undefined
        ? Math.max(0, this.plan.seconds - elapsed / 1000)
        : elapsed / 1000;
    this.callbacks.live({
      seconds,
      // Below a second the figure is noise.
      wpm: elapsed >= 1000 ? this.correct / 5 / (elapsed / 60000) : 0,
      accuracy:
        this.isZen || this.chars === 0
          ? null
          : (this.correct / this.chars) * 100,
    });
  }

  private checkLimit(): void {
    if (
      this.plan.seconds !== undefined &&
      this.activeElapsedMs(this.now()) >= this.plan.seconds * 1000
    ) {
      void this.finish("completed");
    }
  }

  private showHint(hint: Hint): void {
    if (hint !== this.hintShown) {
      this.hintShown = hint;
      this.callbacks.hint(hint);
    }
  }
}

function roundTime(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}

/** Local time with its offset, so streaks can use the local date at a later stage. */
function localTimestamp(): string {
  const now = new Date();
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
