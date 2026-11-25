# Changelog

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
