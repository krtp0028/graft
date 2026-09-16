import * as api from "./api";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { commands } from "./commands";
import { config } from "./config";
import { createEditor } from "./editor";
import { openHealthPanel } from "./health";
import { DEFAULT_KEYMAP, isMacPlatform, matchesEvent } from "./keymap";
import type { KeyBinding } from "./keymap";
import { isPreviewPosition, nextPreviewPosition } from "./layout";
import type { PreviewPosition } from "./layout";
import { LuaController } from "./lua";
import { CommandPalette } from "./palette";
import { baseName, parentDir } from "./paths";
import { createPreview } from "./preview";
import { promptText } from "./prompt";
import { QuickOpen } from "./quickopen";
import { rewriteReferences } from "./refs";
import { effectiveTags, resolveVault } from "./resolver";
import { SearchUi } from "./searchui";
import { computeRollups } from "./rollup";
import { VaultStore } from "./store";
import { upsertFrontmatter } from "./frontmatter";
import { ThemeController } from "./theme";
import { TreeView } from "./tree";
import { UndoStack } from "./undo";

export function mountShell(root: HTMLElement): void {
  const store = new VaultStore();
  const isMac = isMacPlatform();
  const themeController = new ThemeController();

  const app = el("div", "app");
  const topbar = el("header", "topbar");
  const brand = el("span", "brand");
  brand.textContent = "Graft";
  const openButton = el("button", "button");
  openButton.textContent = "Open Folder";
  const vaultPath = el("span", "vault-path");
  const tagChips = el("span", "tag-chips");
  const filterBadge = el("span", "filter-badge");
  filterBadge.hidden = true;
  const notice = el("span", "notice");
  notice.hidden = true;
  const spacer = el("span", "spacer");
  const dirty = el("span", "dirty");
  dirty.textContent = "●";
  dirty.title = "Unsaved changes";
  dirty.hidden = true;
  const configButton = el("button", "button");
  configButton.textContent = "Config";
  const previewButton = el("button", "button");
  topbar.append(
    brand,
    openButton,
    vaultPath,
    tagChips,
    filterBadge,
    notice,
    spacer,
    dirty,
    configButton,
    previewButton,
  );

  const errorBanner = el("div", "error-banner");
  errorBanner.hidden = true;

  const conflictBanner = el("div", "conflict-banner");
  conflictBanner.hidden = true;

  const tabBar = el("div", "tab-bar");
  tabBar.hidden = true;

  const workspace = el("div", "workspace");
  const sidebar = el("aside", "sidebar");
  const treeContainer = el("div", "tree-container");
  sidebar.append(treeContainer);

  const docArea = el("div", "doc-area");
  const editorPane = el("main", "editor-pane");
  const splitter = el("div", "splitter");
  const previewPane = el("section", "preview-pane");
  previewPane.textContent = "Open a note to see the preview";
  docArea.append(editorPane, splitter, previewPane);

  workspace.append(sidebar, docArea);
  app.append(topbar, tabBar, errorBanner, conflictBanner, workspace);
  root.replaceChildren(app);

  let previewPosition: PreviewPosition = "right";
  const applyPreviewPosition = (position: PreviewPosition): void => {
    previewPosition = position;
    docArea.dataset.preview = position;
    docArea.style.removeProperty("--preview-size");
    previewButton.textContent = `Preview: ${position[0].toUpperCase()}${position.slice(1)}`;
  };
  const cyclePreview = (): void => {
    applyPreviewPosition(nextPreviewPosition(previewPosition));
  };
  applyPreviewPosition(previewPosition);

  const editorView = createEditor(editorPane, store);
  createPreview(previewPane, store);

  let noticeTimer: number | undefined;
  const showNotice = (text: string): void => {
    notice.textContent = text;
    notice.hidden = false;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      notice.hidden = true;
    }, 5000);
  };
  const insertAtCursor = (text: string): void => {
    const range = editorView.state.selection.main;
    editorView.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: { anchor: range.from + text.length },
    });
    editorView.focus();
  };
  const lua = new LuaController(insertAtCursor, showNotice);

  const tree = new TreeView({
    container: treeContainer,
    onOpenFile: (relPath) => {
      void store.openFile(relPath);
    },
    onMove: (request) => {
      void applyMove(request.openPath, request.targetDir, request.mirror);
    },
    onReorder: (openPath, direction) => {
      void applyReorder(openPath, direction);
    },
    onFilterBadge: () => {
      setFilter("open tasks", tasksFilter);
    },
  });

  const applyMove = async (
    openPath: string,
    targetDir: string | null,
    mirror: boolean,
  ): Promise<void> => {
    const { root, entries } = store.getState();
    if (!root) {
      return;
    }
    const entry = entries.find((candidate) => candidate.relPath === openPath);
    if (!entry) {
      return;
    }
    const contents = await api.readFile(root, openPath);
    let next: string;
    if (mirror) {
      if (!targetDir || entry.frontmatter.alsoUnder.includes(targetDir)) {
        return;
      }
      next = upsertFrontmatter(contents, {
        also_under: [...entry.frontmatter.alsoUnder, targetDir],
      });
    } else {
      const physicalParent = parentDir(openPath);
      const value = targetDir === physicalParent ? null : targetDir;
      next = upsertFrontmatter(contents, { parent: value });
    }
    await api.writeFile(root, openPath, next);
    await store.refresh();
  };

  const applyReorder = async (openPath: string, direction: -1 | 1): Promise<void> => {
    const { root, entries } = store.getState();
    if (!root) {
      return;
    }
    const dir = parentDir(openPath);
    const siblings = entries
      .filter((entry) => !entry.isDir && parentDir(entry.relPath) === dir)
      .sort((a, b) => {
        const orderA = a.frontmatter.order ?? Number.POSITIVE_INFINITY;
        const orderB = b.frontmatter.order ?? Number.POSITIVE_INFINITY;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.relPath.localeCompare(b.relPath);
      });
    const index = siblings.findIndex((entry) => entry.relPath === openPath);
    const swapIndex = index + direction;
    if (index === -1 || swapIndex < 0 || swapIndex >= siblings.length) {
      return;
    }
    const reordered = [...siblings];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    for (const [position, entry] of reordered.entries()) {
      const nextOrder = (position + 1) * 10;
      if (entry.frontmatter.order !== nextOrder) {
        const contents = await api.readFile(root, entry.relPath);
        await api.writeFile(root, entry.relPath, upsertFrontmatter(contents, { order: nextOrder }));
      }
    }
    await store.refresh();
  };

  const undo = new UndoStack();
  let clipboard: { path: string; mode: "copy" | "cut" } | null = null;
  let currentByPath = new Map<string, api.FileMeta>();
  let currentParentOf = new Map<string, string | null>();
  let filterActive = false;

  const updateTagChips = (): void => {
    tagChips.replaceChildren();
    const { activePath } = store.getState();
    if (!activePath || currentByPath.size === 0) {
      return;
    }
    const { tags, sources } = effectiveTags(activePath, currentByPath, currentParentOf);
    const own = new Set(
      (currentByPath.get(activePath)?.frontmatter.tags ?? []).map((tag) => tag.trim()),
    );
    for (const tag of tags) {
      const chip = document.createElement("span");
      chip.className = own.has(tag) ? "tag" : "tag inherited";
      chip.textContent = tag;
      const source = sources.get(tag);
      if (source && !own.has(tag)) {
        chip.title = `inherited from ${source}`;
      }
      tagChips.append(chip);
    }
  };

  const refreshTreeData = (entries: api.FileMeta[]): void => {
    const resolved = resolveVault(entries);
    currentByPath = new Map(entries.map((entry) => [entry.relPath, entry]));
    currentParentOf = resolved.parentOf;
    tree.setRoots(resolved.roots);
    const rollupConfig = config.getState().config.rollup;
    tree.setRollups(
      computeRollups(resolved.roots, currentByPath, rollupConfig.fields),
      rollupConfig,
    );
    updateTagChips();
  };

  const setFilter = (label: string, match: ((openPath: string) => boolean) | null): void => {
    filterActive = match !== null;
    tree.setFilter(match);
    filterBadge.hidden = !filterActive;
    filterBadge.textContent = filterActive ? `Filter: ${label} (Esc clears)` : "";
  };

  const tasksFilter = (openPath: string): boolean =>
    (currentByPath.get(openPath)?.metrics.tasksOpen ?? 0) > 0;

  const selectedTarget = (): string | null => {
    const selected = tree.getSelected();
    if (!selected) {
      return null;
    }
    if (selected.isDir && selected.openPath === "") {
      return selected.relPath;
    }
    return selected.openPath === "" ? null : selected.openPath;
  };

  const selectedDir = (): string | null => {
    const target = selectedTarget();
    if (!target) {
      return null;
    }
    const selected = tree.getSelected();
    if (selected && selected.isDir && selected.openPath === "") {
      return target;
    }
    return parentDir(target);
  };

  const joinPath = (dir: string | null, name: string): string => (dir ? `${dir}/${name}` : name);

  const uniqueNodeName = (dir: string | null): string => {
    const existing = new Set(
      store
        .getState()
        .entries.filter((entry) => !entry.isDir && parentDir(entry.relPath) === dir)
        .map((entry) => baseName(entry.relPath)),
    );
    let candidate = "New Node.md";
    let counter = 2;
    while (existing.has(candidate)) {
      candidate = `New Node ${counter}.md`;
      counter += 1;
    }
    return candidate;
  };

  const assignOrders = async (orderedPaths: string[]): Promise<void> => {
    const { root, entries } = store.getState();
    if (!root) {
      return;
    }
    const byPath = new Map(entries.map((entry) => [entry.relPath, entry]));
    for (const [index, path] of orderedPaths.entries()) {
      const desired = (index + 1) * 10;
      const entry = byPath.get(path);
      if (entry && entry.frontmatter.order === desired) {
        continue;
      }
      const contents = await api.readFile(root, path);
      await api.writeFile(root, path, upsertFrontmatter(contents, { order: desired }));
    }
  };

  const addNode = async (mode: "sibling" | "child"): Promise<void> => {
    const { root } = store.getState();
    if (!root) {
      return;
    }
    const selected = tree.getSelected();
    const selectedFile =
      selected && !selected.isDir && selected.openPath !== "" ? selected.openPath : null;
    const selectedDir =
      selected && selected.isDir && selected.openPath === "" && selected.relPath !== "__dangling__"
        ? selected.relPath
        : null;

    let physicalDir: string | null = null;
    let parentValue: string | null = null;

    if (mode === "sibling") {
      if (selectedFile) {
        physicalDir = parentDir(selectedFile);
      } else if (selectedDir) {
        physicalDir = parentDir(selectedDir);
      }
    } else if (selectedDir) {
      physicalDir = selectedDir;
    } else if (selectedFile) {
      physicalDir = parentDir(selectedFile);
      parentValue = selectedFile.replace(/\.md$/i, "");
    }

    const fileName = uniqueNodeName(physicalDir);
    const relPath = joinPath(physicalDir, fileName);
    const title = fileName.replace(/\.md$/i, "");
    const hookFrontmatter = await lua.hook("new_note", relPath);

    let contents = `# ${title}\n`;
    if (hookFrontmatter) {
      contents = `${hookFrontmatter}\n${contents}`;
    }
    if (parentValue) {
      contents = upsertFrontmatter(contents, { parent: parentValue });
    }
    await api.writeFile(root, relPath, contents);
    undo.push({
      label: `add node ${relPath}`,
      run: async () => {
        await api.trashPath(root, relPath);
        await store.refresh();
      },
    });
    await store.refresh();

    if (mode === "sibling" && selectedFile) {
      const siblings = store
        .getState()
        .entries.filter((entry) => !entry.isDir && parentDir(entry.relPath) === physicalDir)
        .sort((a, b) => {
          const orderA = a.frontmatter.order ?? Number.POSITIVE_INFINITY;
          const orderB = b.frontmatter.order ?? Number.POSITIVE_INFINITY;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.relPath.localeCompare(b.relPath);
        })
        .map((entry) => entry.relPath)
        .filter((path) => path !== relPath);
      const index = siblings.indexOf(selectedFile);
      if (index !== -1) {
        const ordered = [...siblings];
        ordered.splice(index + 1, 0, relPath);
        await assignOrders(ordered);
        await store.refresh();
      }
    }

    await store.openFile(relPath);
  };

  commands.register({
    id: "tree.add_node",
    title: "Add node (after selected)",
    run: () => addNode("sibling"),
  });

  commands.register({
    id: "tree.add_child_node",
    title: "Add child node",
    run: () => addNode("child"),
  });

  commands.register({
    id: "tree.new_folder",
    title: "New folder",
    run: async () => {
      const { root } = store.getState();
      if (!root) {
        return;
      }
      const name = await promptText(app, {
        title: "New folder name",
        initial: "folder",
        confirmLabel: "Create",
      });
      if (!name) {
        return;
      }
      const relPath = joinPath(selectedDir(), name);
      await api.createDir(root, relPath);
      undo.push({
        label: `new folder ${relPath}`,
        run: async () => {
          await api.trashPath(root, relPath);
          await store.refresh();
        },
      });
      await store.refresh();
    },
  });

  commands.register({
    id: "tree.rename",
    title: "Rename",
    run: async () => {
      const { root } = store.getState();
      const target = selectedTarget();
      if (!root || !target) {
        return;
      }
      const currentName = baseName(target);
      const name = await promptText(app, {
        title: `Rename ${currentName}`,
        initial: currentName,
        confirmLabel: "Rename",
      });
      if (!name || name === currentName) {
        return;
      }
      const to = joinPath(parentDir(target), name);
      const entries = store.getState().entries;
      await api.renamePath(root, target, to);
      await rewriteReferences(root, entries, target, to);
      undo.push({
        label: `rename ${target}`,
        run: async () => {
          await api.renamePath(root, to, target);
          await rewriteReferences(root, store.getState().entries, to, target);
          await store.refresh();
        },
      });
      const active = store.getState().activePath;
      if (active === target) {
        await store.openFile(to);
      } else if (active !== null && active.startsWith(`${target}/`)) {
        store.clearActive();
      }
      await store.refresh();
    },
  });

  commands.register({
    id: "tree.duplicate",
    title: "Duplicate note",
    run: async () => {
      const { root } = store.getState();
      const selected = tree.getSelected();
      if (!root || !selected || selected.isDir || selected.openPath === "") {
        return;
      }
      const from = selected.openPath;
      const name = baseName(from);
      const dot = name.lastIndexOf(".");
      const duplicateName =
        dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`;
      const to = joinPath(parentDir(from), duplicateName);
      await api.duplicatePath(root, from, to);
      undo.push({
        label: `duplicate ${from}`,
        run: async () => {
          await api.trashPath(root, to);
          await store.refresh();
        },
      });
      await store.refresh();
    },
  });

  commands.register({
    id: "tree.delete",
    title: "Move to trash",
    run: async () => {
      const { root } = store.getState();
      const target = selectedTarget();
      if (!root || !target) {
        return;
      }
      const trashId = await api.trashPath(root, target);
      undo.push({
        label: `delete ${target}`,
        run: async () => {
          await api.restoreTrash(root, trashId);
          await store.refresh();
        },
      });
      const active = store.getState().activePath;
      if (active === target || (active !== null && active.startsWith(`${target}/`))) {
        store.clearActive();
      }
      await store.refresh();
    },
  });

  commands.register({
    id: "tree.copy",
    title: "Copy",
    run: () => {
      const target = selectedTarget();
      if (target) {
        clipboard = { path: target, mode: "copy" };
      }
    },
  });

  commands.register({
    id: "tree.cut",
    title: "Cut",
    run: () => {
      const target = selectedTarget();
      if (target) {
        clipboard = { path: target, mode: "cut" };
      }
    },
  });

  commands.register({
    id: "tree.paste",
    title: "Paste",
    run: async () => {
      const { root } = store.getState();
      const source = clipboard;
      if (!root || !source) {
        return;
      }
      const to = joinPath(selectedDir(), baseName(source.path));
      if (to === source.path) {
        return;
      }
      if (source.mode === "copy") {
        await api.duplicatePath(root, source.path, to);
        undo.push({
          label: `paste ${to}`,
          run: async () => {
            await api.trashPath(root, to);
            await store.refresh();
          },
        });
      } else {
        const entries = store.getState().entries;
        await api.renamePath(root, source.path, to);
        await rewriteReferences(root, entries, source.path, to);
        undo.push({
          label: `move ${source.path}`,
          run: async () => {
            await api.renamePath(root, to, source.path);
            await rewriteReferences(root, store.getState().entries, to, source.path);
            await store.refresh();
          },
        });
        clipboard = null;
      }
      await store.refresh();
    },
  });

  commands.register({
    id: "edit.undo",
    title: "Undo last file operation",
    run: async () => {
      await undo.undoLast();
    },
  });

  commands.register({
    id: "tree.filter_tasks",
    title: "Filter tree: open tasks",
    run: () => {
      setFilter("open tasks", tasksFilter);
    },
  });

  commands.register({
    id: "tree.filter_by_tag",
    title: "Filter tree by tag",
    run: async () => {
      const tag = await promptText(app, {
        title: "Filter by tag (inherited tags included)",
        initial: "",
        confirmLabel: "Filter",
      });
      if (!tag) {
        return;
      }
      const clean = tag.replace(/^#/, "").trim();
      const matching = new Set<string>();
      for (const entry of store.getState().entries) {
        if (entry.isDir) {
          continue;
        }
        const result = effectiveTags(entry.relPath, currentByPath, currentParentOf);
        if (result.tags.includes(clean)) {
          matching.add(entry.relPath);
        }
      }
      setFilter(`#${clean}`, (openPath) => matching.has(openPath));
    },
  });

  commands.register({
    id: "tree.clear_filter",
    title: "Clear tree filter",
    run: () => {
      setFilter("", null);
    },
  });

  const cycleTab = (delta: number): void => {
    const { tabs, activePath } = store.getState();
    if (tabs.length === 0 || !activePath) {
      return;
    }
    const index = tabs.indexOf(activePath);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (next) {
      void store.openFile(next);
    }
  };

  let lastClosedTab: string | null = null;
  const closeTab = (path: string): void => {
    lastClosedTab = path;
    store.closeTab(path);
  };

  const renderTabBar = (): void => {
    const { tabs, activePath } = store.getState();
    tabBar.hidden = tabs.length === 0;
    const elements = tabs.map((path) => {
      const tab = document.createElement("div");
      tab.className = "tab";
      if (path === activePath) {
        tab.classList.add("active");
      }
      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = baseName(path);
      label.title = path;
      tab.append(label);
      if (store.isTabDirty(path)) {
        const dot = document.createElement("span");
        dot.className = "tab-dirty";
        dot.textContent = "●";
        tab.append(dot);
      }
      const close = document.createElement("button");
      close.className = "tab-close";
      close.textContent = "×";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTab(path);
      });
      tab.append(close);
      tab.addEventListener("click", () => {
        void store.openFile(path);
      });
      tab.addEventListener("auxclick", (event) => {
        if (event.button === 1) {
          event.preventDefault();
          closeTab(path);
        }
      });
      return tab;
    });
    tabBar.replaceChildren(...elements);
  };

  commands.register({
    id: "tab.close",
    title: "Close tab",
    run: () => {
      const active = store.getState().activePath;
      if (active) {
        closeTab(active);
      }
    },
  });
  commands.register({
    id: "tab.next",
    title: "Next tab",
    run: () => cycleTab(1),
  });
  commands.register({
    id: "tab.prev",
    title: "Previous tab",
    run: () => cycleTab(-1),
  });
  commands.register({
    id: "tab.reopen_last",
    title: "Reopen last closed tab",
    run: async () => {
      if (lastClosedTab) {
        await store.openFile(lastClosedTab);
      }
    },
  });

  let conflictPath: string | null = null;
  const hideConflict = (): void => {
    conflictPath = null;
    conflictBanner.hidden = true;
  };
  const showConflict = (path: string): void => {
    if (conflictPath === path) {
      return;
    }
    conflictPath = path;
    conflictBanner.replaceChildren();
    const message = document.createElement("span");
    message.textContent = `${path} changed on disk.`;
    const reload = document.createElement("button");
    reload.className = "button";
    reload.textContent = "Reload from disk";
    reload.addEventListener("click", () => {
      void store.openFile(path).then(hideConflict);
    });
    const keep = document.createElement("button");
    keep.className = "button";
    keep.textContent = "Keep mine";
    keep.addEventListener("click", () => {
      void store.saveActive().then(hideConflict);
    });
    conflictBanner.append(message, reload, keep);
    conflictBanner.hidden = false;
  };

  const handleExternalChange = async (): Promise<void> => {
    await store.refresh();
    const state = store.getState();
    if (!state.root || !state.activePath) {
      return;
    }
    try {
      const disk = await api.readFile(state.root, state.activePath);
      const current = store.getState();
      if (current.activePath !== state.activePath) {
        return;
      }
      if (disk === current.contents) {
        hideConflict();
        return;
      }
      if (current.dirty) {
        showConflict(state.activePath);
        return;
      }
      hideConflict();
      await store.openFile(state.activePath);
    } catch {
      hideConflict();
    }
  };

  let externalTimer: number | undefined;
  void listen("vault-changed", () => {
    window.clearTimeout(externalTimer);
    externalTimer = window.setTimeout(() => {
      void handleExternalChange();
    }, 350);
  });

  const effectiveKeymap = (): KeyBinding[] => {
    const bindings = [...DEFAULT_KEYMAP];
    for (const [chord, command] of Object.entries(config.getState().config.keymap)) {
      const existing = bindings.findIndex(
        (binding) => binding.chord.toLowerCase() === chord.toLowerCase(),
      );
      const binding: KeyBinding = { chord, command, context: "global" };
      if (existing >= 0) {
        bindings[existing] = binding;
      } else {
        bindings.push(binding);
      }
    }
    for (const keymap of lua.getKeymaps()) {
      const exists = bindings.some(
        (binding) => binding.chord.toLowerCase() === keymap.chord.toLowerCase(),
      );
      if (!exists) {
        bindings.push({ chord: keymap.chord, command: keymap.command, context: "global" });
      }
    }
    return bindings;
  };

  commands.register({
    id: "vault.open",
    title: "Open folder",
    run: async () => {
      const selected = await open({ directory: true, title: "Open vault folder" });
      if (typeof selected === "string") {
        await store.openVault(selected);
      }
    },
  });
  commands.register({
    id: "file.save",
    title: "Save note",
    run: () => store.saveActive(),
  });
  commands.register({
    id: "preview.cycle_position",
    title: "Cycle preview position",
    run: () => {
      cyclePreview();
    },
  });
  commands.register({
    id: "palette.open",
    title: "Show command palette",
    run: () => {
      palette.open();
    },
  });
  commands.register({
    id: "config.health",
    title: "Show config health",
    run: () => {
      openHealthPanel(app, config, () => themeController.getErrors());
    },
  });
  commands.register({
    id: "settings.open",
    title: "Open config file",
    run: async () => {
      await config.ensureStarterConfig();
      const paths = config.getPaths();
      if (paths) {
        await api.openExternal(paths.configFile);
      }
    },
  });

  const palette = new CommandPalette(app, {
    commands: () => commands.list(),
    onRun: (id) => {
      commands.run(id).catch((error: unknown) => {
        store.reportError(error);
      });
    },
  });

  const quickOpen = new QuickOpen(app, {
    getEntries: () => store.getState().entries,
    onOpen: (relPath) => {
      void store.openFile(relPath);
    },
  });

  const searchUi = new SearchUi(app, {
    getContext: () => {
      const { root, entries } = store.getState();
      if (!root) {
        return null;
      }
      return { root, entries, parentOf: currentParentOf };
    },
    onOpen: (relPath, line) => {
      void store.openFileAt(relPath, line);
    },
  });

  commands.register({
    id: "file.quick_open",
    title: "Quick open note",
    run: () => {
      quickOpen.open();
    },
  });
  commands.register({
    id: "search.open",
    title: "Search vault",
    run: () => {
      searchUi.open();
    },
  });

  const runCommand = (id: string): void => {
    commands.run(id).catch((error: unknown) => store.reportError(error));
  };

  openButton.addEventListener("click", () => runCommand("vault.open"));
  previewButton.addEventListener("click", () => runCommand("preview.cycle_position"));
  configButton.addEventListener("click", () => runCommand("config.health"));

  splitter.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    splitter.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = docArea.getBoundingClientRect();
      let size: number;
      if (previewPosition === "right") {
        size = rect.right - moveEvent.clientX;
      } else if (previewPosition === "left") {
        size = moveEvent.clientX - rect.left;
      } else if (previewPosition === "bottom") {
        size = rect.bottom - moveEvent.clientY;
      } else {
        size = moveEvent.clientY - rect.top;
      }
      const total =
        previewPosition === "left" || previewPosition === "right" ? rect.width : rect.height;
      const clamped = Math.max(total * 0.15, Math.min(total * 0.7, size));
      docArea.style.setProperty("--preview-size", `${Math.round(clamped)}px`);
    };
    const up = () => {
      splitter.removeEventListener("pointermove", move);
      splitter.removeEventListener("pointerup", up);
    };
    splitter.addEventListener("pointermove", move);
    splitter.addEventListener("pointerup", up);
  });

  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "Escape" && filterActive) {
      event.preventDefault();
      setFilter("", null);
      return;
    }
    const inTree = document.activeElement === treeContainer;
    if (event.ctrlKey && event.key === "Tab") {
      event.preventDefault();
      runCommand(event.shiftKey ? "tab.prev" : "tab.next");
      return;
    }
    if (inTree) {
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.key === "F2") {
        event.preventDefault();
        runCommand("tree.rename");
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        runCommand("tree.delete");
        return;
      }
      if (modifier && event.altKey && key === "n") {
        event.preventDefault();
        runCommand("tree.new_folder");
        return;
      }
      if (modifier && event.shiftKey && key === "n") {
        event.preventDefault();
        runCommand("tree.add_child_node");
        return;
      }
      if (modifier && !event.shiftKey && !event.altKey) {
        if (key === "n") {
          event.preventDefault();
          runCommand("tree.add_node");
          return;
        }
        if (key === "c") {
          event.preventDefault();
          runCommand("tree.copy");
          return;
        }
        if (key === "x") {
          event.preventDefault();
          runCommand("tree.cut");
          return;
        }
        if (key === "v") {
          event.preventDefault();
          runCommand("tree.paste");
          return;
        }
      }
      if (modifier && key === "z") {
        event.preventDefault();
        runCommand("edit.undo");
        return;
      }
    }
    for (const binding of effectiveKeymap()) {
      if (binding.context === "global" && matchesEvent(event, binding.chord, isMac)) {
        event.preventDefault();
        runCommand(binding.command);
        return;
      }
    }
  });

  config.subscribe((state) => {
    themeController.updateConfig(state.config);
    const position = state.config.preview.position;
    if (isPreviewPosition(position) && position !== previewPosition) {
      applyPreviewPosition(position);
    }
    if (store.getState().entries.length > 0) {
      refreshTreeData(store.getState().entries);
    }
  });

  void (async () => {
    await config.start();
    const paths = config.getPaths();
    if (paths) {
      await themeController.setPaths(paths);
      await lua.start(dirOf(paths.configFile));
    }
    themeController.updateConfig(config.getState().config);
    await lua.hook("startup", store.getState().root ?? "");
  })();

  const SESSION_KEY = "graft.session";
  const saveSession = (): void => {
    const { root, tabs, activePath } = store.getState();
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ root, tabs, activePath }));
  };

  const restoreSession = async (): Promise<void> => {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return;
    }
    try {
      const session = JSON.parse(raw) as {
        root?: string | null;
        tabs?: string[];
        activePath?: string | null;
      };
      if (!session.root) {
        return;
      }
      await store.openVault(session.root);
      const valid = new Set(store.getState().entries.map((entry) => entry.relPath));
      for (const tab of session.tabs ?? []) {
        if (valid.has(tab)) {
          await store.openFile(tab);
        }
      }
      if (session.activePath && valid.has(session.activePath)) {
        await store.openFile(session.activePath);
      }
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
    }
  };

  let sessionTimer: number | undefined;
  const scheduleSessionSave = (): void => {
    window.clearTimeout(sessionTimer);
    sessionTimer = window.setTimeout(saveSession, 600);
  };

  void restoreSession();

  let syncingScroll = false;
  const scrollRatio = (element: HTMLElement): number =>
    element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight);
  const applyScrollRatio = (element: HTMLElement, ratio: number): void => {
    element.scrollTop = ratio * Math.max(0, element.scrollHeight - element.clientHeight);
  };
  editorView.scrollDOM.addEventListener("scroll", () => {
    if (
      syncingScroll ||
      previewPosition === "hidden" ||
      !config.getState().config.preview.syncScroll
    ) {
      return;
    }
    syncingScroll = true;
    applyScrollRatio(previewPane, scrollRatio(editorView.scrollDOM));
    window.requestAnimationFrame(() => {
      syncingScroll = false;
    });
  });
  previewPane.addEventListener("scroll", () => {
    if (
      syncingScroll ||
      previewPosition === "hidden" ||
      !config.getState().config.preview.syncScroll
    ) {
      return;
    }
    syncingScroll = true;
    applyScrollRatio(editorView.scrollDOM, scrollRatio(previewPane));
    window.requestAnimationFrame(() => {
      syncingScroll = false;
    });
  });

  let lastRoot: string | null | undefined;
  let lastEntries: unknown;
  let lastActivePath: string | null | undefined;
  let lastDirty: boolean | undefined;
  store.subscribe((state) => {
    vaultPath.textContent = state.root ?? "";
    dirty.hidden = !(state.dirty && state.activePath !== null);
    errorBanner.hidden = state.error === null;
    errorBanner.textContent = state.error ?? "";

    if (lastDirty && !state.dirty && state.activePath) {
      void lua.hook("save", state.activePath);
    }
    lastDirty = state.dirty;

    if (state.root !== lastRoot) {
      lastRoot = state.root;
      void config.setVault(state.root);
      if (state.root) {
        void api.watchVault(state.root).catch(() => undefined);
      }
    }
    if (state.entries !== lastEntries) {
      lastEntries = state.entries;
      refreshTreeData(state.entries);
      void lua.hook("tree_change", String(state.entries.length));
    }
    if (state.activePath !== lastActivePath) {
      lastActivePath = state.activePath;
      tree.setActive(state.activePath);
      updateTagChips();
      if (state.activePath) {
        void lua.hook("open", state.activePath);
      }
    }
    renderTabBar();
    scheduleSessionSave();
  });
}

function el(tag: string, className: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

function dirOf(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index === -1 ? path : path.slice(0, index);
}
