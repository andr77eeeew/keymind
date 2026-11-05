import { onBeforeUnmount, onMounted, type Ref } from "vue";

// One tooltip for everything that has `data-tip`, so 676 matrix cells do not need 676 listeners.

let element: HTMLElement | null = null;

export function showTip(text: string, x: number, y: number): void {
  if (element === null) {
    element = document.createElement("div");
    element.id = "tip";
    element.setAttribute("role", "presentation");
    document.body.append(element);
  }
  element.textContent = text;
  const width = element.offsetWidth;
  element.style.left = `${Math.min(window.innerWidth - width - 8, x + 12)}px`;
  element.style.top = `${Math.max(8, y - 34)}px`;
}

export function hideTip(): void {
  element?.remove();
  element = null;
}

/** Shows `data-tip` of whatever is under the pointer inside `root`. */
export function useTips(root: Ref<HTMLElement | null>): void {
  function move(event: PointerEvent): void {
    const target = (event.target as Element).closest("[data-tip]");
    const text = target?.getAttribute("data-tip");
    if (text) {
      showTip(text, event.clientX, event.clientY);
    } else if (!(event.target as Element).closest(".chart__plot")) {
      hideTip();
    }
  }

  let attached: HTMLElement | null = null;
  onMounted(() => {
    attached = root.value;
    attached?.addEventListener("pointermove", move);
    attached?.addEventListener("pointerleave", hideTip);
  });
  onBeforeUnmount(() => {
    attached?.removeEventListener("pointermove", move);
    attached?.removeEventListener("pointerleave", hideTip);
    hideTip();
  });
}
