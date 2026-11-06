import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import {
  sessionKeys,
  statsSession,
  statsStatus,
  type KeyRow,
  type SessionRow,
  type StatsStatus,
} from "../typing/api";
import type { ReadState } from "./stats";

/**
 * The result of the starting test. Its map and figures come from the projector, which reaches the
 * end of the test a moment after it ends, so the screen waits for that.
 */
export const useTestStore = defineStore("test", () => {
  const sid = ref<string | null>(null);
  const row = shallowRef<SessionRow | null>(null);
  const keys = shallowRef<KeyRow[]>([]);
  const state = ref<ReadState>("loading");
  /** The end of the test never reached the disk, so no projection will ever finish it. */
  const unsaved = ref(false);
  let token = 0;

  /** The session row exists from its first line, so only a row with an end is final. */
  async function read(): Promise<void> {
    const current = sid.value;
    if (current === null || state.value === "ready") {
      return;
    }
    token += 1;
    const mine = token;
    try {
      const status = await statsStatus();
      if (mine !== token) {
        return;
      }
      if (status.state === "failed") {
        state.value = "error";
        return;
      }
      if (status.state !== "idle") {
        return;
      }
      const found = await statsSession(current);
      if (mine !== token || found === null || found.reason === null) {
        return;
      }
      const read = await sessionKeys(current);
      if (mine === token) {
        row.value = found;
        keys.value = read;
        state.value = "ready";
      }
    } catch {
      if (mine === token) {
        state.value = "error";
      }
    }
  }

  /** A test ended. One whose end did not reach the disk has no result to wait for. */
  function follow(next: string, saved: boolean): void {
    token += 1;
    sid.value = next;
    unsaved.value = !saved;
    row.value = null;
    keys.value = [];
    state.value = saved ? "loading" : "error";
    if (saved) {
      void read();
    }
  }

  function statusChanged(status: StatsStatus): void {
    if (sid.value === null || unsaved.value) {
      return;
    }
    if (status.state === "idle") {
      if (state.value === "error") {
        // After a rebuild the end may be there now.
        state.value = "loading";
      }
      void read();
    } else if (status.state === "failed" && state.value === "loading") {
      token += 1;
      state.value = "error";
    }
  }

  return { sid, row, keys, state, unsaved, follow, statusChanged };
});
