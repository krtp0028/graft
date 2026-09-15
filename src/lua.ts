import * as api from "./api";
import { commands } from "./commands";

export class LuaController {
  private keymaps: api.LuaKeymap[] = [];
  private readonly result: (text: string) => void;
  private readonly notice: (text: string) => void;

  constructor(result: (text: string) => void, notice: (text: string) => void) {
    this.result = result;
    this.notice = notice;
  }

  async start(dir: string | null): Promise<void> {
    if (!dir) {
      return;
    }
    try {
      await api.luaReload(dir);
    } catch (error) {
      this.notice(`lua: ${String(error)}`);
      return;
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const list = await api.luaCommands();
      this.keymaps = await api.luaKeymaps();
      for (const command of list) {
        const id = `lua:${command.name}`;
        if (commands.get(id)) {
          continue;
        }
        commands.register({
          id,
          title: command.description || command.name,
          run: async () => {
            const value = await api.luaRun(command.name);
            if (typeof value === "string" && value !== "") {
              this.result(value);
            }
            await this.drain();
          },
        });
      }
    } catch (error) {
      this.notice(`lua: ${String(error)}`);
    }
  }

  async hook(event: string, payload: string): Promise<string | null> {
    try {
      const value = await api.luaHook(event, payload);
      await this.drain();
      return typeof value === "string" ? value : null;
    } catch (error) {
      this.notice(`lua ${event}: ${String(error)}`);
      return null;
    }
  }

  getKeymaps(): { chord: string; command: string }[] {
    return this.keymaps.map((keymap) => ({
      chord: keymap.chord,
      command: keymap.command.startsWith("lua:") ? keymap.command : `lua:${keymap.command}`,
    }));
  }

  private async drain(): Promise<void> {
    try {
      const messages = await api.luaDrainMessages();
      for (const message of messages) {
        this.notice(message);
      }
    } catch {
      // lua is not initialized; nothing to drain
    }
  }
}
