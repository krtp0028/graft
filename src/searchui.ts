import * as api from "./api";
import type { FileMeta } from "./api";
import { effectiveTags } from "./resolver";
import { hasTextSearch, matchesMetadata, matchesText, parseSearchQuery } from "./searchquery";

export interface SearchContext {
  root: string;
  entries: FileMeta[];
  parentOf: Map<string, string | null>;
}

export interface SearchUiOptions {
  getContext: () => SearchContext | null;
  onOpen: (relPath: string, line: number) => void;
}

interface Row {
  relPath: string;
  line: number | null;
  text: string;
}

export class SearchUi {
  private readonly overlay: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly results: HTMLElement;
  private readonly options: SearchUiOptions;
  private timer: number | undefined;

  constructor(parent: HTMLElement, options: SearchUiOptions) {
    this.options = options;

    this.overlay = document.createElement("div");
    this.overlay.className = "palette";
    this.overlay.hidden = true;

    const panel = document.createElement("div");
    panel.className = "palette-panel search-panel";

    const header = document.createElement("div");
    header.className = "search-header";
    const title = document.createElement("strong");
    title.textContent = "Search vault";
    const hint = document.createElement("span");
    hint.className = "search-hint";
    hint.textContent = 'terms, "phrases", tag:, #tag, path:, task:open';
    const close = document.createElement("button");
    close.className = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => this.close());
    header.append(title, hint, close);

    this.input = document.createElement("input");
    this.input.className = "palette-input";
    this.input.placeholder = "Search...";
    this.input.addEventListener("input", () => this.schedule());

    this.results = document.createElement("div");
    this.results.className = "search-results";

    panel.append(header, this.input, this.results);
    this.overlay.append(panel);
    this.overlay.addEventListener("mousedown", (event) => {
      if (event.target === this.overlay) {
        this.close();
      }
    });
    parent.append(this.overlay);

    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });
  }

  open(): void {
    this.overlay.hidden = false;
    this.input.value = "";
    this.results.replaceChildren();
    this.input.focus();
  }

  close(): void {
    this.overlay.hidden = true;
    window.clearTimeout(this.timer);
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      void this.run();
    }, 160);
  }

  private async run(): Promise<void> {
    const context = this.options.getContext();
    if (!context) {
      return;
    }
    const query = parseSearchQuery(this.input.value);
    if (query.raw.trim() === "") {
      this.results.replaceChildren();
      return;
    }

    const byPath = new Map(context.entries.map((entry) => [entry.relPath, entry]));
    const tagCache = new Map<string, string[]>();
    const tagsOf = (relPath: string): string[] => {
      const cached = tagCache.get(relPath);
      if (cached) {
        return cached;
      }
      const tags = effectiveTags(relPath, byPath, context.parentOf).tags;
      tagCache.set(relPath, tags);
      return tags;
    };
    const metaMatch = (relPath: string): boolean => {
      const entry = byPath.get(relPath);
      return entry !== undefined && matchesMetadata(entry, tagsOf(relPath), query);
    };

    let rows: Row[];
    if (hasTextSearch(query)) {
      const probe = query.phrases[0] ?? query.terms[0] ?? "";
      const hits = await api.searchVault(context.root, probe, 300);
      rows = hits
        .filter(
          (hit) =>
            byPath.has(hit.relPath) && metaMatch(hit.relPath) && matchesText(hit.text, query),
        )
        .map((hit) => ({ relPath: hit.relPath, line: hit.line, text: hit.text }));
    } else {
      rows = context.entries
        .filter((entry) => !entry.isDir && metaMatch(entry.relPath))
        .slice(0, 200)
        .map((entry) => ({ relPath: entry.relPath, line: null, text: "(metadata match)" }));
    }

    this.renderRows(rows);
  }

  private renderRows(rows: Row[]): void {
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "No matches";
      this.results.replaceChildren(empty);
      return;
    }

    const grouped = new Map<string, Row[]>();
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
        this.options.onOpen(relPath, 1);
      });
      section.append(heading);
      for (const row of fileRows) {
        const button = document.createElement("button");
        button.className = "search-hit";
        button.textContent = row.line === null ? row.text : `${row.line}: ${row.text}`;
        button.addEventListener("click", () => {
          this.close();
          this.options.onOpen(row.relPath, row.line ?? 1);
        });
        section.append(button);
      }
      return section;
    });

    this.results.replaceChildren(...sections);
  }
}
