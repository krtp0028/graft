import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "./commands";

describe("CommandRegistry", () => {
  it("registers, lists, and gets commands", () => {
    const registry = new CommandRegistry();
    const command = { id: "tree.new_note", title: "New note", run: () => "created" };

    registry.register(command);

    expect(registry.get("tree.new_note")).toBe(command);
    expect(registry.list()).toEqual([command]);
  });

  it("rejects duplicate ids", () => {
    const registry = new CommandRegistry();
    const command = { id: "file.save", title: "Save", run: () => undefined };

    registry.register(command);

    expect(() => registry.register(command)).toThrow(/already registered/);
  });

  it("runs a command and returns its value", async () => {
    const registry = new CommandRegistry();
    const run = vi.fn(() => "ok");
    registry.register({ id: "preview.cycle_position", title: "Cycle preview", run });

    await expect(registry.run("preview.cycle_position")).resolves.toBe("ok");
    expect(run).toHaveBeenCalledOnce();
  });

  it("passes arguments through", async () => {
    const registry = new CommandRegistry();
    registry.register({ id: "echo", title: "Echo", run: (value) => value });

    await expect(registry.run("echo", 42)).resolves.toBe(42);
  });

  it("throws for unknown commands", async () => {
    const registry = new CommandRegistry();

    await expect(registry.run("missing")).rejects.toThrow(/unknown command/);
  });
});
