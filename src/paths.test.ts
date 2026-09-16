import { describe, expect, it } from "vitest";
import { resolveRelative } from "./paths";

describe("resolveRelative", () => {
  it("resolves simple relative paths", () => {
    expect(resolveRelative(null, "assets/a.png")).toBe("assets/a.png");
    expect(resolveRelative("docs", "a.png")).toBe("docs/a.png");
    expect(resolveRelative("docs/notes", "./a.png")).toBe("docs/notes/a.png");
  });

  it("walks up parent segments", () => {
    expect(resolveRelative("docs/notes", "../assets/a.png")).toBe("docs/assets/a.png");
    expect(resolveRelative("docs/notes", "../../assets/a.png")).toBe("assets/a.png");
  });

  it("rejects paths escaping the vault", () => {
    expect(resolveRelative(null, "../secret.png")).toBeNull();
    expect(resolveRelative("docs/notes", "../../../secret.png")).toBeNull();
  });

  it("allows walking up to the vault root", () => {
    expect(resolveRelative("docs", "../secret.png")).toBe("secret.png");
  });

  it("ignores empty and current segments", () => {
    expect(resolveRelative("docs", "//a//b.png")).toBe("docs/a/b.png");
    expect(resolveRelative(null, "")).toBe("");
  });
});
