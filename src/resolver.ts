import type { FileMeta } from "./api";
import { baseName, cleanTarget, DANGLING_PATH, parentDir } from "./paths";

export interface TreeNode {
  name: string;
  relPath: string;
  openPath: string;
  isDir: boolean;
  children: TreeNode[];
  mirror: boolean;
  cycle: boolean;
  dangling: boolean;
  order: number | null;
  placements: string[];
}

export interface ResolveResult {
  roots: TreeNode[];
  parentOf: Map<string, string | null>;
}

export function resolveTargetRef(byPath: Map<string, FileMeta>, value: string): string | null {
  const cleaned = cleanTarget(value);
  if (cleaned === "") {
    return null;
  }
  if (byPath.has(cleaned)) {
    return cleaned;
  }
  const withExtension = `${cleaned}.md`;
  return byPath.has(withExtension) ? withExtension : null;
}

export function resolveVault(entries: FileMeta[]): ResolveResult {
  const byPath = new Map(entries.map((entry) => [entry.relPath, entry]));
  const parentOf = new Map<string, string | null>();
  const danglingFiles = new Set<string>();

  for (const entry of entries) {
    if (entry.isDir) {
      parentOf.set(entry.relPath, parentDir(entry.relPath));
      continue;
    }
    const declared = entry.frontmatter.parent;
    if (declared) {
      const target = resolveTargetRef(byPath, declared);
      if (target) {
        parentOf.set(entry.relPath, target);
      } else {
        parentOf.set(entry.relPath, DANGLING_PATH);
        danglingFiles.add(entry.relPath);
      }
    } else {
      parentOf.set(entry.relPath, parentDir(entry.relPath));
    }
  }

  const state = new Map<string, 1 | 2>();
  const cycleMembers = new Set<string>();
  for (const start of parentOf.keys()) {
    if (state.get(start) === 2) {
      continue;
    }
    const stack: string[] = [];
    let current: string | null = start;
    while (current !== null && state.get(current) !== 2) {
      if (state.get(current) === 1) {
        for (const member of stack.slice(stack.indexOf(current))) {
          cycleMembers.add(member);
        }
        break;
      }
      state.set(current, 1);
      stack.push(current);
      const next = parentOf.get(current);
      current = next === DANGLING_PATH ? null : (next ?? null);
    }
    for (const member of stack) {
      state.set(member, 2);
    }
  }
  for (const member of cycleMembers) {
    parentOf.set(member, parentDir(member));
  }

  const nodes = new Map<string, TreeNode>();
  for (const entry of entries) {
    nodes.set(entry.relPath, {
      name: baseName(entry.relPath),
      relPath: entry.relPath,
      openPath: entry.relPath,
      isDir: entry.isDir,
      children: [],
      mirror: false,
      cycle: cycleMembers.has(entry.relPath),
      dangling: danglingFiles.has(entry.relPath),
      order: entry.frontmatter.order,
      placements: [],
    });
  }

  const danglingNode: TreeNode = {
    name: "Dangling",
    relPath: DANGLING_PATH,
    openPath: "",
    isDir: true,
    children: [],
    mirror: false,
    cycle: false,
    dangling: true,
    order: null,
    placements: [],
  };
  let danglingUsed = false;

  const roots: TreeNode[] = [];
  for (const entry of entries) {
    const node = nodes.get(entry.relPath);
    if (!node) {
      continue;
    }
    const parent = parentOf.get(entry.relPath) ?? null;
    if (parent === null) {
      roots.push(node);
    } else if (parent === DANGLING_PATH) {
      danglingUsed = true;
      danglingNode.children.push(node);
    } else {
      const parentNode = nodes.get(parent);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  const placements = new Map<string, string[]>();
  const addPlacement = (path: string, place: string): void => {
    const list = placements.get(path) ?? [];
    list.push(place);
    placements.set(path, list);
  };

  for (const entry of entries) {
    if (entry.isDir) {
      continue;
    }
    addPlacement(entry.relPath, entry.relPath);
    for (const [index, raw] of entry.frontmatter.alsoUnder.entries()) {
      const key = `${entry.relPath}::mirror::${index}`;
      const target = resolveTargetRef(byPath, raw);
      const mirror: TreeNode = {
        name: baseName(entry.relPath),
        relPath: key,
        openPath: entry.relPath,
        isDir: false,
        children: [],
        mirror: true,
        cycle: false,
        dangling: target === null,
        order: entry.frontmatter.order,
        placements: [],
      };
      if (target === null) {
        danglingUsed = true;
        danglingNode.children.push(mirror);
        addPlacement(entry.relPath, "dangling");
      } else {
        const host = nodes.get(target);
        if (host) {
          host.children.push(mirror);
        } else {
          roots.push(mirror);
        }
        addPlacement(entry.relPath, target);
      }
    }
  }

  if (danglingUsed) {
    roots.push(danglingNode);
  }

  const assignPlacements = (list: TreeNode[]): void => {
    for (const node of list) {
      node.placements = placements.get(node.openPath) ?? [node.openPath];
      assignPlacements(node.children);
    }
  };
  assignPlacements(roots);
  sortNodes(roots);

  return { roots, parentOf };
}

export function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    const orderA = a.order ?? Number.POSITIVE_INFINITY;
    const orderB = b.order ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    sortNodes(node.children);
  }
}

export interface EffectiveTags {
  tags: string[];
  sources: Map<string, string>;
}

export function effectiveTags(
  filePath: string,
  byPath: Map<string, FileMeta>,
  parentOf: Map<string, string | null>,
): EffectiveTags {
  const tags: string[] = [];
  const sources = new Map<string, string>();
  const seen = new Set<string>();

  const addTags = (from: string, list: string[]): void => {
    for (const raw of list) {
      const tag = raw.trim();
      if (tag === "" || seen.has(tag)) {
        continue;
      }
      seen.add(tag);
      tags.push(tag);
      sources.set(tag, from);
    }
  };

  const own = byPath.get(filePath);
  if (!own) {
    return { tags, sources };
  }
  addTags(own.relPath, own.frontmatter.tags);

  let current: string | null = parentOf.get(filePath) ?? null;
  const visited = new Set<string>([filePath]);
  while (current !== null && !visited.has(current)) {
    visited.add(current);
    const ancestor = byPath.get(current);
    if (!ancestor) {
      break;
    }
    if (ancestor.isDir) {
      const branch = byPath.get(`${current}.md`);
      if (branch) {
        addTags(branch.relPath, branch.frontmatter.tags);
      }
    } else {
      addTags(ancestor.relPath, ancestor.frontmatter.tags);
    }
    current = parentOf.get(current) ?? null;
  }

  return { tags, sources };
}
