import type { FileMeta } from "./api";

export interface SearchQuery {
  terms: string[];
  phrases: string[];
  tags: string[];
  paths: string[];
  taskOpen: boolean;
  raw: string;
}

export function parseSearchQuery(raw: string): SearchQuery {
  const terms: string[] = [];
  const phrases: string[] = [];
  const tags: string[] = [];
  const paths: string[] = [];
  let taskOpen = false;

  const tokenPattern = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(raw)) !== null) {
    if (match[1] !== undefined) {
      if (match[1].trim() !== "") {
        phrases.push(match[1].toLowerCase());
      }
      continue;
    }
    const token = match[2];
    const lower = token.toLowerCase();
    if (token.startsWith("#") && token.length > 1) {
      tags.push(token.slice(1));
    } else if (lower.startsWith("tag:") && token.length > 4) {
      tags.push(token.slice(4));
    } else if (lower.startsWith("path:") && token.length > 5) {
      paths.push(token.slice(5).toLowerCase());
    } else if (lower === "task:open") {
      taskOpen = true;
    } else {
      terms.push(lower);
    }
  }

  return { terms, phrases, tags, paths, taskOpen, raw };
}

export function hasTextSearch(query: SearchQuery): boolean {
  return query.terms.length + query.phrases.length > 0;
}

export function matchesText(text: string, query: SearchQuery): boolean {
  const lower = text.toLowerCase();
  return (
    query.terms.every((term) => lower.includes(term)) &&
    query.phrases.every((phrase) => lower.includes(phrase))
  );
}

export function matchesMetadata(
  entry: FileMeta,
  effectiveTagList: string[],
  query: SearchQuery,
): boolean {
  if (
    query.paths.length > 0 &&
    !query.paths.every((path) => entry.relPath.toLowerCase().includes(path))
  ) {
    return false;
  }
  if (query.taskOpen && entry.metrics.tasksOpen === 0) {
    return false;
  }
  if (query.tags.length > 0 && !query.tags.every((tag) => effectiveTagList.includes(tag))) {
    return false;
  }
  return true;
}
