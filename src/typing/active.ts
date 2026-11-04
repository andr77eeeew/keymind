import type { TypingSession } from "./session";

let active: TypingSession | null = null;

/** Writing cannot hold the window open for long, because the user asked to close it. */
const CLOSE_WAIT_MS = 2000;

/** The session on the typing screen, kept outside Vue so it stays plain data. */
export function setActiveSession(session: TypingSession | null): void {
  active = session;
}

/** Ends a running session before the window closes, so its last events reach the disk. */
export async function finishActiveSession(): Promise<void> {
  if (active === null) {
    return;
  }
  await Promise.race([
    active.finish("aborted"),
    new Promise((resolve) => setTimeout(resolve, CLOSE_WAIT_MS)),
  ]);
}
