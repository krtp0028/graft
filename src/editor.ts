import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
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

export function createEditor(parent: HTMLElement, store: VaultStore): EditorView {
  const language = new Compartment();
  const font = new Compartment();
  const wrap = new Compartment();
  let applyingExternal = false;
  let saveTimer: number | undefined;
  let currentPath: string | null = null;
  const states = new Map<string, EditorState>();

  const buildExtensions = () => [
    basicSetup,
    tokenTheme,
    font.of(fontSizeTheme(config.getState().config.editor.fontSize)),
    wrap.of(config.getState().config.editor.wordWrap ? EditorView.lineWrapping : []),
    language.of([]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !applyingExternal) {
        store.setContents(update.state.doc.toString());
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          void store.saveActive();
        }, config.getState().config.editor.autosaveDelayMs);
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
      ],
    });
  };
  config.subscribe((state) => applyEditorConfig(state.config));

  return view;
}
