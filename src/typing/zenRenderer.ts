const KEEP_CHARS = 4000;
const TRIM_AT = 8000;
const IDLE_AFTER_MS = 1200;
const IDLE_CHECK_MS = 300;

/**
 * Shows free typing. The window anchors its content to the bottom, so the newest line stays in
 * view with no measuring at all. The text is one text node, which makes a press a single append.
 * A slow timer starts the caret blinking, so a press never has to set a timer of its own.
 */
export class ZenRenderer {
  private readonly node: Text;
  private readonly caret: HTMLElement;
  private readonly stream: HTMLElement;
  private readonly now: () => number;
  private hint: HTMLElement | null;
  private trim: ReturnType<typeof setTimeout> | null = null;
  private readonly idleTimer: ReturnType<typeof setInterval>;
  private lastPress = 0;
  private idle = true;

  constructor(
    stream: HTMLElement,
    now: () => number = () => performance.now(),
  ) {
    this.stream = stream;
    this.now = now;
    this.node = document.createTextNode("");
    const text = document.createElement("span");
    text.className = "zen__text";
    text.append(this.node);
    this.caret = document.createElement("span");
    this.caret.className = "zen__caret is-idle";
    this.caret.setAttribute("aria-hidden", "true");
    // A word joiner gives the caret a line to sit on without opening a place to wrap.
    this.caret.textContent = "⁠";
    this.hint = document.createElement("span");
    this.hint.className = "zen__hint";
    this.hint.textContent = "Type anything. Nothing here is scored.";
    this.stream.replaceChildren(text, this.caret, this.hint);
    this.idleTimer = setInterval(() => this.checkIdle(), IDLE_CHECK_MS);
  }

  append(key: string): void {
    this.node.appendData(key);
    this.pressed();
    if (this.node.length > TRIM_AT && this.trim === null) {
      this.trim = setTimeout(() => {
        this.trim = null;
        this.node.deleteData(0, this.node.length - KEEP_CHARS);
      }, 0);
    }
  }

  /** Returns false when nothing is left to take back. */
  backspace(): boolean {
    if (this.node.length === 0) {
      return false;
    }
    this.node.deleteData(this.node.length - 1, 1);
    this.pressed();
    return true;
  }

  dispose(): void {
    if (this.trim !== null) {
      clearTimeout(this.trim);
    }
    clearInterval(this.idleTimer);
    this.stream.replaceChildren();
  }

  private pressed(): void {
    this.lastPress = this.now();
    if (this.hint !== null) {
      this.hint.remove();
      this.hint = null;
    }
    if (this.idle) {
      this.idle = false;
      this.caret.classList.remove("is-idle");
    }
  }

  private checkIdle(): void {
    if (!this.idle && this.now() - this.lastPress >= IDLE_AFTER_MS) {
      this.idle = true;
      this.caret.classList.add("is-idle");
    }
  }
}
