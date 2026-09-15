import { invoke } from "@tauri-apps/api/core";

export interface Frontmatter {
  parent: string | null;
  alsoUnder: string[];
  order: number | null;
  tags: string[];
  numbers: Record<string, number>;
}

export interface FileMetrics {
  tasksOpen: number;
  tasksDone: number;
  words: number;
  links: string[];
}

export interface FileMeta {
  relPath: string;
  isDir: boolean;
  size: number;
  modifiedMs: number;
  frontmatter: Frontmatter;
  metrics: FileMetrics;
}

export function scanVault(root: string): Promise<FileMeta[]> {
  return invoke("vault_scan", { root });
}

export function readFile(root: string, relPath: string): Promise<string> {
  return invoke("vault_read_file", { root, relPath });
}

export function writeFile(root: string, relPath: string, contents: string): Promise<void> {
  return invoke("vault_write_file", { root, relPath, contents });
}

export function createDir(root: string, relPath: string): Promise<void> {
  return invoke("vault_create_dir", { root, relPath });
}

export function renamePath(root: string, from: string, to: string): Promise<void> {
  return invoke("vault_rename", { root, from, to });
}

export function duplicatePath(root: string, from: string, to: string): Promise<void> {
  return invoke("vault_duplicate", { root, from, to });
}

export function trashPath(root: string, relPath: string): Promise<string> {
  return invoke("vault_trash", { root, relPath });
}

export function restoreTrash(root: string, trashId: string): Promise<string> {
  return invoke("vault_restore", { root, trashId });
}

export function watchVault(root: string): Promise<void> {
  return invoke("watch_vault", { root });
}

export interface SearchHit {
  relPath: string;
  line: number;
  text: string;
}

export function searchVault(root: string, query: string, limit: number): Promise<SearchHit[]> {
  return invoke("vault_search", { root, query, limit });
}

export interface LuaCommandMeta {
  name: string;
  description: string;
}

export interface LuaKeymap {
  chord: string;
  command: string;
  context: string;
}

export function luaReload(dir: string): Promise<void> {
  return invoke("lua_reload", { dir });
}

export function luaCommands(): Promise<LuaCommandMeta[]> {
  return invoke("lua_commands");
}

export function luaKeymaps(): Promise<LuaKeymap[]> {
  return invoke("lua_keymaps");
}

export function luaRun(name: string): Promise<string | null> {
  return invoke("lua_run", { name });
}

export function luaHook(event: string, payload: string): Promise<string | null> {
  return invoke("lua_hook", { event, payload });
}

export function luaDrainMessages(): Promise<string[]> {
  return invoke("lua_drain_messages");
}

export interface ConfigPaths {
  configFile: string;
  themesDir: string;
  customCss: string;
  vaultConfigFile: string | null;
}

export function configPaths(root: string | null): Promise<ConfigPaths> {
  return invoke("config_paths", { root });
}

export function configRead(path: string, root: string | null): Promise<string | null> {
  return invoke("config_read", { path, root });
}

export function configWrite(path: string, contents: string, root: string | null): Promise<void> {
  return invoke("config_write", { path, contents, root });
}

export function configEnsure(path: string, starter: string, root: string | null): Promise<string> {
  return invoke("config_ensure", { path, starter, root });
}

export function themesList(dir: string): Promise<string[]> {
  return invoke("themes_list", { dir });
}

export function openExternal(path: string): Promise<void> {
  return invoke("open_external", { path });
}
