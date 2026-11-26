# Changelog

## 0.4.0 (2026-11-26)

- **claude.ai and the Claude app.** The `add-cues` skill now works there too: when Claude builds an artifact, it writes the cues inside it, and pagecue picks them up when you open the artifact (also when the artifact draws its content after loading, and in the panel beside a chat). Releases include `pagecue-skill.zip` to upload with Plugins → Add → Upload plugin.
- **Live changes in the Claude app.** The bridge ships as a Claude desktop extension, `pagecue.mcpb`: double-click to install, no Node.js needed.
- **Add cues from Claude** (··· menu): paste the cues Claude gave you for a page it couldn't edit, or choose or drop a `.cues.json` file. It replaces Import cues.
- A calmer prompter: a page with no cues shows one command to copy and a quiet way to write your own; the ··· menu is shorter.
- **Cue files:** a cue can say where it starts with `near` (the heading's text), for pages that can't be marked with `data-pagecue`.
- **A welcome page** opens once after install: pin the button (with a live check), set up Claude, and try the demo.
- The prompter says whether Claude Code is connected, and when the plugin is older than the extension.

## 0.3.0 (2026-11-25)

- The prompter's "No cues on this page yet" card now copies `/pagecue:add-cues <page>`, which starts the skill in Claude Code directly, and links to the plugin's install steps when you don't have it yet.
- Links to the user guide and to GitHub in the ··· menu and under every empty state.
- A website with a full user guide: [usepagecue.com](https://usepagecue.com).
- Removed: `window.pagecue` and the **Let Claude in Chrome edit cues** setting. Claude in Chrome doesn't use skills, so it never learned the interface. Claude Code and the Claude app still change cues live through the plugin's MCP tools, each change with Undo. pagecue now adds nothing to the page's own scripts, and a saved setting from an older version is ignored.

## 0.2.0 (2026-11-25)

The first public release.

- A private prompter window that follows the page in both directions, one cue lit at a time.
- Cues written by Claude: the `add-cues` skill for Claude Code, live changes through the plugin's MCP tools, and `window.pagecue` for Claude in Chrome.
- Section lines on the page (key L): see and drag where each cue starts; add cues by hand (key N) and delete them, with Undo.
- Works on long reports, dashboards with inner scrolling, single-page apps, and pages that show their content in a frame, such as claude.ai artifacts.
- Cues in any language, each in its own script's direction and font.
