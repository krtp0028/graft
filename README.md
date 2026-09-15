# Graft

Lightweight hierarchical Markdown notes. A native desktop app (Tauri 2 + Rust + TypeScript) for people who like tree-based notes like CherryTree, but want plain `.md` files, a Markdown preview that can sit on any side, and deep configuration.

## Highlights

- **Tree-first notes** — folders are the tree, files are notes, `.md` and `.txt`
- **Multi-placement notes (DAG)** — a note can appear in several places in the tree via `also_under`, without duplicating the file
- **Rollups** — every node shows subtree task progress (`3/7 ✓`), word counts, and numeric field sums; click a badge to filter
- **Inherited context** — tags flow down from branch notes (`Docs.md` governs `Docs/**`); chips show where they came from
- **Preview anywhere** — hidden / right / left / bottom / top, cycled with `Ctrl+Shift+V`, draggable splitter, scroll sync
- **Deep configuration** — layered TOML config, theme files, `custom.css`, hot reload, config health panel
- **Lua scripting** — `init.lua` with commands, hooks, and keymaps
- **Lightweight** — ~5 MB exe, ~1.8 MB installer, ~270 ms cold start, plain files on disk

## Install

- **Windows**: run `Graft_<version>_x64-setup.exe` (NSIS). WebView2 is downloaded by the installer if missing.
- **Portable**: place `graft-portable.txt` next to `graft.exe`; all config lives in `graft-data/` beside the exe.
- **Linux/macOS**: build from source with `npx tauri build` (AppImage/deb/rpm, app/dmg).

## Getting started

1. Start Graft and click **Open Folder** to pick a vault (any folder of Markdown files).
2. Browse the tree: arrows navigate, `Enter` opens, folders expand with the twisty.
3. Edit in the left pane; the preview updates live; autosave is on.
4. `Ctrl+Shift+P` opens the command palette; `Ctrl+P` quick-opens a note; `Ctrl+Shift+F` searches the vault.

## Note format

Plain Markdown with optional YAML frontmatter:

```markdown
---
parent: Projects/Alpha # logical re-parent; the file stays where it is
also_under: [Reference/Postgres] # extra tree placements (mirrors)
order: 3 # sibling order within its folder
tags: [project-alpha]
hours: 12 # numeric fields can be summed by rollups
---

# Note body

- [ ] task items feed the rollup badges
      See [[Postgres]] for context.
```

- A note `Docs.md` next to a folder `Docs/` acts as a **branch note**: its `tags` (and other configured keys) are inherited by everything under `Docs/**`.
- `[[Wiki Links]]` resolve by path, filename, or `[[Target|alias]]`; backlinks are listed under the preview.
- Missing parents land under **Dangling**; circular parents are flagged and broken safely.

## Configuration

Layered, later wins: built-in defaults → user config → vault config.

- User config: `%APPDATA%\graft\config.toml` (Linux: `~/.config/graft/`, macOS: `~/Library/Application Support/graft/`)
- Vault config: `<vault>/.graft/config.toml`
- Themes: `%APPDATA%\graft\themes\*.toml`
- Escape hatch: `%APPDATA%\graft\custom.css` (loaded last)
- Open your config from the palette: **Open config file**. Inspect effective values and errors: **Show config health** (or the **Config** button).

Config is hot-reloaded on save; invalid files keep the last good config.

```toml
[editor]
fontSize = 14
wordWrap = false
autosaveDelayMs = 500

[preview]
position = "right" # hidden | right | left | bottom | top
syncScroll = true

[theme]
followSystem = true
light = "default-light"
dark = "default-dark"

[rollup]
tasks = true
words = false
fields = ["hours"]

[inherit]
keys = ["tags"]

[keymap]
"Ctrl+Alt+N" = "tree.new_note"
```

Theme files support inheritance and palettes:

```toml
[meta]
name = "nord-ish"
variant = "dark"
extends = "default-dark"

[palette]
north = "#2e3440"

[colors]
bg = "palette.north"
accent = "#88c0d0"
```

## Lua scripting

`init.lua` in the config directory is loaded at startup and can register commands, hooks, and keymaps. See `docs/lua-example-init.lua`.

```lua
mdtree.command{
  name = "Insert date",
  description = "Insert today's date",
  action = function() return os.date("%Y-%m-%d") end,
}

mdtree.on("save", function(path) mdtree.notify("saved " .. path) end)
mdtree.on("new_note", function(path) return "---\ntags: [inbox]\n---" end)

mdtree.keymap.set("global", "Ctrl+Alt+D", "Insert date")
```

Hooks: `startup`, `open`, `save`, `new_note`, `tree_change`. Command return values are inserted at the editor cursor; `mdtree.notify` shows a status message.

## Default keymap

| Shortcut                                    | Action                              |
| ------------------------------------------- | ----------------------------------- |
| `Ctrl+P` / `Ctrl+O`                         | Quick open / Open folder            |
| `Ctrl+Shift+P`                              | Command palette                     |
| `Ctrl+S`, `Ctrl+,`-style config via palette | Save; open config                   |
| `Ctrl+Shift+V`                              | Cycle preview position              |
| `Ctrl+F`-style search                       | `Ctrl+Shift+F` searches the vault   |
| `Ctrl+N` / `Ctrl+Shift+N`                   | New note / new folder (tree focus)  |
| `F2` / `Delete`                             | Rename / move to trash (tree focus) |
| `Alt+↑` / `Alt+↓`                           | Reorder sibling (tree focus)        |
| `Alt+drag` onto a folder                    | Add `also_under` mirror             |
| Drag onto a folder                          | Set `parent`                        |
| `Ctrl+Z` (tree focus)                       | Undo last file operation            |
| `Ctrl+W` / `Ctrl+Tab`                       | Close / cycle tabs                  |

## Development

```sh
npm install
npm run tauri dev     # run app
npm run check         # tsc + eslint + prettier + vitest
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npx tauri build --bundles nsis   # or appimage/deb/rpm/app/dmg
```

CI builds and tests on Windows, Linux, and macOS (`.github/workflows/ci.yml`).

## Known limitations

- No auto-updater yet (installers are manual).
- Single-selection file operations (no multi-select batch ops).
- Directory copy/paste is not supported (files only).
- Search matches are streamed per invocation; very large vaults may take a moment.
- Linux builds target WebKitGTK (AppImage bundles it).

## License

MIT
