<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useAppStore } from "../stores/app";
import { useSessionStore } from "../stores/session";
import { useSettingsStore } from "../stores/settings";
import { setActiveSession } from "../typing/active";
import { appendEvents, saveImportOffset } from "../typing/api";
import { TextRenderer } from "../typing/renderer";
import { TypingSession, type Hint, type LiveStats } from "../typing/session";
import type { SessionPlan } from "../typing/types";
import { ZenRenderer } from "../typing/zenRenderer";

const app = useAppStore();
const store = useSessionStore();
const settings = useSettingsStore();

// `store.plan` is cleared when the session ends, while this view is still on its way out.
const plan = store.plan as SessionPlan;
const isZen = plan.mode === "zen";

const windowEl = ref<HTMLElement>();
const streamEl = ref<HTMLElement>();
const timeEl = ref<HTMLElement>();
const wpmEl = ref<HTMLElement>();
const accuracyEl = ref<HTMLElement>();
const hintEl = ref<HTMLElement>();
const dialogEl = ref<HTMLDialogElement>();

let session: TypingSession | null = null;
let restarting = false;
let closed = false;
let hint: Hint = null;
let unhealthy = false;

const HINTS: Record<Exclude<Hint, null>, string> = {
  layout: "Switch the keyboard to English. This press was not counted.",
  caps: "Caps Lock is on.",
};
const UNHEALTHY =
  "Saving is delayed. Your typing is kept and is written as soon as the disk responds.";

function clock(seconds: number): string {
  const total =
    plan.seconds !== undefined ? Math.ceil(seconds) : Math.floor(seconds);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

// The figures and the hint are written directly: they change during typing, and Vue stays off that
// path, as ADR-0004 explains.
function showLive(stats: LiveStats): void {
  if (timeEl.value) timeEl.value.textContent = clock(stats.seconds);
  if (wpmEl.value) wpmEl.value.textContent = String(Math.round(stats.wpm));
  if (accuracyEl.value) {
    accuracyEl.value.textContent =
      stats.accuracy === null ? "—" : `${Math.round(stats.accuracy)}%`;
  }
}

function showHint(): void {
  if (hintEl.value) {
    hintEl.value.textContent = unhealthy
      ? UNHEALTHY
      : hint === null
        ? ""
        : HINTS[hint];
  }
}

function open(): void {
  session?.dispose();
  const next = new TypingSession({
    plan,
    settings: { ...settings.settings },
    appVersion: app.info?.version ?? "unknown",
    send: appendEvents,
    callbacks: {
      live: showLive,
      hint: (value) => {
        hint = value;
        showHint();
      },
      health: (healthy) => {
        unhealthy = !healthy;
        showHint();
      },
      paused: () => dialogEl.value?.showModal(),
      ended: (sid) => onEnded(next, sid),
    },
  });
  const stream = streamEl.value as HTMLElement;
  next.attachView(
    isZen
      ? new ZenRenderer(stream)
      : new TextRenderer(windowEl.value as HTMLElement, stream, next.engine),
  );
  session = next;
  setActiveSession(next);
  hint = null;
  showHint();
  showLive({ seconds: plan.seconds ?? 0, wpm: 0, accuracy: null });
}

function onEnded(ended: TypingSession, sid: string | null): void {
  setActiveSession(null);
  if (
    sid !== null &&
    plan.importOffset !== undefined &&
    plan.source.kind === "import"
  ) {
    // Progress is a convenience, so a failure here only means starting a little earlier next time.
    saveImportOffset(
      plan.source.id,
      plan.importOffset + ended.engine.cursor,
    ).catch(() => {});
  }
  if (closed) {
    return;
  }
  if (restarting) {
    restarting = false;
    open();
    return;
  }
  void store.ended(sid);
}

function onKeyDown(event: KeyboardEvent): void {
  session?.handleKeyDown(event);
}
function onKeyUp(event: KeyboardEvent): void {
  session?.handleKeyUp(event.code);
}
function onBlur(): void {
  session?.handleBlur();
}

function resume(): void {
  dialogEl.value?.close();
  session?.resume();
}

function restart(): void {
  dialogEl.value?.close();
  restarting = true;
  void session?.finish("aborted");
}

function endSession(): void {
  dialogEl.value?.close();
  // Zen has no end of its own, so ending it here is how it completes.
  void session?.finish(isZen ? "completed" : "aborted");
}

onMounted(async () => {
  // Wrapping is measured, so it has to happen with the real font.
  try {
    await document.fonts.load('400 30px "Golos Text"');
  } catch {
    // The fallback font still works, and a resize would remeasure anyway.
  }
  if (closed) {
    return;
  }
  open();
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("keyup", onKeyUp, { capture: true });
  window.addEventListener("blur", onBlur);
});

onBeforeUnmount(() => {
  closed = true;
  window.removeEventListener("keydown", onKeyDown, { capture: true });
  window.removeEventListener("keyup", onKeyUp, { capture: true });
  window.removeEventListener("blur", onBlur);
  session?.dispose();
  setActiveSession(null);
});
</script>

<template>
  <main class="app">
    <h1 class="visually-hidden">{{ plan.mode }} session</h1>
    <header class="bar">
      <div class="bar__group">
        <span class="bar__mode">{{
          isZen ? "Zen" : plan.mode === "words" ? "Words" : "Text"
        }}</span>
        <span>{{ plan.detail }}</span>
      </div>
      <div class="bar__group">
        <template v-if="!isZen">
          <span class="stat"><b ref="timeEl">00:00</b></span>
          <span class="stat"><b ref="wpmEl">0</b> WPM</span>
          <span class="stat"><b ref="accuracyEl">—</b> accuracy</span>
        </template>
        <span>Esc to pause</span>
      </div>
    </header>
    <section class="stage" aria-label="Text to type">
      <div ref="windowEl" class="window" :class="{ 'window--zen': isZen }">
        <div ref="streamEl" class="stream" />
      </div>
      <p v-if="plan.caption" class="source">{{ plan.caption }}</p>
      <p ref="hintEl" class="hint" role="status" />
    </section>
    <dialog ref="dialogEl" class="pause" @cancel.prevent="resume">
      <h2>Paused</h2>
      <p>The session clock is stopped. Nothing is lost.</p>
      <div class="row">
        <button
          type="button"
          class="btn btn--primary"
          autofocus
          @click="resume"
        >
          Resume
        </button>
        <button type="button" class="btn" @click="restart">Restart</button>
        <button type="button" class="btn btn--quiet" @click="endSession">
          End session
        </button>
      </div>
    </dialog>
  </main>
</template>
