# Presenting with pagecue

1. Open the page and click the **pagecue** button in the toolbar, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>. The prompter opens in its own window.
2. In your meeting app, share **only the page's tab or window**, never the whole screen.
3. Talk. Scroll the page, or scroll or click the prompter, and the other side follows. The current cue is lit; the cue light at the top is green while the prompter follows the page.
4. To fix a cue's wording, double-click it (or press Enter on the current cue). Click away to save, Esc to cancel.

The page is cut into horizontal parts, one per cue, each the full width of the page: a cue starts at its line and runs to the next cue's line. One cue is current at a time: it lights when its line reaches the reading line (about a third of the way down the window) and stays lit until the next line does. Where two sections sit side by side, the row is split between them in reading order.

**Pages that show their content in a frame** (a claude.ai artifact, a Streamlit app, an embedded report that fills the window) work too: pagecue follows the frame. If the frame comes from another site, the prompter asks once for access to it (for claude.ai artifacts, `claudeusercontent.com`).

## Section lines

Click **Lines** at the bottom of the prompter (or press <kbd>L</kbd>) to see those parts on the page itself: a line across the page where each cue starts, with a tag holding the cue's number and headline, a light tint over the current part, and a dashed reading line. Drag a tag up or down to choose exactly when that cue comes up; double-click it to put it back. To add a part of your own, scroll to where it should start and click **+ Add cue here** on the reading line (or double-click empty space in the prompter, choose **Add a cue here** in its ··· menu, or press <kbd>N</kbd>); the new cue opens in the prompter for you to write; leave it empty and it goes away. To remove a cue, double-click it in the prompter and choose **Delete cue** (a toast offers Undo). Your adjustment is saved with the cue and exported with it.

The lines are part of the page, so anyone watching your shared tab sees them. Use them to rehearse and tune, then press <kbd>L</kbd> again before you present; the prompter shows **Lines on page** while they are on.

The page has no cues yet? Ask Claude to add them: see [Working with Claude](working-with-claude.md).

## Keyboard

| Keys | Where | Action |
|---|---|---|
| <kbd>PageDown</kbd> <kbd>↓</kbd> <kbd>→</kbd> <kbd>Space</kbd> <kbd>J</kbd> | prompter focused | next cue |
| <kbd>PageUp</kbd> <kbd>↑</kbd> <kbd>←</kbd> <kbd>K</kbd> | prompter focused | previous cue |
| <kbd>P</kbd> | prompter focused | pause or resume following |
| <kbd>L</kbd> | prompter focused | show or hide section lines on the page |
| <kbd>N</kbd> | prompter focused | add a cue starting at the reading line |
| <kbd>Enter</kbd> | prompter focused | edit the current cue |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>+</kbd> <kbd>−</kbd> | prompter focused | text size |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↓</kbd> / <kbd>↑</kbd> | anywhere in Chrome | next / previous cue |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | anywhere in Chrome | open pagecue for the current tab |

Presentation clickers send PageDown and PageUp, so they work while the prompter has focus. You can change the shortcuts at `chrome://extensions/shortcuts`.

## The prompter window

When you move the pointer, the prompter shows its controls; they fade two seconds after it stops. The cue light (click to pause) and "3 of 8" always stay.

- **Top:** the page title opens the site list, where you switch pages and turn on **Reconnect automatically** for the current site.
- **Bottom:** the presenting timer (click to restart), **Lines**, the two **A** buttons for smaller and larger text, and the ··· menu: add a cue, edit the current cue, pause, theme, import and export, and the keyboard shortcuts (<kbd>?</kbd> opens it there).

Without **Reconnect automatically**, access lasts until the tab navigates away, as with any `activeTab` extension.


## Site access

pagecue asks for no site access when you install it. It reaches a page only when you click its toolbar button there, or after you turn on **Reconnect automatically** for that site (in the site list, or in the "page reloaded" message). Pages whose content sits in a frame from another site ask once for access to that site. To use pagecue on local files (`file://`), turn on **Allow access to file URLs** in the extension's details page. See [PRIVACY.md](../PRIVACY.md).

## When a cue can't find its place

Pages change. A cue whose part of the page is gone is listed as missing, never quietly moved somewhere else; the prompter says how many. If none of a page's cues can be placed, the prompter still lists them all, so you can move through them with the arrow keys while you ask Claude to update them.
