# pagecue plugin for Claude Code

Adds presenter cues to a report, dashboard or website that Claude builds, for the [pagecue](../../README.md) Chrome extension's private prompter.

```
/plugin marketplace add pakothealpaco/pagecue
/plugin install pagecue@pagecue
```

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
