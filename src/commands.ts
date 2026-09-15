export interface Command {
  id: string;
  title: string;
  run: (...args: unknown[]) => unknown;
}

export class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  register(command: Command): void {
    if (this.commands.has(command.id)) {
      throw new Error(`command already registered: ${command.id}`);
    }
    this.commands.set(command.id, command);
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  list(): Command[] {
    return [...this.commands.values()];
  }

  async run(id: string, ...args: unknown[]): Promise<unknown> {
    const command = this.commands.get(id);
    if (!command) {
      throw new Error(`unknown command: ${id}`);
    }
    return command.run(...args);
  }
}

export const commands = new CommandRegistry();
