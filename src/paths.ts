export const DANGLING_PATH = "__dangling__";

export function parentDir(relPath: string): string | null {
  const slash = relPath.lastIndexOf("/");
  return slash === -1 ? null : relPath.slice(0, slash);
}

export function baseName(relPath: string): string {
  return relPath.split("/").at(-1) ?? relPath;
}

export function cleanTarget(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "");
}
