import { describe, expect, it } from "vitest";
import type { TreeNode } from "./resolver";
import { visibleNodes } from "./tree";

const node = (relPath: string, isDir: boolean, children: TreeNode[] = []): TreeNode => ({
  name: relPath.split("/").at(-1) ?? relPath,
  relPath,
  openPath: isDir ? "" : relPath,
  isDir,
  children,
  mirror: false,
  cycle: false,
  dangling: false,
  order: null,
  placements: [relPath],
});

describe("visibleNodes", () => {
  const roots = [node("docs", true, [node("docs/a.md", false)]), node("root.md", false)];

  it("only includes children of expanded directories", () => {
    expect(visibleNodes(roots, new Set()).map((item) => item.relPath)).toEqual(["docs", "root.md"]);
  });

  it("includes children when a directory is expanded", () => {
    expect(visibleNodes(roots, new Set(["docs"])).map((item) => item.relPath)).toEqual([
      "docs",
      "docs/a.md",
      "root.md",
    ]);
  });
});
