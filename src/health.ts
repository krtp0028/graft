import type { ConfigManager } from "./config";

let activeOverlay: HTMLElement | null = null;

export function openHealthPanel(
  parent: HTMLElement,
  manager: ConfigManager,
  extraErrors: () => string[],
): void {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }

  const state = manager.getState();
  const overlay = document.createElement("div");
  overlay.className = "palette";
  const panel = document.createElement("div");
  panel.className = "palette-panel health-panel";

  const header = document.createElement("div");
  header.className = "health-header";
  const title = document.createElement("strong");
  title.textContent = "Config health";
  const close = document.createElement("button");
  close.className = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => {
    overlay.remove();
    activeOverlay = null;
  });
  header.append(title, close);

  const body = document.createElement("div");
  body.className = "health-body";

  body.append(
    section(
      "Loaded files",
      state.loadedFiles.length > 0 ? state.loadedFiles : ["(none — using defaults)"],
    ),
  );

  const errors = [...state.errors, ...extraErrors()];
  if (errors.length > 0) {
    body.append(section("Errors", errors, "health-error"));
  }

  if (state.warnings.length > 0) {
    body.append(section("Unknown keys", state.warnings, "health-warning"));
  }

  const overrides = Object.entries(state.sources)
    .filter(([, source]) => source !== "defaults")
    .map(([path, source]) => `${path}  ←  ${source}`);
  if (overrides.length > 0) {
    body.append(section("Overrides", overrides));
  }

  panel.append(header, body);
  overlay.append(panel);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) {
      overlay.remove();
      activeOverlay = null;
    }
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && activeOverlay === overlay) {
        overlay.remove();
        activeOverlay = null;
      }
    },
    { once: true },
  );

  parent.append(overlay);
  activeOverlay = overlay;
}

function section(title: string, lines: string[], className = ""): HTMLElement {
  const wrapper = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  list.className = className;
  for (const line of lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }
  wrapper.append(heading, list);
  return wrapper;
}
