import { describe, expect, it } from "vitest";
import type { FileMeta } from "./api";
import type { TreeNode } from "./resolver";
import { computeRollups } from "./rollup";

const node = (
  relPath: string,
  isDir: boolean,
  children: TreeNode[] = [],
  openPath?: string,
): TreeNode => ({
  name: relPath.split("/").at(-1) ?? relPath,
  relPath,
  openPath: openPath ?? (isDir ? "" : relPath),
  isDir,
  children,
  mirror: false,
  cycle: false,
  dangling: false,
  order: null,
  placements: [relPath],
  color: null,
  icon: null,
});

const entry = (relPath: string, open: number, done: number, hours: number | null): FileMeta => ({
  relPath,
  isDir: false,
  size: 1,
  modifiedMs: 0,
  frontmatter: {
    parent: null,
    alsoUnder: [],
    order: null,
    tags: [],
    color: null,
    icon: null,
    numbers: hours === null ? {} : { hours },
  },
  metrics: { tasksOpen: open, tasksDone: done, words: 10, links: [], tasks: [], images: [] },
});

describe("computeRollups", () => {
  it("aggregates tasks, words, and numeric fields bottom-up", () => {
    const roots = [
      node("Projects", true, [
        node("Projects/a.md", false),
        node("Projects/Sub", true, [node("Projects/Sub/b.md", false)]),
      ]),
    ];
    const byPath = new Map([
      ["Projects/a.md", entry("Projects/a.md", 2, 1, 4)],
      ["Projects/Sub/b.md", entry("Projects/Sub/b.md", 1, 3, 6)],
    ]);

    const rollups = computeRollups(roots, byPath, ["hours"]);

    expect(rollups.get("Projects/a.md")).toMatchObject({ open: 2, done: 1, words: 10 });
    expect(rollups.get("Projects/Sub/b.md")).toMatchObject({ open: 1, done: 3, words: 10 });
    const projectAggregate = rollups.get("Projects");
    expect(projectAggregate?.open).toBe(3);
    expect(projectAggregate?.done).toBe(4);
    expect(projectAggregate?.words).toBe(20);
    expect(projectAggregate?.sums.hours).toBe(10);
  });

  it("does not double count mirrors", () => {
    const canonical = node("ref.md", false);
    const mirror: TreeNode = { ...node("ref.md::mirror::0", false, [], "ref.md"), mirror: true };
    const roots = [canonical, node("Topics", true, [mirror])];
    const byPath = new Map([["ref.md", entry("ref.md", 2, 0, 0)]]);

    const rollups = computeRollups(roots, byPath, []);

    expect(rollups.get("ref.md")?.open).toBe(2);
    expect(rollups.get("Topics")?.open).toBe(0);
  });
});
