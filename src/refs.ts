import * as api from "./api";
import { upsertFrontmatter } from "./frontmatter";
import { baseName } from "./paths";

function pathVariants(path: string): string[] {
  const name = baseName(path);
  return [path, path.replace(/\.md$/i, ""), name, name.replace(/\.md$/i, "")];
}

function matchesPath(value: string | null, oldPath: string): boolean {
  if (value === null) {
    return false;
  }
  return pathVariants(oldPath).includes(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceWikiLinks(contents: string, oldPath: string, newPath: string): string {
  const replacement = newPath.replace(/\.md$/i, "");
  let updated = contents;
  for (const variant of pathVariants(oldPath)) {
    const pattern = new RegExp(`\\[\\[${escapeRegExp(variant)}(\\|[^\\]]*)?\\]\\]`, "g");
    updated = updated.replace(pattern, (_match, alias: string | undefined) => {
      return `[[${replacement}${alias ?? ""}]]`;
    });
  }
  return updated;
}

export async function rewriteReferences(
  root: string,
  entries: api.FileMeta[],
  oldPath: string,
  newPath: string,
): Promise<number> {
  let rewritten = 0;
  for (const entry of entries) {
    if (entry.isDir) {
      continue;
    }
    const parentMatch = matchesPath(entry.frontmatter.parent, oldPath);
    const mirrorMatch = entry.frontmatter.alsoUnder.some((value) => matchesPath(value, oldPath));
    const linkMatch = entry.metrics.links.some((link) => matchesPath(link, oldPath));
    if (!parentMatch && !mirrorMatch && !linkMatch) {
      continue;
    }

    const contents = await api.readFile(root, entry.relPath);
    const changes: Record<string, string | string[] | null> = {};
    if (parentMatch) {
      changes.parent = newPath.replace(/\.md$/i, "");
    }
    if (mirrorMatch) {
      changes.also_under = entry.frontmatter.alsoUnder.map((value) =>
        matchesPath(value, oldPath) ? newPath.replace(/\.md$/i, "") : value,
      );
    }

    let updated = Object.keys(changes).length > 0 ? upsertFrontmatter(contents, changes) : contents;
    if (linkMatch) {
      updated = replaceWikiLinks(updated, oldPath, newPath);
    }
    await api.writeFile(root, entry.relPath, updated);
    rewritten += 1;
  }
  return rewritten;
}
