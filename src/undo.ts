export interface UndoEntry {
  label: string;
  run: () => Promise<void> | void;
}

export class UndoStack {
  private readonly entries: UndoEntry[] = [];
  private readonly limit: number;

  constructor(limit = 50) {
    this.limit = limit;
  }

  push(entry: UndoEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.limit) {
      this.entries.shift();
    }
  }

  get depth(): number {
    return this.entries.length;
  }

  async undoLast(): Promise<string | null> {
    const entry = this.entries.pop();
    if (!entry) {
      return null;
    }
    await entry.run();
    return entry.label;
  }
}
