export interface PromptOptions {
  title: string;
  initial?: string;
  confirmLabel?: string;
}

export function promptText(parent: HTMLElement, options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "palette";
    const panel = document.createElement("div");
    panel.className = "palette-panel prompt-panel";

    const title = document.createElement("div");
    title.className = "prompt-title";
    title.textContent = options.title;

    const input = document.createElement("input");
    input.className = "palette-input";
    input.value = options.initial ?? "";

    const actions = document.createElement("div");
    actions.className = "prompt-actions";
    const cancel = document.createElement("button");
    cancel.className = "button";
    cancel.textContent = "Cancel";
    const confirm = document.createElement("button");
    confirm.className = "button prompt-confirm";
    confirm.textContent = options.confirmLabel ?? "OK";
    actions.append(cancel, confirm);

    const finish = (value: string | null): void => {
      overlay.remove();
      resolve(value);
    };

    cancel.addEventListener("click", () => finish(null));
    confirm.addEventListener("click", () =>
      finish(input.value.trim() === "" ? null : input.value.trim()),
    );
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(input.value.trim() === "" ? null : input.value.trim());
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
    });
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) {
        finish(null);
      }
    });

    panel.append(title, input, actions);
    overlay.append(panel);
    parent.append(overlay);
    input.focus();
    input.select();
  });
}
