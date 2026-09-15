import { describe, expect, it } from "vitest";
import { isMacPlatform, matchesEvent, normalizeKey, parseChord } from "./keymap";
import type { KeyEventLike } from "./keymap";

const event = (key: string, modifiers: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...modifiers,
});

describe("normalizeKey", () => {
  it("lowercases letters and named keys", () => {
    expect(normalizeKey("P")).toBe("p");
    expect(normalizeKey("ArrowUp")).toBe("arrowup");
  });

  it("maps aliases to canonical names", () => {
    expect(normalizeKey(" ")).toBe("space");
    expect(normalizeKey("Esc")).toBe("escape");
    expect(normalizeKey("Return")).toBe("enter");
    expect(normalizeKey("Del")).toBe("delete");
  });
});

describe("parseChord", () => {
  it("maps Mod to Ctrl on windows and linux", () => {
    expect(parseChord("Mod+Shift+p")).toEqual({
      key: "p",
      ctrl: true,
      shift: true,
      alt: false,
      meta: false,
    });
  });

  it("maps Mod to Meta on mac", () => {
    expect(parseChord("Mod+Shift+p", true)).toEqual({
      key: "p",
      ctrl: false,
      shift: true,
      alt: false,
      meta: true,
    });
  });

  it("accepts cmd and super as meta", () => {
    expect(parseChord("Cmd+k").meta).toBe(true);
    expect(parseChord("Super+k").meta).toBe(true);
  });

  it("rejects chords without a key", () => {
    expect(() => parseChord("Mod+Shift")).toThrow(/invalid chord/);
  });
});

describe("matchesEvent", () => {
  it("matches letters case-insensitively", () => {
    expect(matchesEvent(event("P", { ctrlKey: true, shiftKey: true }), "Ctrl+Shift+P")).toBe(true);
  });

  it("requires exact modifier state", () => {
    expect(matchesEvent(event("p", { ctrlKey: true }), "Ctrl+P")).toBe(true);
    expect(matchesEvent(event("p", { ctrlKey: true, shiftKey: true }), "Ctrl+P")).toBe(false);
    expect(matchesEvent(event("p", { ctrlKey: true, altKey: true }), "Ctrl+P")).toBe(false);
  });

  it("resolves Mod per platform", () => {
    const macEvent = event("p", { metaKey: true });
    expect(matchesEvent(macEvent, "Mod+p", true)).toBe(true);
    expect(matchesEvent(macEvent, "Mod+p", false)).toBe(false);
  });

  it("matches aliased keys", () => {
    expect(matchesEvent(event(" "), "Space")).toBe(true);
    expect(matchesEvent(event("Escape"), "Esc")).toBe(true);
    expect(matchesEvent(event("ArrowUp", { altKey: true }), "Alt+Up")).toBe(true);
  });
});

describe("isMacPlatform", () => {
  it("detects mac user agents", () => {
    expect(isMacPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(true);
    expect(isMacPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});
