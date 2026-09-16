import type { EditorView } from "@codemirror/view";

export function wrapSelection(view: EditorView, before: string, after: string): void {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const insert = `${before}${selected}${after}`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: {
      anchor: range.from + before.length,
      head: range.from + before.length + selected.length,
    },
  });
  view.focus();
}

export function prefixLines(view: EditorView, prefix: string): void {
  const range = view.state.selection.main;
  const startLine = view.state.doc.lineAt(range.from);
  const endLine = view.state.doc.lineAt(range.to);
  const changes: { from: number; to?: number; insert: string }[] = [];

  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  if (changes.length > 0) {
    view.dispatch({ changes });
  }
  view.focus();
}

export function toggleHeading(view: EditorView, level: number): void {
  const prefix = `${"#".repeat(level)} `;
  const range = view.state.selection.main;
  const startLine = view.state.doc.lineAt(range.from);
  const endLine = view.state.doc.lineAt(range.to);
  const changes: { from: number; to?: number; insert: string }[] = [];

  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const existing = /^(#{1,6})\s+/.exec(line.text);
    if (existing && existing[1].length === level) {
      changes.push({ from: line.from, to: line.from + existing[0].length, insert: "" });
    } else if (existing) {
      changes.push({ from: line.from, to: line.from + existing[0].length, insert: prefix });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  if (changes.length > 0) {
    view.dispatch({ changes });
  }
  view.focus();
}

export function insertLink(view: EditorView): void {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const label = selected === "" ? "text" : selected;
  const insert = `[${label}](url)`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: {
      anchor: range.from + label.length + 3,
      head: range.from + label.length + 6,
    },
  });
  view.focus();
}
