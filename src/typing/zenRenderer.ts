const KEEP_CHARS = 4000;
const TRIM_AT = 8000;

/**
 * Shows free typing. The window anchors its content to the bottom, so the newest line stays in
 * view with no measuring at all. The text is one text node, which makes a press a single append.
 */
export class ZenRenderer {
  private readonly node: Text;
  private readonly stream: HTMLElement;
  private trim: ReturnType<typeof setTimeout> | null = null;

  constructor(stream: HTMLElement) {
    this.stream = stream;
    this.node = document.createTextNode("");
    const text = document.createElement("span");
    text.className = "zen__text";
    text.append(this.node);
    const caret = document.createElement("span");
    caret.className = "c cur";
    // A no-break space gives the caret a width without opening a place to wrap.
    caret.textContent = " ";
    this.stream.replaceChildren(text, caret);
  }

  append(key: string): void {
    this.node.appendData(key);
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
    return true;
  }

  dispose(): void {
    if (this.trim !== null) {
      clearTimeout(this.trim);
    }
    this.stream.replaceChildren();
  }
}
