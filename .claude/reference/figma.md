# Figma

This project has the **official Figma Claude Code plugin** wired up. A new session can read designs, extract tokens/specs, and write to Figma files.

## Access

- Plugin `figma` (server tools `mcp__…__*`, deferred → load via `ToolSearch "select:<tool>"`).
- Auth is per-machine OAuth, already done. If tools 404 / "requires authentication", user re-runs `/mcp` → figma → authorize in an interactive terminal. Verify with `whoami` (returns handle/seat/tier).
- Account: **Dev seat, Pro tier** — enough for read + write, not for publishing libraries.
- Drives the user's **desktop Figma app**: writes need it running with the target file open.

## Mandatory skill-before-tool rule

The plugin's own skills MUST load before their tool, or you hit hard-to-debug failures:

| Before calling… | Load skill |
|---|---|
| `use_figma` (any write) | `figma:figma-use` |
| `get_design_context` (design→code) | `figma:figma-design-to-code` |
| `create_new_file` | `figma:figma-create-new-file` |
| `generate_diagram` | `figma:figma-generate-diagram` |
| building components/library | `figma:figma-generate-library` (+ `figma-use`) |
| code→Figma full page/screen | `figma:figma-generate-design` (+ `figma-use`) |

Pass the loaded skill name in the tool's `skillNames` param (logging only).

## Key tools

- **Read:** `get_design_context` (code + screenshot + hints — primary design→code tool), `get_variable_defs` (tokens as resolved values), `get_screenshot` (nodeId required), `get_metadata` (structure only).
- **Write:** `use_figma` (runs JS via Plugin API — creates/edits nodes, variables, components), `create_new_file`.
- **Code Connect:** `get_code_connect_map`, `add_code_connect_map`, `send_code_connect_mappings` (map Figma components → code).

## Two workflows for the site build

- **Design-first:** build tokens/components/screens in Figma → `get_design_context` on a node → adapt the returned React+Tailwind reference into our real stack (never paste verbatim; reuse project components/tokens).
- **Code-first:** build in code → `generate_figma_design` / `use_figma` to push a living spec back to Figma.

## Gotchas (from real use)

- `use_figma` is **atomic** — a script that errors makes zero changes; read the error, fix, retry (don't blind-retry).
- Work in **small validated steps** (≤~10 ops/call): create → `get_screenshot` → fix. One giant script clips/breaks silently.
- Colors are **0–1** range, not 0–255. Fills are read-only arrays (clone + reassign).
- Load fonts before editing text (`Inter` style is `"Semi Bold"`, not `"SemiBold"`).
- Switch pages with `await figma.setCurrentPageAsync(page)` — the sync setter throws.
- Set variable `scopes` explicitly; default `ALL_SCOPES` pollutes every picker.
- Component sets don't hug by default → set `counterAxisSizingMode='AUTO'` + child `layoutSizingHorizontal='HUG'` or labels clip.

## Existing seed

File **The Working Set — Design System**, key `rcWpKNXsTtsspspmiAWWE1`
(`https://www.figma.com/design/rcWpKNXsTtsspspmiAWWE1`). Contains a token collection
(`Working Set Tokens`: dark editorial palette, one amber accent `#f2c14e`, radius +
spacing) and a `Button` component (Primary/Secondary/Ghost, all props bound to tokens).
Build on this rather than reinventing — confirm with the user if design direction has moved.
