import { describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";
import {
  collectUnknownKeys,
  ConfigSchema,
  DEFAULT_CONFIG,
  mergeLayers,
  STARTER_CONFIG,
} from "./config";

describe("mergeLayers", () => {
  it("merges later layers over earlier ones and records sources", () => {
    const { merged, sources } = mergeLayers([
      { source: "defaults", data: DEFAULT_CONFIG as unknown as Record<string, unknown> },
      { source: "user", data: { editor: { fontSize: 16 }, theme: { name: "solar" } } },
      { source: "vault", data: { editor: { fontSize: 18 } } },
    ]);

    const editor = merged.editor as Record<string, unknown>;
    const theme = merged.theme as Record<string, unknown>;
    expect(editor.fontSize).toBe(18);
    expect(editor.wordWrap).toBe(false);
    expect(theme.name).toBe("solar");
    expect(sources["editor.fontSize"]).toBe("vault");
    expect(sources["theme.name"]).toBe("user");
    expect(sources["editor.wordWrap"]).toBe("defaults");
  });

  it("replaces arrays instead of merging them", () => {
    const { merged } = mergeLayers([
      { source: "defaults", data: DEFAULT_CONFIG as unknown as Record<string, unknown> },
      { source: "user", data: { inherit: { keys: ["tags", "project"] } } },
    ]);

    expect((merged.inherit as Record<string, unknown>).keys).toEqual(["tags", "project"]);
  });
});

describe("collectUnknownKeys", () => {
  it("finds unknown keys at any depth", () => {
    const unknown = collectUnknownKeys(
      { editor: { fontSize: 14, magic: true }, nope: 1 },
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
    );

    expect(unknown).toEqual(["editor.magic", "nope"]);
  });
});

describe("starter config", () => {
  it("parses and validates against the schema", () => {
    const { merged } = mergeLayers([
      { source: "defaults", data: DEFAULT_CONFIG as unknown as Record<string, unknown> },
      { source: "user", data: parseToml(STARTER_CONFIG) as Record<string, unknown> },
    ]);

    expect(ConfigSchema.safeParse(merged).success).toBe(true);
  });
});
