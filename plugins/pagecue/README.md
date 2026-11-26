# pagecue plugin for Claude

Write presenter cues with Claude for a report, dashboard or website, one Claude builds or any page you present, and read them in the [pagecue](../../README.md) Chrome extension's private prompter.

```
/plugin marketplace add pakothealpaco/pagecue
/plugin install pagecue@pagecue
```

In claude.ai or the Claude app, add the marketplace `pakothealpaco/pagecue` with Plugins → Add → Add marketplace instead (the skill works there; for live changes in the Claude app, install `pagecue.mcpb` from a release).

Then ask Claude, for example: *"Add presenter cues to this report"*, or run `/pagecue:add-cues`. While the prompter is open you can also just ask for changes (*"add a cue here about the price"*, *"turn off the section lines"*): Claude operates the prompter through the plugin's MCP tools.

| MCP tool | What it does |
|---|---|
| `pagecue_status` | The page the prompter follows, every cue in order (with your edits), the current cue, the view |
| `add_cue`, `edit_cue`, `remove_cue`, `show_cue` | Change cues on that page, or jump to one |
| `set_view` | Section lines on the page, pause, text size, theme |
| `open_page` | Open another page and follow it |
| `publish_cues`, `list_published_cues` | Hand over a whole cue file for a page |

| Path | Contents |
|---|---|
| `skills/add-cues/SKILL.md` | How the agent plans breakpoints, collects what you want to say, writes cues and marks the page |
| `schema/pagecue.schema.json` | JSON Schema of the cue file (format version 1) |
| `server/bridge.mjs` | The MCP server and the local link to the extension (127.0.0.1:47613, no dependencies) |
| `scripts/check-cues.mjs` | Checks a cue file against the page source: format, and that every cue has its element |
| `desktop/manifest.json`, `scripts/pack-desktop-extension.mjs` | The bridge as a Claude desktop extension (`pagecue.mcpb`) |
