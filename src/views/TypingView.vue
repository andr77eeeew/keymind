<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useAppStore } from "../stores/app";
import { useSessionStore } from "../stores/session";
import { useSettingsStore } from "../stores/settings";
import { setActiveSession } from "../typing/active";
import { appendEvents, saveImportOffset } from "../typing/api";
import { MESSAGES, type MessageKind } from "../typing/messages";
import { TextRenderer } from "../typing/renderer";
import {
  TypingSession,
  type LiveStats,
  type PauseReason,
} from "../typing/session";
import { clockText } from "../typing/summary";
import type { SessionPlan } from "../typing/types";
import { ZenRenderer } from "../typing/zenRenderer";

/** A key meant for the text may arrive just after the pause, and must not press Resume. */
const RESUME_FOCUS_DELAY_MS = 400;
const ENDING_SECONDS = 10;

const PAUSE_TEXT: Record<PauseReason, string> = {
  esc: "The session clock is stopped. Nothing is lost.",
  blur: "Another window took the focus, so the clock stopped. Nothing is lost.",
};

const app = useAppStore();
const store = useSessionStore();
const settings = useSettingsStore();

// `store.plan` is cleared when the session ends, while this view is still on its way out.
const plan = store.plan as SessionPlan;
const isZen = plan.mode === "zen";
const isTimed = plan.seconds !== undefined;

const modeName = isZen ? "Zen" : plan.mode === "words" ? "Words" : "Text";
const title = isTimed ? "Timed words session" : `${modeName} session`;
const tags = isZen
  ? []
  : [
      settings.settings.backspace === "blocked" ? "Backspace off" : null,
      settings.settings.on_error === "stop" ? "Stops on errors" : null,
    ].filter((tag) => tag !== null);
const runLabel = isTimed
  ? "Time left"
  : plan.mode === "words"
    ? "Progress through the words"
    : "Progress through the text";

const windowEl = ref<HTMLElement>();
const streamEl = ref<HTMLElement>();
const timeEl = ref<HTMLElement>();
const wpmEl = ref<HTMLElement>();
const accuracyEl = ref<HTMLElement>();
const runEl = ref<HTMLElement>();
const barEl = ref<HTMLElement>();
const noticeEl = ref<HTMLElement>();
const dialogEl = ref<HTMLDialogElement>();
const resumeEl = ref<HTMLButtonElement>();
const pauseText = ref(PAUSE_TEXT.esc);

let session: TypingSession | null = null;
let restarting = false;
let closed = false;
let resumeFocus: ReturnType<typeof setTimeout> | null = null;
let ending = false;

// The figures and the message are written directly: they change during typing, and Vue stays off
// that path, as ADR-0004 explains.
function showLive(stats: LiveStats): void {
  if (timeEl.value) {
    // A countdown rounds up, so it reaches 00:00 only when the time is really over.
    timeEl.value.textContent = clockText(
      (isTimed ? Math.ceil(stats.seconds) : Math.floor(stats.seconds)) * 1000,
    );
    const nowEnding = isTimed && stats.seconds <= ENDING_SECONDS;
    if (nowEnding !== ending) {
      ending = nowEnding;
      timeEl.value.classList.toggle("is-ending", nowEnding);
    }
  }
  if (wpmEl.value) {
    wpmEl.value.textContent =
      stats.wpm > 0 ? String(Math.round(stats.wpm)) : "—";
  }
  if (accuracyEl.value) {
    accuracyEl.value.textContent =
      stats.accuracy === null ? "—" : `${Math.round(stats.accuracy)}%`;
  }
  if (barEl.value && runEl.value) {
    barEl.value.style.setProperty("--v", stats.progress.toFixed(4));
    runEl.value.setAttribute(
      "aria-valuenow",
      String(Math.round(stats.progress * 100)),
    );
  }
}

function showMessage(kind: MessageKind | null): void {
  const el = noticeEl.value;
  if (el) {
    el.dataset.level = kind === null ? "" : MESSAGES[kind].level;
    el.textContent = kind === null ? "" : MESSAGES[kind].text;
  }
}

function open(): void {
  session?.dispose();
  showMessage(null);
  const next = new TypingSession({
    plan,
    settings: { ...settings.settings },
    appVersion: app.info?.version ?? "unknown",
    send: appendEvents,
    callbacks: {
      live: showLive,
      message: showMessage,
      paused: onPaused,
      ended: (sid, _reason, saved) => void onEnded(next, sid, saved),
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
  showLive({
    seconds: plan.seconds ?? 0,
    wpm: 0,
    accuracy: null,
    progress: isTimed ? 1 : 0,
  });
}

function onPaused(reason: PauseReason): void {
  pauseText.value = PAUSE_TEXT[reason];
  const dialog = dialogEl.value;
  if (!dialog) {
    return;
  }
  dialog.showModal();
  dialog.focus();
  resumeFocus = setTimeout(() => {
    resumeFocus = null;
    if (dialog.open) {
      resumeEl.value?.focus();
    }
  }, RESUME_FOCUS_DELAY_MS);
}

function closeDialog(): void {
  if (resumeFocus !== null) {
    clearTimeout(resumeFocus);
    resumeFocus = null;
  }
  dialogEl.value?.close();
}

async function onEnded(
  ended: TypingSession,
  sid: string | null,
  saved: boolean,
): Promise<void> {
  setActiveSession(null);
  if (
    sid !== null &&
    plan.importOffset !== undefined &&
    plan.source.kind === "import"
  ) {
    // Progress is a convenience, so a failure here only means starting a little earlier next time.
    await saveImportOffset(
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
  void store.ended(sid, ended.engine.cursor, saved);
}

function onKeyDown(event: KeyboardEvent): void {
  session?.handleKeyDown(event);
}
function onKeyUp(event: KeyboardEvent): void {
  session?.handleKeyUp(event);
}
function onBlur(): void {
  session?.handleBlur();
}

function resume(): void {
  closeDialog();
  session?.resume();
}

function restart(): void {
  closeDialog();
  restarting = true;
  void session?.finish("aborted");
}

function endSession(): void {
  closeDialog();
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
  if (resumeFocus !== null) {
    clearTimeout(resumeFocus);
  }
  window.removeEventListener("keydown", onKeyDown, { capture: true });
  window.removeEventListener("keyup", onKeyUp, { capture: true });
  window.removeEventListener("blur", onBlur);
  session?.dispose();
  setActiveSession(null);
});
</script>

<template>
  <main class="app" :class="{ 'app--zen': isZen }">
    <h1 class="visually-hidden">{{ title }}</h1>
    <header class="bar">
      <div class="bar__group">
        <span class="bar__mode">{{ modeName }}</span>
        <span v-if="plan.detail" class="bar__detail" :title="plan.detail">{{
          plan.detail
        }}</span>
        <span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span>
      </div>
      <div class="bar__group">
        <template v-if="!isZen">
          <span v-if="isTimed" class="stat">
            <b ref="timeEl" :data-limit="plan.seconds" />
            left
          </span>
          <span v-else class="stat stat--live"><b ref="timeEl" /></span>
          <span class="stat stat--live"><b ref="wpmEl" /> WPM</span>
          <span class="stat stat--live"><b ref="accuracyEl" /> accuracy</span>
        </template>
        <span>Esc to pause</span>
      </div>
    </header>
    <section class="stage" aria-label="Text to type">
      <div
        v-if="!isZen"
        ref="runEl"
        class="run"
        :class="{ 'run--limit': isTimed }"
        role="progressbar"
        :aria-label="runLabel"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <i ref="barEl" />
      </div>
      <div ref="windowEl" class="window" :class="{ 'window--zen': isZen }">
        <div ref="streamEl" class="stream" />
      </div>
      <div class="slot">
        <p ref="noticeEl" class="notice" role="status" data-level="" />
        <p v-if="plan.caption" class="source">{{ plan.caption }}</p>
      </div>
    </section>
    <dialog
      ref="dialogEl"
      class="pause"
      aria-label="Paused"
      tabindex="-1"
      @cancel.prevent="resume"
    >
      <h2>Paused</h2>
      <p>{{ pauseText }}</p>
      <div class="row">
        <button
          ref="resumeEl"
          type="button"
          class="btn btn--primary"
          @click="resume"
        >
          Resume
        </button>
        <button v-if="!isZen" type="button" class="btn" @click="restart">
          Restart
        </button>
        <button type="button" class="btn btn--quiet" @click="endSession">
          End session
        </button>
      </div>
    </dialog>
  </main>
</template>
