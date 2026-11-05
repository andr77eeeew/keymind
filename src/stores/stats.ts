import { defineStore } from "pinia";
import { computed, ref, shallowRef, type Ref, type ShallowRef } from "vue";
import { localDate, periodStart, type Period } from "../stats/trends";
import {
  rebuildStats,
  statsOverview,
  statsSession,
  statsStatus,
  type SessionRow,
  type StatsOverview,
  type StatsStatus,
} from "../typing/api";
import { useAppStore, type Screen } from "./app";

export type ReadState = "loading" | "ready" | "error";

/** One thing a screen reads, with its own state. An answer to an old question is thrown away. */
interface Reader {
  data: ShallowRef<StatsOverview | null>;
  state: Ref<ReadState>;
  stale: boolean;
  token: number;
  fromDate: () => string | null;
}

function reader(fromDate: () => string | null): Reader {
  return {
    data: shallowRef(null),
    state: ref("loading"),
    stale: true,
    token: 0,
    fromDate,
  };
}

/** What Home and Statistics read from the projector. */
export const useStatsStore = defineStore("stats", () => {
  const app = useAppStore();

  const period = ref<Period>("30");
  const home = reader(() => null);
  const screen = reader(() => periodStart(period.value, today()));
  const readers = [home, screen];

  /** The user asked for a rebuild, and it has not ended yet. */
  const rebuilding = ref(false);
  const rebuildError = ref<string | null>(null);
  const rebuilt = ref(false);

  const past = shallowRef<SessionRow | null>(null);
  const pastFailed = ref(false);
  let pastToken = 0;

  function today(): string {
    return localDate(new Date());
  }

  async function read(target: Reader): Promise<void> {
    target.token += 1;
    const { token } = target;
    target.stale = false;
    try {
      const status = await statsStatus();
      if (token !== target.token) {
        return;
      }
      if (status.state === "failed") {
        target.state.value = "error";
        return;
      }
      if (status.state === "rebuilding") {
        // The tables start from nothing, so they would only mislead. Idle reads them again.
        target.stale = true;
        if (target.data.value === null) {
          target.state.value = "loading";
        }
        return;
      }
      const overview = await statsOverview(target.fromDate());
      if (token === target.token) {
        target.data.value = overview;
        target.state.value = "ready";
      }
    } catch {
      if (token === target.token) {
        target.state.value = "error";
      }
    }
  }

  /** A screen opened. What already came in is shown until the new answer arrives. */
  function showHome(): void {
    if (home.stale || home.state.value === "error") {
      void read(home);
    }
  }

  function showStatistics(): void {
    if (screen.stale || screen.state.value === "error") {
      void read(screen);
    }
  }

  function setPeriod(next: Period): void {
    if (next !== period.value) {
      period.value = next;
      void read(screen);
    }
  }

  /** Only the screen in front reads at once, because nothing may reach the typing screen. */
  function statusChanged(status: StatsStatus): void {
    if (status.state === "idle") {
      if (rebuilding.value) {
        rebuilding.value = false;
        rebuilt.value = true;
      }
      for (const target of readers) {
        target.stale = true;
      }
      if (app.screen === "home" || app.screen === "settings") {
        showHome();
      } else if (app.screen === "statistics") {
        showStatistics();
      }
    } else if (status.state === "failed") {
      rebuilding.value = false;
      rebuildError.value = status.message;
      for (const target of readers) {
        target.token += 1;
        target.state.value = "error";
        target.stale = true;
      }
    } else if (status.state === "rebuilding") {
      for (const target of readers) {
        if (target.data.value === null || target.state.value === "error") {
          target.token += 1;
          target.state.value = "loading";
        }
        target.stale = true;
      }
    }
  }

  async function rebuild(): Promise<void> {
    rebuilding.value = true;
    rebuilt.value = false;
    rebuildError.value = null;
    for (const target of readers) {
      if (target.state.value === "error") {
        target.token += 1;
        target.state.value = "loading";
      }
    }
    try {
      await rebuildStats();
    } catch (cause) {
      rebuilding.value = false;
      rebuildError.value = String(cause);
      for (const target of readers) {
        target.token += 1;
        target.state.value = "error";
      }
    }
  }

  /** Opens the saved summary of a session. */
  async function openPast(sid: string, from: Screen): Promise<void> {
    pastToken += 1;
    const token = pastToken;
    past.value = null;
    pastFailed.value = false;
    app.pastFrom = from;
    app.go("past");
    try {
      const row = await statsSession(sid);
      if (token === pastToken) {
        past.value = row;
        pastFailed.value = row === null;
      }
    } catch {
      if (token === pastToken) {
        pastFailed.value = true;
      }
    }
  }

  return {
    period,
    homeData: computed(() => home.data.value),
    homeState: computed(() => home.state.value),
    screenData: computed(() => screen.data.value),
    screenState: computed(() => screen.state.value),
    rebuilding,
    rebuildError,
    rebuilt,
    past,
    pastFailed,
    today,
    showHome,
    showStatistics,
    setPeriod,
    statusChanged,
    rebuild,
    openPast,
  };
});
