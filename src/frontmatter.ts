const FENCE = "---";

function serializeValue(value: string | number | string[]): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item.includes(",") || item.includes(":") ? `"${item}"` : item)).join(", ")}]`;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return value.includes(":") || value.startsWith("[") ? `"${value}"` : value;
}

export function upsertFrontmatter(
  contents: string,
  changes: Record<string, string | number | string[] | null>,
): string {
  const lines = contents.split("\n");
  let blockStart = -1;
  let blockEnd = -1;

  if (lines[0]?.trimEnd() === FENCE) {
    blockStart = 0;
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trimEnd() === FENCE) {
        blockEnd = index;
        break;
      }
    }
  }

  const block: string[] =
    blockStart >= 0 && blockEnd > 0 ? lines.slice(blockStart + 1, blockEnd) : [];
  const body = blockEnd > 0 ? lines.slice(blockEnd + 1) : lines;

  const keyOf = (line: string): string | null => {
    const colon = line.indexOf(":");
    if (colon === -1 || line.trimStart().startsWith("- ")) {
      return null;
    }
    return line.slice(0, colon).trim();
  };

  for (const [key, value] of Object.entries(changes)) {
    const existing = block.findIndex((line) => keyOf(line) === key);
    if (value === null) {
      if (existing >= 0) {
        block.splice(existing, 1);
      }
      continue;
    }
    const rendered = `${key}: ${serializeValue(value)}`;
    if (existing >= 0) {
      block[existing] = rendered;
    } else {
      block.push(rendered);
    }
  }

  if (block.length === 0) {
    return body.join("\n");
  }
  return [FENCE, ...block, FENCE, ...body].join("\n");
}
