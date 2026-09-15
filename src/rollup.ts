import type { FileMeta } from "./api";
import type { TreeNode } from "./resolver";

export interface RollupAggregate {
  open: number;
  done: number;
  words: number;
  sums: Record<string, number>;
}

export interface RollupConfig {
  tasks: boolean;
  words: boolean;
  fields: string[];
}

export function computeRollups(
  roots: TreeNode[],
  byPath: Map<string, FileMeta>,
  fields: string[],
): Map<string, RollupAggregate> {
  const result = new Map<string, RollupAggregate>();

  const visit = (node: TreeNode): RollupAggregate => {
    const aggregate: RollupAggregate = { open: 0, done: 0, words: 0, sums: {} };

    if (!node.mirror && node.openPath !== "") {
      const entry = byPath.get(node.openPath);
      if (entry) {
        aggregate.open = entry.metrics.tasksOpen;
        aggregate.done = entry.metrics.tasksDone;
        aggregate.words = entry.metrics.words;
        for (const field of fields) {
          const value = entry.frontmatter.numbers[field];
          if (typeof value === "number") {
            aggregate.sums[field] = (aggregate.sums[field] ?? 0) + value;
          }
        }
      }
    }

    for (const child of node.children) {
      const childAggregate = visit(child);
      aggregate.open += childAggregate.open;
      aggregate.done += childAggregate.done;
      aggregate.words += childAggregate.words;
      for (const [field, value] of Object.entries(childAggregate.sums)) {
        aggregate.sums[field] = (aggregate.sums[field] ?? 0) + value;
      }
    }

    result.set(node.relPath, aggregate);
    return aggregate;
  };

  for (const root of roots) {
    visit(root);
  }
  return result;
}
