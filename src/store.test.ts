import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { VaultStore } from "./store";

vi.mock("./api", () => ({
  scanVault: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

const mocked = vi.mocked(api);

const file = (relPath: string) => ({
  relPath,
  isDir: false,
  size: 3,
  modifiedMs: 1,
  frontmatter: {
    parent: null,
    alsoUnder: [],
    order: null,
    tags: [],
    color: null,
    icon: null,
    numbers: {},
  },
  metrics: { tasksOpen: 0, tasksDone: 0, words: 0, links: [], tasks: [] },
});

describe("VaultStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a vault and stores scanned entries", async () => {
    mocked.scanVault.mockResolvedValue([file("a.md")]);
    const store = new VaultStore();

    await store.openVault("C:/vault");

    const state = store.getState();
    expect(state.root).toBe("C:/vault");
    expect(state.entries).toEqual([file("a.md")]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("reports scan failures without changing the vault", async () => {
    mocked.scanVault.mockRejectedValue("no such directory");
    const store = new VaultStore();

    await store.openVault("C:/missing");

    const state = store.getState();
    expect(state.root).toBeNull();
    expect(state.entries).toEqual([]);
    expect(state.error).toBe("no such directory");
  });

  it("loads a file into the editor state", async () => {
    mocked.scanVault.mockResolvedValue([file("a.md")]);
    mocked.readFile.mockResolvedValue("# hello");
    const store = new VaultStore();
    await store.openVault("C:/vault");

    await store.openFile("a.md");

    const state = store.getState();
    expect(state.activePath).toBe("a.md");
    expect(state.contents).toBe("# hello");
    expect(state.dirty).toBe(false);
  });

  it("marks dirty on edits and clears on save", async () => {
    mocked.scanVault.mockResolvedValue([file("a.md")]);
    mocked.readFile.mockResolvedValue("one");
    mocked.writeFile.mockResolvedValue(undefined);
    const store = new VaultStore();
    await store.openVault("C:/vault");
    await store.openFile("a.md");

    store.setContents("two");
    expect(store.getState().dirty).toBe(true);

    await store.saveActive();
    expect(mocked.writeFile).toHaveBeenCalledWith("C:/vault", "a.md", "two");
    expect(store.getState().dirty).toBe(false);
  });

  it("ignores openFile and saveActive without a vault or file", async () => {
    const store = new VaultStore();

    await store.openFile("a.md");
    await store.saveActive();

    expect(mocked.readFile).not.toHaveBeenCalled();
    expect(mocked.writeFile).not.toHaveBeenCalled();
  });

  it("notifies subscribers of state changes", async () => {
    mocked.scanVault.mockResolvedValue([]);
    const store = new VaultStore();
    const listener = vi.fn();

    store.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    await store.openVault("C:/vault");
    expect(listener.mock.calls.at(-1)?.[0].root).toBe("C:/vault");
  });
});
