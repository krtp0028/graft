import type { Command } from "./commands";

export function fuzzyMatch(query: string, text: string): boolean {
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  let needleIndex = 0;
  for (let index = 0; index < haystack.length && needleIndex < needle.length; index += 1) {
    if (haystack[index] === needle[needleIndex]) {
      needleIndex += 1;
    }
  }
  return needleIndex === needle.length;
}

export interface PaletteOptions {
  commands: () => Command[];
  onRun: (id: string) => void;
}

export class CommandPalette {
  private readonly overlay: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly options: PaletteOptions;
  private filtered: Command[] = [];
  private selectedIndex = 0;

  constructor(parent: HTMLElement, options: PaletteOptions) {
    this.options = options;

    this.overlay = document.createElement("div");
    this.overlay.className = "palette";
    this.overlay.hidden = true;

    const panel = document.createElement("div");
    panel.className = "palette-panel";

    this.input = document.createElement("input");
    this.input.className = "palette-input";
    this.input.placeholder = "Run a command...";
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

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  private refresh(): void {
    const query = this.input.value.trim();
    this.filtered = this.options
      .commands()
      .filter((command) => query === "" || fuzzyMatch(query, command.title))
      .slice(0, 50);
    this.selectedIndex = 0;

    const items = this.filtered.map((command, index) => {
      const item = document.createElement("li");
      item.className = "palette-item";
      if (index === this.selectedIndex) {
        item.classList.add("selected");
      }
      item.textContent = command.title;
      item.addEventListener("click", () => this.run(command.id));
      item.addEventListener("mousemove", () => {
        if (this.selectedIndex !== index) {
          this.selectedIndex = index;
          this.markSelected();
        }
      });
      return item;
    });

    this.list.replaceChildren(...items);
  }

  private markSelected(): void {
    const items = this.list.querySelectorAll(".palette-item");
    items.forEach((item, index) => {
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
        const command = this.filtered[this.selectedIndex];
        if (command) {
          this.run(command.id);
        }
        break;
      }
      default:
        break;
    }
  }

  private run(id: string): void {
    this.close();
    this.options.onRun(id);
  }
}
