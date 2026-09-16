import * as api from "./api";
import type { TrashEntry } from "./api";
import { parentDir, resolveRelative } from "./paths";
import type { VaultStore } from "./store";

export interface AttachmentsPanelOptions {
  store: VaultStore;
  onNotice: (text: string) => void;
  onChanged: () => Promise<void>;
}

export class AttachmentsPanel {
  private readonly overlay: HTMLElement;
  private readonly body: HTMLElement;
  private readonly options: AttachmentsPanelOptions;

  constructor(parent: HTMLElement, options: AttachmentsPanelOptions) {
    this.options = options;
    this.overlay = document.createElement("div");
    this.overlay.className = "palette";
    this.overlay.hidden = true;

    const panel = document.createElement("div");
    panel.className = "palette-panel search-panel";
    const header = document.createElement("div");
    header.className = "search-header";
    const title = document.createElement("strong");
    title.textContent = "Attachments & trash";
    const close = document.createElement("button");
    close.className = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => this.close());
    header.append(title, close);

    this.body = document.createElement("div");
    this.body.className = "search-results";

    panel.append(header, this.body);
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
    void this.render();
  }

  close(): void {
    this.overlay.hidden = true;
  }

  private async render(): Promise<void> {
    const { root, entries } = this.options.store.getState();
    this.body.replaceChildren();
    if (!root) {
      return;
    }

    const assetFiles = entries.filter(
      (entry) =>
        !entry.isDir && (entry.relPath.startsWith("assets/") || entry.relPath.includes("/assets/")),
    );
    const referenced = new Set<string>();
    for (const entry of entries) {
      if (entry.isDir) {
        continue;
      }
      const base = parentDir(entry.relPath);
      for (const image of entry.metrics.images) {
        const resolved = resolveRelative(base, image);
        if (resolved) {
          referenced.add(resolved);
        }
      }
    }
    const orphans = assetFiles.filter((entry) => !referenced.has(entry.relPath));

    this.body.append(
      this.section(
        `Orphaned assets (${orphans.length})`,
        orphans.map((entry) => ({
          label: entry.relPath,
          actions: [
            {
              label: "Move to trash",
              run: async () => {
                await api.trashPath(root, entry.relPath);
                await this.options.onChanged();
                await this.render();
              },
            },
          ],
        })),
        "No orphaned attachments",
      ),
    );

    let trash: TrashEntry[];
    try {
      trash = await api.trashList(root);
    } catch {
      trash = [];
    }

    this.body.append(
      this.section(
        `Trash (${trash.length})`,
        trash.map((entry) => ({
          label: formatTrash(entry),
          actions: [
            {
              label: "Restore",
              run: async () => {
                await api.restoreTrash(root, entry.id);
                await this.options.onChanged();
                await this.render();
              },
            },
            {
              label: "Delete",
              run: async () => {
                await api.trashDelete(root, entry.id);
                await this.options.onChanged();
                await this.render();
              },
            },
          ],
        })),
        "Trash is empty",
        trash.length > 0
          ? {
              label: "Empty trash",
              run: async () => {
                const removed = await api.trashEmpty(root);
                this.options.onNotice(
                  `removed ${removed} trash entr${removed === 1 ? "y" : "ies"}`,
                );
                await this.options.onChanged();
                await this.render();
              },
            }
          : undefined,
      ),
    );
  }

  private section(
    title: string,
    rows: Array<{ label: string; actions: Array<{ label: string; run: () => Promise<void> }> }>,
    emptyLabel: string,
    headerAction?: { label: string; run: () => Promise<void> },
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = "search-file";
    const heading = document.createElement("div");
    heading.className = "search-file-path";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = title;
    heading.append(titleSpan);
    if (headerAction) {
      const button = document.createElement("button");
      button.className = "button";
      button.textContent = headerAction.label;
      button.addEventListener("click", () => {
        void headerAction.run();
      });
      heading.append(button);
    }
    section.append(heading);

    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = emptyLabel;
      section.append(empty);
      return section;
    }

    for (const row of rows) {
      const line = document.createElement("div");
      line.className = "attachment-row";
      const label = document.createElement("span");
      label.className = "attachment-label";
      label.textContent = row.label;
      label.title = row.label;
      line.append(label);
      for (const action of row.actions) {
        const button = document.createElement("button");
        button.className = "button";
        button.textContent = action.label;
        button.addEventListener("click", () => {
          void action.run().catch((error: unknown) => {
            this.options.onNotice(String(error));
          });
        });
        line.append(button);
      }
      section.append(line);
    }
    return section;
  }
}

function formatTrash(entry: TrashEntry): string {
  const parts = entry.id.split("__");
  const original = parts.length > 1 ? parts.slice(1).join("/") : entry.id;
  const size = entry.size > 0 ? ` (${Math.ceil(entry.size / 1024)} KB)` : "";
  return `${original}${size}`;
}
