import type { FileMeta } from "./api";

export interface TasksContext {
  root: string;
  entries: FileMeta[];
}

export interface TasksPanelOptions {
  getContext: () => TasksContext | null;
  onOpen: (relPath: string, line: number) => void;
}

interface TaskRow {
  relPath: string;
  line: number;
  text: string;
}

export class TasksPanel {
  private readonly overlay: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly count: HTMLElement;
  private readonly options: TasksPanelOptions;

  constructor(parent: HTMLElement, options: TasksPanelOptions) {
    this.options = options;
    this.overlay = document.createElement("div");
    this.overlay.className = "palette";
    this.overlay.hidden = true;

    const panel = document.createElement("div");
    panel.className = "palette-panel search-panel";

    const header = document.createElement("div");
    header.className = "search-header";
    const title = document.createElement("strong");
    title.textContent = "Open tasks";
    this.count = document.createElement("span");
    this.count.className = "search-hint";
    const close = document.createElement("button");
    close.className = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => this.close());
    header.append(title, this.count, close);

    this.input = document.createElement("input");
    this.input.className = "palette-input";
    this.input.placeholder = "Filter tasks...";
    this.input.addEventListener("input", () => this.render());
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    this.list = document.createElement("div");
    this.list.className = "search-results";

    panel.append(header, this.input, this.list);
    this.overlay.append(panel);
    this.overlay.addEventListener("mousedown", (event) => {
      if (event.target === this.overlay) {
        this.close();
      }
    });
    parent.append(this.overlay);
  }

  open(): void {
    this.overlay.hidden = false;
    this.input.value = "";
    this.render();
    this.input.focus();
  }

  close(): void {
    this.overlay.hidden = true;
  }

  refresh(): void {
    if (!this.overlay.hidden) {
      this.render();
    }
  }

  private render(): void {
    const context = this.options.getContext();
    if (!context) {
      return;
    }
    const filter = this.input.value.trim().toLowerCase();
    const rows: TaskRow[] = [];
    for (const entry of context.entries) {
      if (entry.isDir) {
        continue;
      }
      for (const task of entry.metrics.tasks) {
        if (filter !== "" && !task.text.toLowerCase().includes(filter)) {
          continue;
        }
        rows.push({ relPath: entry.relPath, line: task.line, text: task.text });
      }
    }
    rows.sort((a, b) => a.relPath.localeCompare(b.relPath) || a.line - b.line);
    this.count.textContent = `${rows.length} open task${rows.length === 1 ? "" : "s"}`;

    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "No open tasks";
      this.list.replaceChildren(empty);
      return;
    }

    const grouped = new Map<string, TaskRow[]>();
    for (const row of rows) {
      const list = grouped.get(row.relPath) ?? [];
      list.push(row);
      grouped.set(row.relPath, list);
    }

    const sections = [...grouped.entries()].map(([relPath, fileRows]) => {
      const section = document.createElement("section");
      section.className = "search-file";
      const heading = document.createElement("button");
      heading.className = "search-file-path";
      heading.textContent = relPath;
      heading.addEventListener("click", () => {
        this.close();
        this.options.onOpen(relPath, fileRows[0]?.line ?? 1);
      });
      section.append(heading);
      for (const row of fileRows) {
        const button = document.createElement("button");
        button.className = "search-hit";
        button.textContent = `${row.line}: ${row.text}`;
        button.addEventListener("click", () => {
          this.close();
          this.options.onOpen(row.relPath, row.line);
        });
        section.append(button);
      }
      return section;
    });

    this.list.replaceChildren(...sections);
  }
}
