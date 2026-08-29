import { describe, expect, it } from "vitest";
import { isAssistantToggleShortcut } from "./AiAssistant";

function shortcutEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: "j", ...init });
}

describe("isAssistantToggleShortcut", () => {
  it("accepts Ctrl+J on Windows and Command+J on macOS", () => {
    expect(isAssistantToggleShortcut(shortcutEvent({ ctrlKey: true }))).toBe(true);
    expect(isAssistantToggleShortcut(shortcutEvent({ metaKey: true }))).toBe(true);
    expect(isAssistantToggleShortcut(shortcutEvent({ key: "J", metaKey: true }))).toBe(true);
  });

  it.each([
    ["no primary modifier", {}],
    ["Alt", { ctrlKey: true, altKey: true }],
    ["Shift", { metaKey: true, shiftKey: true }],
    ["a repeated keydown", { ctrlKey: true, repeat: true }],
    ["Ctrl and Command together", { ctrlKey: true, metaKey: true }],
    ["another key", { key: "k", ctrlKey: true }],
  ])("rejects %s", (_name, init) => {
    expect(isAssistantToggleShortcut(shortcutEvent(init))).toBe(false);
  });
});
