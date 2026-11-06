import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { localDate } from "../stats/trends";
import {
  brainNext,
  statsSession,
  statsStatus,
  type BrainView,
  type SessionTarget,
  type StatsStatus,
} from "../typing/api";
import { useAppStore } from "./app";
import type { ReadState } from "./stats";

/** What Home and the Brain screen show about the next session, and the targets of the last one. */
export const useBrainStore = defineStore("brain", () => {
  const app = useAppStore();

  const next = shallowRef<BrainView | null>(null);
  const nextState = ref<ReadState>("loading");
  let nextStale = true;
  let nextToken = 0;

  /** The adaptive session on the summary screen. Its targets come from the projector. */
  const endedSid = ref<string | null>(null);
  const endedTargets = shallowRef<SessionTarget[] | null>(null);
  const endedState = ref<ReadState>("loading");
  let endedToken = 0;

  async function readNext(): Promise<void> {
    nextToken += 1;
    const token = nextToken;
    nextStale = false;
    try {
      const status = await statsStatus();
      if (token !== nextToken) {
        return;
      }
      if (status.state === "failed") {
        nextState.value = "error";
        return;
      }
      if (status.state === "rebuilding") {
        // The model is computed from nothing again, so Idle reads it once it is whole.
        nextStale = true;
        if (next.value === null) {
          nextState.value = "loading";
        }
        return;
      }
      const view = await brainNext(localDate(new Date()));
      if (token !== nextToken) {
        return;
      }
      if (view.informed) {
        next.value = view;
        nextState.value = "ready";
      } else {
        nextState.value = "error";
      }
    } catch {
      if (token === nextToken) {
        nextState.value = "error";
      }
    }
  }

  /** A screen that shows the next session opened. */
  function showNext(): void {
    if (nextStale || nextState.value === "error") {
      void readNext();
    }
  }

  /**
   * The session row exists from its first line, so only a row with an end is final. Until then
   * the next Idle reads again.
   */
  async function readEnded(): Promise<void> {
    const sid = endedSid.value;
    if (sid === null) {
      return;
    }
    endedToken += 1;
    const token = endedToken;
    try {
      const status = await statsStatus();
      if (token !== endedToken) {
        return;
      }
      if (status.state === "failed") {
        endedState.value = "error";
        return;
      }
      if (status.state !== "idle") {
        return;
      }
      const row = await statsSession(sid);
      if (token === endedToken && row !== null && row.reason !== null) {
        endedTargets.value = row.targets;
        endedState.value = "ready";
      }
    } catch {
      if (token === endedToken) {
        endedState.value = "error";
      }
    }
  }

  /** The summary of an adaptive session opened. */
  function followEnded(sid: string): void {
    endedSid.value = sid;
    endedTargets.value = null;
    endedState.value = "loading";
    void readEnded();
  }

  function statusChanged(status: StatsStatus): void {
    if (status.state === "idle") {
      nextStale = true;
      if (app.screen === "home" || app.screen === "brain") {
        showNext();
      }
      if (endedSid.value !== null && endedState.value !== "ready") {
        void readEnded();
      }
    } else if (status.state === "failed") {
      nextToken += 1;
      nextStale = true;
      nextState.value = "error";
      if (endedState.value === "loading") {
        endedToken += 1;
        endedState.value = "error";
      }
    } else if (status.state === "rebuilding") {
      nextStale = true;
      if (next.value === null || nextState.value === "error") {
        nextToken += 1;
        nextState.value = "loading";
      }
      if (endedState.value === "error") {
        endedState.value = "loading";
      }
    }
  }

  return {
    next,
    nextState,
    endedSid,
    endedTargets,
    endedState,
    showNext,
    followEnded,
    statusChanged,
  };
});
