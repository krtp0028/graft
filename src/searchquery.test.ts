import { describe, expect, it } from "vitest";
import { hasTextSearch, matchesMetadata, matchesText, parseSearchQuery } from "./searchquery";
import type { FileMeta } from "./api";

const entry = (relPath: string, tasksOpen = 0): FileMeta => ({
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
    numbers: {},
  },
  metrics: { tasksOpen, tasksDone: 0, words: 0, links: [], tasks: [], images: [] },
});

describe("parseSearchQuery", () => {
  it("parses terms, phrases, and filters", () => {
    const query = parseSearchQuery(
      'postgres "window function" tag:alpha #beta path:Projects task:open',
    );
    expect(query.terms).toEqual(["postgres"]);
    expect(query.phrases).toEqual(["window function"]);
    expect(query.tags).toEqual(["alpha", "beta"]);
    expect(query.paths).toEqual(["projects"]);
    expect(query.taskOpen).toBe(true);
    expect(hasTextSearch(query)).toBe(true);
  });

  it("treats bare filter-only queries as metadata searches", () => {
    const query = parseSearchQuery("tag:alpha");
    expect(hasTextSearch(query)).toBe(false);
  });
});

describe("matchesText", () => {
  it("requires all terms and phrases", () => {
    const query = parseSearchQuery('alpha "beta gamma"');
    expect(matchesText("early Alpha and beta gamma here", query)).toBe(true);
    expect(matchesText("Alpha only", query)).toBe(false);
  });
});

describe("matchesMetadata", () => {
  it("checks paths, tags, and open tasks", () => {
    const query = parseSearchQuery("tag:alpha path:docs task:open");
    expect(matchesMetadata(entry("docs/a.md", 2), ["alpha"], query)).toBe(true);
    expect(matchesMetadata(entry("docs/a.md", 0), ["alpha"], query)).toBe(false);
    expect(matchesMetadata(entry("other/a.md", 2), ["alpha"], query)).toBe(false);
    expect(matchesMetadata(entry("docs/a.md", 2), [], query)).toBe(false);
  });
});
