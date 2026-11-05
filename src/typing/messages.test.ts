import { describe, expect, it } from "vitest";
import { Messages, type MessageKind } from "./messages";

function setup() {
  const shown: Array<MessageKind | null> = [];
  return { shown, messages: new Messages((kind) => shown.push(kind)) };
}

describe("Messages", () => {
  it("reports only when the message on the screen changes", () => {
    const { shown, messages } = setup();
    messages.set("caps", false);
    messages.set("caps", true);
    messages.set("caps", true);
    expect(shown).toEqual(["caps"]);
    messages.set("caps", false);
    expect(shown).toEqual(["caps", null]);
  });

  it("shows what a press can act on before what only needs waiting", () => {
    const { shown, messages } = setup();
    messages.set("disk", true);
    messages.set("layout", true);
    expect(shown).toEqual(["disk", "layout"]);
    messages.set("layout", false);
    expect(shown).toEqual(["disk", "layout", "disk"]);
  });

  it("stays quiet when a lower message comes under a higher one", () => {
    const { shown, messages } = setup();
    messages.set("stop", true);
    messages.set("caps", true);
    messages.set("ready", true);
    expect(shown).toEqual(["stop"]);
  });
});
