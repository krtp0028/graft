import { describe, expect, it } from "vitest";
import { upsertFrontmatter } from "./frontmatter";

describe("upsertFrontmatter", () => {
  it("prepends a block when none exists", () => {
    expect(upsertFrontmatter("# Title\nbody", { parent: "Projects/Alpha" })).toBe(
      "---\nparent: Projects/Alpha\n---\n# Title\nbody",
    );
  });

  it("updates existing keys without touching the body", () => {
    const contents = "---\nparent: Old\ntags: [a]\n---\n# Title\n";
    expect(upsertFrontmatter(contents, { parent: "New/Path" })).toBe(
      "---\nparent: New/Path\ntags: [a]\n---\n# Title\n",
    );
  });

  it("removes keys with null and drops an empty block", () => {
    expect(upsertFrontmatter("---\nparent: Old\n---\nbody", { parent: null })).toBe("body");
  });

  it("serializes arrays and numbers", () => {
    expect(upsertFrontmatter("body", { also_under: ["A/B", "C/D"], order: 3 })).toBe(
      "---\nalso_under: [A/B, C/D]\norder: 3\n---\nbody",
    );
  });

  it("quotes values containing colons", () => {
    expect(upsertFrontmatter("body", { parent: "Weird:Path" })).toBe(
      '---\nparent: "Weird:Path"\n---\nbody',
    );
  });

  it("stores node color and icon", () => {
    expect(upsertFrontmatter("body", { color: "#c0392b", icon: "*" })).toBe(
      "---\ncolor: #c0392b\nicon: *\n---\nbody",
    );
  });

  it("clears color and icon with null", () => {
    const contents = "---\ncolor: #fff\nicon: x\ntags: [a]\n---\nbody";
    expect(upsertFrontmatter(contents, { color: null, icon: null })).toBe(
      "---\ntags: [a]\n---\nbody",
    );
  });
});
