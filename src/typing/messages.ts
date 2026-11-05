export type MessageKind =
  "stop" | "layout" | "backspace" | "caps" | "disk" | "ready";

/** What a press can act on comes before what only needs waiting. */
const PRIORITY: readonly MessageKind[] = [
  "stop",
  "layout",
  "backspace",
  "caps",
  "disk",
  "ready",
];

export const MESSAGES: Record<
  MessageKind,
  { level: "act" | "wait" | "ready"; text: string }
> = {
  stop: {
    level: "act",
    text: "Stopped on an error. Press the right key to go on.",
  },
  layout: {
    level: "act",
    text: "Switch the keyboard to English. This press was not counted.",
  },
  backspace: {
    level: "act",
    text: "Backspace is off in this session. Keep going.",
  },
  caps: { level: "act", text: "Caps Lock is on." },
  disk: {
    level: "wait",
    text: "Saving is delayed. Your typing is kept and is written as soon as the disk responds.",
  },
  ready: { level: "ready", text: "The clock starts with your first key." },
};

/**
 * One slot, one message. Reports only when the message on the screen changes, so a press that
 * changes nothing costs a set lookup and writes nothing.
 */
export class Messages {
  private readonly active = new Set<MessageKind>();
  private shown: MessageKind | null = null;
  private readonly show: (kind: MessageKind | null) => void;

  constructor(show: (kind: MessageKind | null) => void) {
    this.show = show;
  }

  set(kind: MessageKind, on: boolean): void {
    if (this.active.has(kind) === on) {
      return;
    }
    if (on) {
      this.active.add(kind);
    } else {
      this.active.delete(kind);
    }
    let top: MessageKind | null = null;
    for (const candidate of PRIORITY) {
      if (this.active.has(candidate)) {
        top = candidate;
        break;
      }
    }
    if (top !== this.shown) {
      this.shown = top;
      this.show(top);
    }
  }
}
