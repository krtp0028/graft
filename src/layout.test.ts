import { describe, expect, it } from "vitest";
import { isPreviewPosition, nextPreviewPosition, PREVIEW_POSITIONS } from "./layout";
import type { PreviewPosition } from "./layout";

describe("nextPreviewPosition", () => {
  it("cycles hidden -> right -> bottom -> top -> left -> hidden", () => {
    expect(nextPreviewPosition("hidden")).toBe("right");
    expect(nextPreviewPosition("right")).toBe("bottom");
    expect(nextPreviewPosition("bottom")).toBe("top");
    expect(nextPreviewPosition("top")).toBe("left");
    expect(nextPreviewPosition("left")).toBe("hidden");
  });

  it("returns to the start after a full cycle", () => {
    let position: PreviewPosition = "hidden";
    for (let step = 0; step < PREVIEW_POSITIONS.length; step += 1) {
      position = nextPreviewPosition(position);
    }
    expect(position).toBe("hidden");
  });
});

describe("isPreviewPosition", () => {
  it("accepts known positions", () => {
    for (const position of PREVIEW_POSITIONS) {
      expect(isPreviewPosition(position)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isPreviewPosition("middle")).toBe(false);
    expect(isPreviewPosition("")).toBe(false);
  });
});
