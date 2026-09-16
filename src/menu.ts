import { Menu, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";

export async function installMenu(
  run: (id: string) => void,
  notice: (text: string) => void,
): Promise<void> {
  try {
    const item = (id: string, text: string) => ({
      id,
      text,
      action: () => run(id),
    });
    const separator = () => PredefinedMenuItem.new({ item: "Separator" });

    const menu = await Menu.new({
      items: [
        await Submenu.new({
          text: "File",
          items: [
            item("vault.open", "Open Folder..."),
            item("vault.open_recent", "Open Recent..."),
            await separator(),
            item("file.save", "Save"),
            item("file.reveal", "Reveal in File Manager"),
            await separator(),
            item("tab.close", "Close Tab"),
            await PredefinedMenuItem.new({ item: "Quit" }),
          ],
        }),
        await Submenu.new({
          text: "Edit",
          items: [
            item("edit.undo", "Undo File Operation"),
            await separator(),
            await PredefinedMenuItem.new({ item: "Cut" }),
            await PredefinedMenuItem.new({ item: "Copy" }),
            await PredefinedMenuItem.new({ item: "Paste" }),
            await PredefinedMenuItem.new({ item: "SelectAll" }),
          ],
        }),
        await Submenu.new({
          text: "Tree",
          items: [
            item("tree.add_node", "Add Node"),
            item("tree.add_child_node", "Add Child Node"),
            item("tree.new_folder", "New Folder"),
            await separator(),
            item("tree.rename", "Rename Selected"),
            item("tree.delete", "Move to Trash"),
            await separator(),
            item("tree.expand_all", "Expand All"),
            item("tree.collapse_all", "Collapse All"),
            item("tree.sort_children", "Sort Children by Name"),
            await separator(),
            item("tree.filter_by_tag", "Filter by Tag..."),
            item("tree.clear_filter", "Clear Tree Filter"),
          ],
        }),
        await Submenu.new({
          text: "View",
          items: [
            item("preview.cycle_position", "Cycle Preview Position"),
            item("search.open", "Search Vault"),
            item("file.quick_open", "Quick Open"),
            item("tasks.open", "Open Tasks"),
            await separator(),
            item("palette.open", "Command Palette"),
          ],
        }),
        await Submenu.new({
          text: "Help",
          items: [
            item("config.health", "Config Health"),
            item("settings.open", "Open Config File"),
          ],
        }),
      ],
    });
    await menu.setAsAppMenu();
  } catch (error) {
    notice(`menu unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}
