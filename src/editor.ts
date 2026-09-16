import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import * as api from "./api";
import { config } from "./config";
import type { AppConfig } from "./config";
import type { VaultStore } from "./store";

const tokenTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "var(--bg-surface)",
      color: "var(--fg)",
      fontSize: "14px",
    },
    ".cm-content": {
      fontFamily: "var(--font-mono)",
      padding: "12px 0",
      caretColor: "var(--fg)",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--bg-surface)",
      color: "var(--fg-muted)",
      border: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--bg-hover)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--fg)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--selection)",
    },
  },
  { dark: window.matchMedia("(prefers-color-scheme: dark)").matches },
);

function fontSizeTheme(fontSize: number): ReturnType<typeof EditorView.theme> {
  return EditorView.theme({
    "&": { fontSize: `${fontSize}px` },
  });
}

const isMarkdownPath = (path: string): boolean => path.toLowerCase().endsWith(".md");

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    binary += String.fromCharCode(...buffer.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

async function insertImages(root: string, files: File[], view: EditorView): Promise<void> {
  const stamp = Date.now();
  const snippets: string[] = [];
  let index = 0;
  for (const file of files) {
    const extension = IMAGE_EXTENSIONS[file.type];
    if (!extension) {
      continue;
    }
    const relPath = `assets/${stamp}${index > 0 ? `-${index}` : ""}.${extension}`;
    const data = await fileToBase64(file);
    await api.writeBinary(root, relPath, data);
    snippets.push(`![${file.name || "image"}](${relPath})`);
    index += 1;
  }
  if (snippets.length === 0) {
    return;
  }
  const text = snippets.join("\n");
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length },
  });
  view.focus();
}

export interface CursorInfo {
  line: number;
  column: number;
  selected: number;
}

export interface EditorOptions {
  onCursor?: (info: CursorInfo) => void;
}

export function createEditor(
  parent: HTMLElement,
  store: VaultStore,
  options: EditorOptions = {},
): EditorView {
  const language = new Compartment();
  const font = new Compartment();
  const wrap = new Compartment();
  const spellcheck = new Compartment();
  let applyingExternal = false;
  let saveTimer: number | undefined;
  let currentPath: string | null = null;
  const states = new Map<string, EditorState>();

  const reportCursor = (view: EditorView): void => {
    const range = view.state.selection.main;
    const line = view.state.doc.lineAt(range.head);
    options.onCursor?.({
      line: line.number,
      column: range.head - line.from + 1,
      selected: range.to - range.from,
    });
  };

  const buildExtensions = () => [
    basicSetup,
    tokenTheme,
    font.of(fontSizeTheme(config.getState().config.editor.fontSize)),
    wrap.of(config.getState().config.editor.wordWrap ? EditorView.lineWrapping : []),
    language.of([]),
    spellcheck.of(
      EditorView.contentAttributes.of({
        spellcheck: config.getState().config.editor.spellCheck ? "true" : "false",
      }),
    ),
    EditorView.domEventHandlers({
      paste: (event, view) => {
        const files = event.clipboardData?.files ? [...event.clipboardData.files] : [];
        const root = store.getState().root;
        if (files.length === 0 || !root) {
          return false;
        }
        event.preventDefault();
        void insertImages(root, files, view);
        return true;
      },
      drop: (event, view) => {
        const files = event.dataTransfer?.files ? [...event.dataTransfer.files] : [];
        const root = store.getState().root;
        if (files.length === 0 || !root) {
          return false;
        }
        event.preventDefault();
        void insertImages(root, files, view);
        return true;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !applyingExternal) {
        store.setContents(update.state.doc.toString());
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          void store.saveActive();
        }, config.getState().config.editor.autosaveDelayMs);
      }
      if (update.selectionSet || update.docChanged) {
        reportCursor(update.view);
      }
    }),
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          void store.saveActive();
          return true;
        },
      },
    ]),
  ];

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: "", extensions: buildExtensions() }),
  });

  store.subscribe((state) => {
    if (state.activePath === null) {
      currentPath = null;
      return;
    }

    if (state.activePath !== currentPath) {
      if (currentPath) {
        states.set(currentPath, view.state);
      }
      const cached = states.get(state.activePath);
      applyingExternal = true;
      if (cached) {
        view.setState(cached);
      } else {
        view.setState(EditorState.create({ doc: state.contents, extensions: buildExtensions() }));
      }
      view.dispatch({
        effects: language.reconfigure(isMarkdownPath(state.activePath) ? markdown() : []),
      });
      applyingExternal = false;
      currentPath = state.activePath;
    } else {
      const current = view.state.doc.toString();
      if (state.contents !== current) {
        applyingExternal = true;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: state.contents },
        });
        applyingExternal = false;
      }
    }

    const reveal = store.consumeReveal();
    if (reveal && reveal.path === state.activePath) {
      const lineNumber = Math.max(1, Math.min(reveal.line, view.state.doc.lines));
      const line = view.state.doc.line(lineNumber);
      view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
      view.focus();
    }
  });

  const applyEditorConfig = (value: AppConfig): void => {
    view.dispatch({
      effects: [
        font.reconfigure(fontSizeTheme(value.editor.fontSize)),
        wrap.reconfigure(value.editor.wordWrap ? EditorView.lineWrapping : []),
        spellcheck.reconfigure(
          EditorView.contentAttributes.of({
            spellcheck: value.editor.spellCheck ? "true" : "false",
          }),
        ),
      ],
    });
  };
  config.subscribe((state) => applyEditorConfig(state.config));

  return view;
}
