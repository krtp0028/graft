import { describe, expect, it } from "vitest";
import type { FileMeta } from "./api";
import { DANGLING_PATH } from "./paths";
import { effectiveTags, resolveTargetRef, resolveVault } from "./resolver";
import type { TreeNode } from "./resolver";

interface MetaOptions {
  isDir?: boolean;
  parent?: string | null;
  alsoUnder?: string[];
  order?: number | null;
  tags?: string[];
}

const meta = (relPath: string, options: MetaOptions = {}): FileMeta => ({
  relPath,
  isDir: options.isDir ?? false,
  size: 1,
  modifiedMs: 0,
  frontmatter: {
    parent: options.parent ?? null,
    alsoUnder: options.alsoUnder ?? [],
    order: options.order ?? null,
    tags: options.tags ?? [],
    numbers: {},
  },
  metrics: { tasksOpen: 0, tasksDone: 0, words: 0, links: [] },
});

const find = (nodes: TreeNode[], relPath: string): TreeNode | undefined => {
  for (const node of nodes) {
    if (node.relPath === relPath) {
      return node;
    }
    const child = find(node.children, relPath);
    if (child) {
      return child;
    }
  }
  return undefined;
};

describe("resolveVault", () => {
  it("builds the filesystem tree with dirs first, ordered, then alphabetically", () => {
    const { roots } = resolveVault([
      meta("b.md"),
      meta("a.md", { order: 5 }),
      meta("docs", { isDir: true }),
      meta("docs/z.md"),
      meta("docs/a.md"),
    ]);

    expect(roots.map((node) => node.name)).toEqual(["docs", "a.md", "b.md"]);
    expect(roots[0].children.map((node) => node.name)).toEqual(["a.md", "z.md"]);
  });

  it("re-parents notes through frontmatter", () => {
    const { roots } = resolveVault([
      meta("Projects", { isDir: true }),
      meta("Projects/Alpha", { isDir: true }),
      meta("loose.md", { parent: "Projects/Alpha" }),
    ]);

    const alpha = find(roots, "Projects/Alpha");
    expect(alpha?.children.map((node) => node.name)).toEqual(["loose.md"]);
    expect(roots.some((node) => node.relPath === "loose.md")).toBe(false);
    expect(find(roots, "loose.md")).toBeDefined();
  });

  it("resolves parent references without the .md extension", () => {
    const byPath = new Map([["Alpha.md", meta("Alpha.md")]]);
    expect(resolveTargetRef(byPath, "Alpha")).toBe("Alpha.md");
    expect(resolveTargetRef(byPath, "Missing")).toBeNull();
  });

  it("shows also_under placements as mirrors with placement lists", () => {
    const { roots } = resolveVault([
      meta("Topics", { isDir: true }),
      meta("ref.md", { alsoUnder: ["Topics"] }),
    ]);

    const topics = find(roots, "Topics");
    const mirror = topics?.children.find((node) => node.mirror);
    expect(mirror?.openPath).toBe("ref.md");
    expect(mirror?.placements).toEqual(["ref.md", "Topics"]);

    const canonical = find(roots, "ref.md");
    expect(canonical?.placements).toEqual(["ref.md", "Topics"]);
    expect(canonical?.mirror).toBe(false);
  });

  it("routes unresolved parents and mirrors to the dangling node", () => {
    const { roots } = resolveVault([
      meta("orphan.md", { parent: "No/Such/Place" }),
      meta("ref.md", { alsoUnder: ["Missing"] }),
    ]);

    const dangling = roots.find((node) => node.relPath === DANGLING_PATH);
    expect(dangling).toBeDefined();
    expect(find(roots, "orphan.md")?.dangling).toBe(true);
    expect(dangling?.children.some((node) => node.mirror)).toBe(true);
  });

  it("detects cycles, flags them, and keeps the tree usable", () => {
    const { roots } = resolveVault([meta("a.md", { parent: "b" }), meta("b.md", { parent: "a" })]);

    expect(find(roots, "a.md")?.cycle).toBe(true);
    expect(find(roots, "b.md")?.cycle).toBe(true);
    expect(roots.length).toBe(2);
  });
});

describe("effectiveTags", () => {
  it("inherits tags from branch notes along the canonical chain", () => {
    const entries = [
      meta("Docs", { isDir: true }),
      meta("Docs.md", { tags: ["project-alpha"] }),
      meta("Docs/note.md", { tags: ["child"] }),
    ];
    const byPath = new Map(entries.map((entry) => [entry.relPath, entry]));
    const { parentOf } = resolveVault(entries);

    const result = effectiveTags("Docs/note.md", byPath, parentOf);

    expect(result.tags).toEqual(["child", "project-alpha"]);
    expect(result.sources.get("project-alpha")).toBe("Docs.md");
    expect(result.sources.get("child")).toBe("Docs/note.md");
  });

  it("does not propagate through mirrors", () => {
    const entries = [
      meta("Topics", { isDir: true }),
      meta("loose.md", { alsoUnder: ["Topics"], tags: ["own"] }),
      meta("Topics.md", { tags: ["topic-tag"] }),
    ];
    const byPath = new Map(entries.map((entry) => [entry.relPath, entry]));
    const { parentOf } = resolveVault(entries);

    const result = effectiveTags("loose.md", byPath, parentOf);

    expect(result.tags).toEqual(["own"]);
  });
});
