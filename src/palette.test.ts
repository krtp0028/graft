import { describe, expect, it } from "vitest";
import { fuzzyMatch } from "./palette";

describe("fuzzyMatch", () => {
  it("matches subsequences case-insensitively", () => {
    expect(fuzzyMatch("cyc", "Cycle preview position")).toBe(true);
    expect(fuzzyMatch("CYC", "cycle preview position")).toBe(true);
  });

  it("matches everything for an empty query", () => {
    expect(fuzzyMatch("", "anything")).toBe(true);
  });

  it("rejects out-of-order or missing characters", () => {
    expect(fuzzyMatch("preview cycle", "cycle preview")).toBe(false);
    expect(fuzzyMatch("zzz", "cycle preview")).toBe(false);
  });
});
