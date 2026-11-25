# Working with Claude

Install the plugin (see the [README](../README.md#install)), then ask Claude Code, in any language:

> Add presenter cues to this report. On the revenue chart I want to say the Q3 jump came from the EU launch.

The `add-cues` skill (`/pagecue:add-cues`) plans the breakpoints and asks once what you want to say at each. You can answer by typing or with `/voice`, and say "you write it" for the rest. It then:

- writes the cues: a headline of about eight words, up to three points, only facts from the page or from you;
- adds `data-pagecue` attributes to the page source, without changing anything visible;
- writes the cue file and links it from the page;
- runs a checker to confirm that every cue attaches.

Open the page, click pagecue, and the cues are there. If you edit a cue in the prompter, your edit wins over the cue file from then on.

## Change cues while you work

With the prompter open, Claude Code (through the plugin) works on the prompter directly. It knows which page you are on, sees every cue with your own edits, and can add a cue "here" or at a heading, reword, delete or jump to a cue, turn section lines on or off, pause, change text size and theme, and open another page. Just ask, with a screenshot if that is easier:

> Add a cue at the pricing section: we match any quote for the first year.
>
> Make cue 3 shorter, and turn off the section lines.

Every change shows in the prompter at once, with **Undo**.

## The Claude app

The plugin's MCP server also works in the Claude desktop app. Add it to the app's `claude_desktop_config.json` (Settings → Developer → Edit config):

```json
{
  "mcpServers": {
    "pagecue": { "command": "node", "args": ["/path/to/pagecue/plugins/pagecue/server/bridge.mjs", "mcp"] }
  }
}
```

## MCP tools

| Tool | What it does |
|---|---|
| `pagecue_status` | The page the prompter follows, every cue in order (with your edits), the current cue, the view |
| `add_cue`, `edit_cue`, `remove_cue`, `show_cue` | Change cues on that page, or jump to one |
| `set_view` | Section lines on the page, pause, text size, theme |
| `open_page` | Open another page and follow it |
| `publish_cues`, `list_published_cues` | Hand over a whole cue file for a page |

The server talks to the extension on your own computer only (`127.0.0.1:47613`), with no dependencies. Cues it hands over are kept in `~/.pagecue`.
