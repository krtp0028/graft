import type { FileMeta } from "./api";
import { fuzzyMatch } from "./palette";

export interface QuickOpenOptions {
  getEntries: () => FileMeta[];
  onOpen: (relPath: string) => void;
}

export class QuickOpen {
  private readonly overlay: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly options: QuickOpenOptions;
  private filtered: FileMeta[] = [];
  private selectedIndex = 0;

  constructor(parent: HTMLElement, options: QuickOpenOptions) {
    this.options = options;
    this.overlay = document.createElement("div");
    this.overlay.className = "palette";
    this.overlay.hidden = true;

    const panel = document.createElement("div");
    panel.className = "palette-panel";

    this.input = document.createElement("input");
    this.input.className = "palette-input";
    this.input.placeholder = "Go to note...";
    this.input.addEventListener("input", () => this.refresh());
    this.input.addEventListener("keydown", (event) => this.handleKeydown(event));

    this.list = document.createElement("ul");
    this.list.className = "palette-list";

    panel.append(this.input, this.list);
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
    this.refresh();
    this.input.focus();
  }

  close(): void {
    this.overlay.hidden = true;
  }

  private refresh(): void {
    const query = this.input.value.trim();
    const entries = this.options
      .getEntries()
      .filter((entry) => !entry.isDir)
      .sort((a, b) => a.relPath.localeCompare(b.relPath));
    this.filtered = entries
      .filter((entry) => query === "" || fuzzyMatch(query, entry.relPath))
      .slice(0, 50);
    this.selectedIndex = 0;

    const items = this.filtered.map((entry, index) => {
      const item = document.createElement("li");
      item.className = "palette-item";
      if (index === this.selectedIndex) {
        item.classList.add("selected");
      }
      item.textContent = entry.relPath;
      item.addEventListener("click", () => this.run(entry.relPath));
      item.addEventListener("mousemove", () => {
        this.selectedIndex = index;
        this.markSelected();
      });
      return item;
    });
    this.list.replaceChildren(...items);
  }

  private markSelected(): void {
    this.list.querySelectorAll(".palette-item").forEach((item, index) => {
      item.classList.toggle("selected", index === this.selectedIndex);
    });
  }

  private handleKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        this.close();
        break;
      case "ArrowDown":
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
        this.markSelected();
        break;
      case "ArrowUp":
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.markSelected();
        break;
      case "Enter": {
        event.preventDefault();
        const entry = this.filtered[this.selectedIndex];
        if (entry) {
          this.run(entry.relPath);
        }
        break;
      }
      default:
        break;
    }
  }

  private run(relPath: string): void {
    this.close();
    this.options.onOpen(relPath);
  }
}
