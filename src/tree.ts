import { icon } from "./icons";
import type { TreeNode } from "./resolver";
import type { RollupAggregate, RollupConfig } from "./rollup";

export function visibleNodes(roots: TreeNode[], expanded: ReadonlySet<string>): TreeNode[] {
  const visible: TreeNode[] = [];
  const visit = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      visible.push(node);
      if ((node.isDir || node.children.length > 0) && expanded.has(node.relPath)) {
        visit(node.children);
      }
    }
  };
  visit(roots);
  return visible;
}

export function filterTree(nodes: TreeNode[], match: (node: TreeNode) => boolean): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.mirror) {
      continue;
    }
    if (match(node)) {
      result.push(node);
      continue;
    }
    const children = filterTree(node.children, match);
    if (children.length > 0) {
      result.push({ ...node, children });
    }
  }
  return result;
}

export interface TreeMoveRequest {
  openPath: string;
  targetDir: string | null;
  mirror: boolean;
}

export interface TreeViewOptions {
  container: HTMLElement;
  onOpenFile: (relPath: string) => void;
  onMove?: (request: TreeMoveRequest) => void;
  onReorder?: (openPath: string, direction: -1 | 1) => void;
  onFilterBadge?: (node: TreeNode) => void;
}

export class TreeView {
  private readonly container: HTMLElement;
  private readonly options: TreeViewOptions;
  private roots: TreeNode[] = [];
  private readonly expanded = new Set<string>();
  private activePath: string | null = null;
  private selectedPath: string | null = null;
  private dragPath: string | null = null;
  private rollups: Map<string, RollupAggregate> | null = null;
  private rollupConfig: RollupConfig | null = null;
  private filter: ((node: TreeNode) => boolean) | null = null;

  constructor(options: TreeViewOptions) {
    this.container = options.container;
    this.options = options;
    this.container.classList.add("tree");
    this.container.tabIndex = 0;
    this.container.addEventListener("keydown", (event) => this.handleKeydown(event));
    this.container.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    this.container.addEventListener("drop", (event) => {
      const path = event.dataTransfer?.getData("application/x-graft-path");
      if (path && this.options.onMove) {
        event.preventDefault();
        this.options.onMove({ openPath: path, targetDir: null, mirror: event.altKey });
      }
    });
  }

  setRoots(roots: TreeNode[]): void {
    this.roots = roots;

    const validPaths = new Set<string>();
    const collect = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        validPaths.add(node.relPath);
        collect(node.children);
      }
    };
    collect(roots);
    for (const path of [...this.expanded]) {
      if (!validPaths.has(path)) {
        this.expanded.delete(path);
      }
    }
    this.render();
  }

  setActive(relPath: string | null): void {
    this.activePath = relPath;
    this.selectedPath = relPath;
    this.render();
  }

  getSelected(): TreeNode | null {
    return this.findSelected();
  }

  setRollups(rollups: Map<string, RollupAggregate>, config: RollupConfig): void {
    this.rollups = rollups;
    this.rollupConfig = config;
    this.render();
  }

  setFilter(match: ((node: TreeNode) => boolean) | null): void {
    this.filter = match;
    this.render();
  }

  get activeFilter(): boolean {
    return this.filter !== null;
  }

  private render(): void {
    const sourceRoots = this.filter ? filterTree(this.roots, this.filter) : this.roots;
    const visible = visibleNodes(sourceRoots, this.expanded);
    const list = document.createElement("ul");
    list.className = "tree-list";

    for (const node of visible) {
      const item = document.createElement("li");
      item.className = "tree-item";
      if (node.isDir) {
        item.classList.add("dir");
      }
      if (node.mirror) {
        item.classList.add("mirror");
      }
      if (node.relPath === this.selectedPath) {
        item.classList.add("selected");
      }
      if (node.openPath === this.activePath && !node.mirror) {
        item.classList.add("active");
      }
      item.style.paddingLeft = `${8 + this.depth(node.relPath) * 14}px`;

      const twisty = document.createElement("span");
      twisty.className = "twisty";
      const expandable = node.isDir || node.children.length > 0;
      twisty.textContent = expandable ? (this.expanded.has(node.relPath) ? "v" : ">") : "";
      if (expandable) {
        twisty.classList.add("clickable");
        twisty.addEventListener("click", (event) => {
          event.stopPropagation();
          this.container.focus();
          this.toggleExpanded(node.relPath);
        });
      }

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = node.name;

      const nodeIcon = document.createElement("span");
      nodeIcon.className = "node-icon";
      nodeIcon.append(icon(node.isDir || node.relPath === "__dangling__" ? "folder" : "file", 13));

      item.append(nodeIcon, twisty, label);

      if (node.mirror) {
        item.append(this.badge("◇", `also in: ${node.placements.join(", ")}`, "badge-mirror"));
      }
      if (node.cycle) {
        item.append(this.badge("!", "circular parent chain detected", "badge-error"));
      }
      if (node.dangling) {
        item.append(this.badge("?", "parent target does not exist", "badge-warning"));
      }

      if (!node.mirror && this.rollups && this.rollupConfig) {
        const aggregate = this.rollups.get(node.relPath);
        if (aggregate) {
          const total = aggregate.open + aggregate.done;
          if (this.rollupConfig.tasks && total > 0) {
            const tasks = this.badge(
              `${aggregate.done}/${total} ✓`,
              `${aggregate.open} open, ${aggregate.done} done in this subtree — click to filter`,
              "badge-rollup",
            );
            tasks.addEventListener("click", (event) => {
              event.stopPropagation();
              this.options.onFilterBadge?.(node);
            });
            item.append(tasks);
          }
          if (this.rollupConfig.words && aggregate.words > 0) {
            item.append(this.badge(`${aggregate.words}w`, "words in this subtree", "badge-rollup"));
          }
          for (const field of this.rollupConfig.fields) {
            const sum = aggregate.sums[field];
            if (typeof sum === "number" && sum !== 0) {
              item.append(this.badge(`${field}:${sum}`, `sum of ${field}`, "badge-rollup"));
            }
          }
        }
      }

      if (node.openPath !== "") {
        item.draggable = true;
        item.addEventListener("dragstart", (event) => {
          this.dragPath = node.openPath;
          event.dataTransfer?.setData("application/x-graft-path", node.openPath);
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
          }
        });
        item.addEventListener("dragend", () => {
          this.dragPath = null;
        });
      }

      const isRealDir = node.isDir && node.openPath === "" && node.relPath !== "__dangling__";
      const isFileNode = !node.isDir && node.openPath !== "" && !node.mirror;
      if (isRealDir || isFileNode) {
        const dropTarget = isRealDir ? node.relPath : node.openPath;
        item.addEventListener("dragover", (event) => {
          const path = this.dragPath;
          if (path && path !== dropTarget && !dropTarget.startsWith(`${path}/`)) {
            event.preventDefault();
            item.classList.add("drop-target");
          }
        });
        item.addEventListener("dragleave", () => {
          item.classList.remove("drop-target");
        });
        item.addEventListener("drop", (event) => {
          item.classList.remove("drop-target");
          const path = event.dataTransfer?.getData("application/x-graft-path");
          if (path && this.options.onMove) {
            event.preventDefault();
            event.stopPropagation();
            this.options.onMove({ openPath: path, targetDir: dropTarget, mirror: event.altKey });
          }
        });
      }

      item.addEventListener("click", () => {
        this.container.focus();
        if (node.isDir) {
          this.toggleExpanded(node.relPath);
        } else if (node.openPath !== "") {
          this.selectedPath = node.relPath;
          this.options.onOpenFile(node.openPath);
          this.render();
        }
      });

      list.append(item);
    }

    this.container.replaceChildren(list);
  }

  private badge(symbol: string, title: string, className: string): HTMLElement {
    const badge = document.createElement("span");
    badge.className = `badge ${className}`;
    badge.textContent = symbol;
    badge.title = title;
    return badge;
  }

  private toggleExpanded(relPath: string): void {
    if (this.expanded.has(relPath)) {
      this.expanded.delete(relPath);
    } else {
      this.expanded.add(relPath);
    }
    this.render();
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const node = this.findSelected();
      if (node && this.options.onReorder) {
        event.preventDefault();
        this.options.onReorder(node.openPath, event.key === "ArrowUp" ? -1 : 1);
      }
      return;
    }

    const visible = visibleNodes(this.roots, this.expanded);
    if (visible.length === 0) {
      return;
    }
    const currentIndex = this.selectedPath
      ? visible.findIndex((node) => node.relPath === this.selectedPath)
      : -1;
    let nextIndex = currentIndex;
    let handled = true;

    switch (event.key) {
      case "ArrowDown":
        nextIndex = Math.min(currentIndex + 1, visible.length - 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case "ArrowRight": {
        const node = visible[currentIndex];
        if (node && (node.isDir || node.children.length > 0) && !this.expanded.has(node.relPath)) {
          this.toggleExpanded(node.relPath);
        } else {
          nextIndex = Math.min(currentIndex + 1, visible.length - 1);
        }
        break;
      }
      case "ArrowLeft": {
        const node = visible[currentIndex];
        if (node && (node.isDir || node.children.length > 0) && this.expanded.has(node.relPath)) {
          this.toggleExpanded(node.relPath);
        } else if (node) {
          const parent = visible.find(
            (candidate) => candidate.relPath === this.parentPath(node.relPath),
          );
          if (parent) {
            nextIndex = visible.indexOf(parent);
          }
        }
        break;
      }
      case "Enter": {
        const node = visible[currentIndex];
        if (node?.isDir) {
          this.toggleExpanded(node.relPath);
        } else if (node && node.openPath !== "") {
          this.selectedPath = node.relPath;
          this.options.onOpenFile(node.openPath);
          this.render();
        }
        break;
      }
      default:
        handled = false;
    }

    if (!handled) {
      return;
    }
    event.preventDefault();
    if (nextIndex !== currentIndex && nextIndex >= 0) {
      this.selectedPath = visible[nextIndex].relPath;
      this.render();
      this.container.querySelector(".tree-item.selected")?.scrollIntoView({ block: "nearest" });
    }
  }

  private findSelected(): TreeNode | null {
    if (!this.selectedPath) {
      return null;
    }
    return (
      visibleNodes(this.roots, this.expanded).find((node) => node.relPath === this.selectedPath) ??
      null
    );
  }

  private parentPath(relPath: string): string {
    const clean = relPath.split("::")[0];
    const slash = clean.lastIndexOf("/");
    return slash === -1 ? "" : clean.slice(0, slash);
  }

  private depth(relPath: string): number {
    return relPath.split("::")[0].split("/").length - 1;
  }
}
