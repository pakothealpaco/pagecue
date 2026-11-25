# Prompter controls

Date: 2026-11-25. Status: plan, not yet built. This document decides where every control in the prompter window lives. It answers the owner's complaint that almost everything sits behind the ··· menu, his request that text size be on the main screen as two buttons, and his note that the "Lines on page" pill is ugly. It builds on [prompter.md](prompter.md) (principles and tokens) and [research-presenter-ui.md](research-presenter-ui.md) (the first research pass). Where the two disagree, this document wins for controls; prompter.md is updated to match (see "Implementation").

## 1. The problem today

The window has two bars. The top bar holds the cue light (a tiny 8 px dot that pauses on click), the page title (which secretly opens the Sites sheet), and "3 of 8". The footer holds the timer (click resets, with no sign of that), a bordered green "Lines on page" pill when section lines are on, and ···. The ··· menu holds everything else: text size S/M/L/XL, theme, add a cue, section lines, reconnect automatically, switch site, import, export and a shortcut list.

Problems a new user meets:

- The one setting presenters change while talking, text size, is two clicks away in a menu, or behind ⌘+/−, which nobody guesses.
- Pause is an 8 px dot with no label. Switching site is a title that does not look like a button. Resetting the timer is invisible.
- "Reconnect automatically" is in the menu, but the moment you need it is when the page has reloaded and the prompter shows an error, and there it only tells you to go to the menu.
- Editing is discoverable only by a tooltip on hover ("double-click to edit"), and there is no visible way to finish editing.
- The "Lines on page" pill is loud (border, green fill, text) and sits centred in the footer, competing with the cues.

## 2. How comparable tools place controls

| Tool | Text size | Pause / follow | Navigation | Settings | Notes editing | Timer | What hides |
|---|---|---|---|---|---|---|---|
| PowerPoint Presenter View | Two font buttons (larger, smaller) at the bottom of the Notes pane | Timer pause and reset buttons, top left | Arrows beside the slide number | "More options" (···) for display settings | Notes are typed in the editor, not in the show | Top left with pause and reset; clock beside it | Nothing; the view is always fully drawn |
| Keynote presenter display | A font button in the top-left corner of the notes field, shown when the pointer is over the notes | Not applicable | Keys, clicker; navigator button top left | Display configuration button, top right; layout via "Customize Presenter Display" | Notes editable during the show | Optional item, elapsed or remaining | The top toolbar and the notes buttons appear only when the pointer moves |
| Google Slides presenter view | Zoom in / zoom out (+ −) buttons by the notes | Timer has Pause and Reset | Previous and next buttons, slide number | Few; most in the editor | In the editor | Pause, Reset beside it | Present-mode toolbar hides; presenter view stays drawn |
| Teleprompter apps (PromptSmart, BIGVU, Teleprompter Studio, Teleprompt+) | On-screen size control during prompting (BIGVU: font size beside speed and scroll position in one settings strip) | Tap the text, or an on-screen play/pause; remotes | Scroll, voice tracking, remote | A separate settings screen for mirror, margins, colours | Separate editor screen | Some have a timer | The script fills the screen; controls overlay and hide while running |
| QPrompt (interface only) | Toolbar and settings | Keys and clickers, customisable | Markers to jump between points | Settings panel | Double-click while prompting to edit in place; double-click or Esc to leave | Elapsed and remaining time | Editor chrome hides while prompting |
| Zoom floating meeting controls | Not applicable | Not applicable | Not applicable | ··· on the share bar | Not applicable | Meeting duration | Auto-hides while sharing; users complain it hides when they need it and shows when they do not |
| Google Meet picture-in-picture | Not applicable | Mic, camera, raise hand, leave | Not applicable | "Back to tab" for everything else | Not applicable | Not applicable | Controls appear on hover over the small window |
| Arc mini player, browser PiP (Firefox, Safari) | Not applicable | Play/pause | Skip back and forward | Back to the tab | Not applicable | Progress | All controls appear on hover; resize from a corner |
| Raycast windows | Not applicable | Not applicable | Not applicable | ⌘K action panel listing every action with its shortcut; a small toolbar mirrors the key actions | In place | Not applicable | Raycast added a visible action bar after a hidden button hurt discovery |

What the evidence says:

1. **Text size is always a pair of one-step buttons right beside the notes.** PowerPoint, Keynote and Google Slides each put them there, not in settings. No tool uses an S/M/L/XL picker for this.
2. **Small floating windows show a handful of frequent controls on hover, and send everything else to one place** (Meet's "Back to tab", Zoom's ···, Raycast's ⌘K list).
3. **Auto-hide must not hide state the user needs.** Zoom's floating controls are the cautionary tale: forum threads ask for them to stay put or stay gone. Keynote hides only buttons, never the notes or the timer.
4. **Edit in place.** Keynote and QPrompt let you edit notes during the show; QPrompt uses double-click, with Esc or double-click again to leave.
5. **Hidden controls are found about half as often.** NN/g's study of 179 users found hiding main navigation cut discoverability almost in half, and the effect was larger on desktop. Icons need text labels or reliable tooltips.
6. **Timers have visible pause and reset** in PowerPoint and Slides. Nobody relies on "click the number".

Sources:
[PowerPoint Presenter View](https://support.microsoft.com/en-us/office/use-presenter-view-in-powerpoint-fe7638e4-76fb-4349-8d81-5eb6679f49d7) ·
[PowerPoint notes text](https://support.microsoft.com/en-us/powerpoint/format-text-in-the-notes-pane) ·
[Aberdeen Presenter View guide](https://www.abdn.ac.uk/toolkit/documents/uploads/ppt-presenter-view.pdf) ·
[Keynote presenter display](https://support.apple.com/en-ph/guide/keynote/tana4da2681/mac) ·
[Google Slides present mode updates](https://workspaceupdates.googleblog.com/2019/06/slides-present-mode-updates.html) ·
[Slidesgo, Slides presenter view](https://slidesgo.com/slidesgo-school/google-slides-tutorials/how-to-use-the-presenter-view-in-google-slides) (third-party) ·
[BIGVU teleprompter settings, mobile](https://faq.bigvu.tv/en/articles/8034805-teleprompter-settings-iphone-ipad-or-android-devices) ·
[BIGVU web teleprompter](https://faq.bigvu.tv/en/article/teleprompter-settings-web-platform-1n7yrhq/) ·
[PromptSmart Pro listing](https://apps.apple.com/app/id894811756) ·
[Teleprompter Studio listing](https://apps.apple.com/app/id6753733850) ·
[QPrompt](https://qprompt.app/) (feature page; no code consulted) ·
[Zoom community: hiding floating controls](https://community.zoom.com/t5/Zoom-Meetings/Screen-Sharing-How-to-PERMANENTLY-HIDE-all-the-floating-toolbars/m-p/94019) ·
[Zoom community: controls disappearing](https://community.zoom.com/t5/Zoom-Meetings/Controls-disappearing-during-screen-share/m-p/64924) ·
[Google Meet picture-in-picture](https://support.google.com/meet/answer/13665919) ·
[Meet PiP update, 2023](https://workspaceupdates.googleblog.com/2023/06/enhanced-experience-picture-in-picture-google-meet-chrome.html) ·
[Chrome Document Picture-in-Picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture) ·
[Arc Mini Player](https://resources.arc.net/hc/en-us/articles/19234766331799-Mini-Player-Watch-or-Listen-as-you-Browse) ·
[Orion forum on PiP hover controls](https://orionfeedback.org/d/358-custom-pip-implementation/87) (user post) ·
[Raycast action panel](https://manual.raycast.com/action-panel) ·
[Raycast, a fresh look and feel](https://raycast.com/blog/a-fresh-look-and-feel) ·
[NN/g, hamburger menus on desktop](https://www.nngroup.com/articles/find-navigation-desktop-not-hamburger/) ·
[NN/g, icon usability](https://www.nngroup.com/topic/icons/).
Gaps: PromptSmart and Teleprompter Premium publish no control layout; "Teleprompter Premium" could not be found under that name (the closest, Telepromptus Premium, lists the same font, speed and margin settings).

## 3. Principles for pagecue's controls

1. **Cues first; controls only for what a presenter does while talking.** That is text size, pause, section lines and the menu. They live on the footer, show when the pointer moves, and fade after 2 s.
2. **State never fades.** The cue light, "3 of 8" (or "Paused"), and the lines indicator while lines are on stay visible at rest, because each one tells the presenter something about what viewers see or what the window is doing.
3. **Put each control where the need arises.** "Reconnect automatically" goes in the reconnect error. "Add a cue" goes in the empty list. "Done" goes in the edit field. The menu is the index, not the only way in.
4. **A newcomer needs labels and visible affordances.** Use familiar glyphs (two A's, a chevron), words where an icon would be a guess ("Lines", "Resume", "Done"), and a tooltip plus `aria-label` on everything. Keyboard shortcuts are shown next to actions but are never the only way.
5. **One-time hints, never tours.** At most one quiet tip line, placed at the end of the cue list, dismissed for good after one click or after the user does what it says.
6. **At most four controls per bar.** That keeps it working at 320 px.

## 4. A first-time user's session

This walkthrough drives the placement decisions in section 5.

**1. Install.** They add pagecue from the Chrome Web Store. Chrome shows its own "added" bubble and tucks the icon under the puzzle piece. *Stuck point:* they cannot find the button later. *Decision:* no extra welcome window (it would pop up unasked). The idle empty state already tells them to pin it, and the store listing's first screenshot shows the pin step.

**2. First open.** They click pagecue on the page they will present. The prompter opens beside it, connects, and shows "No cues on this page yet. Ask your agent to add them. In Claude Code: /pagecue:add-cues". *What they try:* look for a way to write cues themselves. *Stuck point:* today there is none here; adding lives in the menu. *Decision:* the empty state gets a second line, "Or write your own: scroll the page to where a part starts, then", followed by an **Add a cue here** button. The bars stay visible while the list is empty (nothing to compete with), so they also see the footer controls once.

**3. Cues arrive from Claude.** The list fills in page order and the current cue lights up as they scroll. *What they try:* scroll the page and see the list follow; click a cue and see the page jump. Both work. *Stuck point:* they do not know cues can be edited, and they may single-click hoping to edit. *Decision:* a one-time tip line at the end of the list: "Scroll the page or this list; they move together. Double-click a cue to change its words." with a **Got it** button. It goes away for good on Got it, on the first edit, or after the first time they turn on section lines.

**4. Preparing the window.** They resize it narrow and put it next to the camera. *What they try:* make the text bigger. *Decision:* the footer has two A buttons, the small A and the large A, the same pair PowerPoint, Keynote and Slides use. Each press is one step. The one at the end of the scale greys out, so they learn the range without reading anything.

**5. First presentation.** They share only the site's tab in Zoom. Two seconds after the pointer stops, the title, timer and buttons fade. What remains is the cues, a green dot and "3 of 8". *What they try:* check that it is still working. The green light and the moving cue answer that. *Stuck point:* they want to look ahead without the list snapping back. *Decision:* the light becomes a real 28 px button whose tooltip says "Following the page. Click to pause (P)". **Pause following** is also in the menu. While paused, "3 of 8" becomes a labelled **Resume** button in amber and the bars stay visible, so the way back is never hidden.

**6. Text still too small mid-talk.** They move the pointer and the footer appears with the A buttons at the bottom right, where Presenter View users expect them. One click, done; the bar fades again.

**7. Tuning a cue.** In rehearsal, they double-click a cue (the tip told them). The headline and points become editable in place, with **Delete cue** on one side and **Done** on the other. Today only Esc and clicking away exist; a newcomer needs the visible Done. Delete removes the cue at once and shows a toast "Cue deleted" with **Undo** for 5 s, instead of a confirmation dialog.

**8. Moving where a cue starts, or adding one.** They open ···. The first items are **Add a cue here** (with "at the reading line on the page" under it) and **Edit this cue**. To move a cue's start they turn on **Lines** in the footer: lines appear on the page and the button turns green. The first time, a toast says "Section lines are on the page, so viewers see them. Drag a line's tag to move where its cue starts." The lit Lines button stays visible at rest until they turn it off, so they never present with lines on by accident.

**9. The page reloads mid-talk.** The prompter shows "The page reloaded. Click pagecue in the toolbar to reconnect." *Stuck point:* today the fix ("reconnect automatically") is in the menu. *Decision:* the error itself offers **Try again** and **Always reconnect on example.com**, the permission request in one click. The same switch lives on the current site's row in the Sites sheet.

**10. Another site.** They want to follow a different tab. The title now ends in a chevron (⌄), so it reads as a picker. Clicking it opens the Sites sheet.

**11. Ending.** They stop sharing and close the window. Nothing to save; cues are kept per site. To give the cues to a colleague, the menu has **Export cues…**. Hovering the timer shows a ↺ beside it with the tooltip "Start the timer again", for the next rehearsal.

## 5. Placement

| Function | Place | Control | Visible |
|---|---|---|---|
| Pause / resume following | Top bar, start | Cue light: an 8 px dot centred in a 28 px button. Tooltip "Following the page. Click to pause (P)" or "Paused. Click to resume (P)" | Always |
| Resume while paused | Top bar, end (replaces "3 of 8") | Text button "Resume" in `--standby` | Always while paused |
| Position | Top bar, end | Text "3 of 8" | Always |
| Switch site | Top bar, middle | Page title + 10 px chevron; tooltip "Switch site"; opens the Sites sheet | Fades |
| Timer | Footer, start | Text "12:04"; on hover a ↺ appears after it; click resets; tooltip "Time presenting. Click to start again" | Fades |
| Section lines | Footer, end group, first | Toggle button: lines icon + the word "Lines", `aria-pressed` | Off: fades. On: stays at rest |
| Text size | Footer, end group | Two buttons, small A and large A | Fades |
| Menu | Footer, far end | ··· button, `aria-label="More"` | Fades |
| Next / previous cue | None on screen | Keys, clickers, scrolling either side, clicking a cue | n/a |
| Edit a cue | On the cue | Double-click, or Enter on the current cue; also **Edit this cue** in the menu | n/a |
| Finish editing | Inside the cue in edit mode | **Done** button (end); Esc cancels, clicking away saves | While editing |
| Delete a cue | Inside the cue in edit mode | **Delete cue** (start), then a toast with **Undo** | While editing |
| Add a cue | Menu (first item); empty state button; page "+ Add cue here" while lines are on; N | Menu item and buttons | n/a |
| Reconnect automatically | Needs-access empty state; Sites sheet, current site row | Button "Always reconnect on host"; switch in the sheet | Where needed |
| Theme | Menu | Auto / Dark / Light segmented control | n/a |
| Import, export | Menu | Items | n/a |
| Keyboard shortcuts | Menu, bottom section; `?` opens the menu | List | n/a |

Removed from the menu: text size, section lines, reconnect automatically, switch site.

## 6. Wireframes

At rest (pointer still for 2 s):

```
 ●                                         3 of 8

   Costs rose, then flattened

 ▍ Churn down to 2.1%
 ▍ ·  Was 3.4%
 ▍ ·  Onboarding changes did it

   Pipeline 1.8x quota
                                         [≡ Lines]   ← only while lines are on
```

Pointer moving (440 px):

```
 ●  Q3 business review ⌄                   3 of 8
   ...cues...
 12:04                    [≡ Lines]  [A][A]  [···]
```

Paused:

```
 ●  Q3 business review ⌄                 [Resume]     ← amber light, bars stay
```

Editing a cue (bars stay visible):

```
 ▍┌──────────────────────────────────────────┐
 ▍│ Churn down to 2.1%                        │
 ▍│ Was 3.4%                                  │
 ▍│ Onboarding changes did it                 │
 ▍└──────────────────────────────────────────┘
 ▍  Delete cue                          [Done]
```

Narrow, 320 px, pointer moving:

```
 ●  Q3 business re… ⌄          3 of 8
   ...cues...
 12:04       [≡ Lines] [A][A] [···]
```

Width budget at 320 px: 16 px gutters leave 288 px; timer 44, Lines 68, the A pair 60, ··· 32, gaps 16, total 220. Below 300 px the word "Lines" is dropped and only the icon shows (the tooltip and `aria-label` remain).

## 7. The menu, in order

1. **Add a cue here**, with "at the reading line on the page" under it, and the key N on the right (disabled when no page is connected)
2. **Edit this cue**, Enter (disabled when there are no cues)
3. **Pause following** / **Resume following**, P
4. divider
5. **Theme**: Auto / Dark / Light
6. divider
7. **Import cues…**
8. **Export cues…** (disabled with no cues)
9. divider
10. **Keyboard shortcuts**: a list of next/previous (↓ ↑, Space, clicker), from anywhere in Chrome (Alt Shift ↓ ↑), pause (P), add a cue (N), section lines (L), text size (⌘ + / ⌘ −), edit (double-click or Enter), this menu (?)

Each action item shows its key at the end in `--muted`, as Raycast does, so the menu also teaches the shortcuts.

## 8. Replacing the "Lines on page" pill

A **Lines** toggle in the footer's control group: an icon of three short horizontal strokes (16 px, 1.5 px stroke) and the word "Lines" at 13 px weight 500, in a 28 px high button with a 6 px radius and no border.

- Off: `--muted` text and icon; hover gives an `--line` background. It fades with the footer.
- On: icon and text in `--live`, background `color-mix(in srgb, var(--live) 14%, transparent)`, still no border. It does not fade at rest; it is the one control that stays, at full strength, because the lines are on the shared page.
- Tooltip and `aria-label`: off, "Show section lines on the page (L). Viewers will see them."; on, "Section lines are showing on the page, where viewers see them. Click or press L to hide."
- First time on: the toast in step 8 of the walkthrough.

## 9. Keyboard shortcuts

Unchanged: ↓ ↑ J K PageDown PageUp Space (next/previous), Alt+Shift+↓/↑ from anywhere in Chrome, P pause, N add, L lines, Enter edit, Esc cancels edit or closes a sheet, ⌘/Ctrl + and − text size. New: `?` opens the menu scrolled to the shortcuts. Every on-screen control names its key in its tooltip.

## 10. Accessibility and bidi

- Every icon button has `aria-label` and `title`. Text-size buttons use `disabled` at the ends of the scale (opacity 0.35), and on each change a visually hidden `aria-live="polite"` region says "Text size L".
- Toggles use `aria-pressed` (Lines, the cue light: pressed means paused). The ··· button keeps `aria-expanded` and `aria-haspopup="menu"`.
- `:focus-visible` gets a 2 px `--live` outline on every control. Chrome bars never fade while focus is inside them (the idle hook already wakes on `focusin`; also treat `:focus-within` on a bar as active).
- Hit targets are at least 28×28 px with 4 px between them. The dot keeps its 8 px look inside a 28 px button.
- Both bars get `dir="ltr"`, because the chrome is English and the icon order must not flip for Hebrew cues. The title keeps `dir="auto"` with `text-align: left` and `unicode-bidi: isolate`, so a Hebrew title stays next to the light and the ellipsis falls at its logical end.
- Cue text, the edit fields and the tip line keep `dir="auto"` and logical properties, as today.
- Under `prefers-reduced-motion`, the bars appear and disappear with no fade.

## 11. Implementation

`extension/src/prompter/useSettings.ts`
- Add `tipSeen: boolean` and `linesExplained: boolean` (default false) to `Settings`, stored like the others.
- Export `TEXT_SIZE_ORDER` (the existing `ORDER`) so the footer can tell when it is at either end.

`extension/src/prompter/components/TextSizeButtons.tsx` (new)
- Two `<button>`s in a `role="group" aria-label="Text size"`. The glyph is "A" at 12 px and at 17 px, weight 600. Labels "Smaller text" and "Larger text"; titles "Smaller text (⌘−)" and "Larger text (⌘+)". Each calls `stepTextSize`; disabled at S and at XL. Includes the hidden live region.

`extension/src/prompter/components/LinesToggle.tsx` (new)
- An inline SVG icon plus a "Lines" span (hidden below 300 px), `aria-pressed`, the tooltips in section 8. Calls `onToggle`.

`extension/src/prompter/App.tsx`
- Top bar: add `dir="ltr"`. Wrap the light in a 28 px button with `aria-pressed={paused}` and the new titles. Add the chevron inside `.page-name` and `title="Switch site"`. While paused, render a `Resume` button in place of `.position`.
- Footer: `dir="ltr"`. Layout: `<Timer/>`, a spacer, then `.controls` containing `<LinesToggle/>`, `<TextSizeButtons/>` and the ··· button. Delete the `.lines-on` pill. Give the Lines toggle class `is-sticky` when on, so it ignores `.is-quiet`.
- `showChrome` also stays true when `cues.length === 0` and while focus is inside a bar.
- Toast state becomes `{ text, action?: { label, run } }`. Delete shows "Cue deleted" with Undo, which re-adds the cue with `change({ kind: 'import', cues: [removed] })`. The first time lines are turned on (`!settings.linesExplained`), show the lines toast and set the flag.
- `?` opens the menu with the shortcuts in view. Menu props: drop the text size, lines, remember and switch-site props; add `onEditCurrent`, `paused` and `onTogglePause`.
- `Empty`: in connected-and-no-cues, add "Or write your own…" and an **Add a cue here** button (calls `send({ type: 'add-cue' })`). In needs-access, add **Always reconnect on {host}** beside Try again (calls `toggleRemember`, then `reconnect`), and drop the text pointing to the menu. In closed, say "Open it again, or click the page title to switch site."
- Pass `tip` to `CueList` while `!settings.tipSeen`, and set the flag on Got it, on the first save, and on the first lines toggle.

`extension/src/prompter/components/Menu.tsx`
- New contents and order as in section 7, with a `<kbd>` key at the end of each action. Remove the text-size row, the section lines item, the remember item and "Switch site…". Keep focus handling and Esc.

`extension/src/prompter/components/CueCard.tsx`
- The edit actions row: **Delete cue** at the start, a **Done** button at the end that commits (the same path as blur).

`extension/src/prompter/components/CueList.tsx`
- A `tip?: { text: string; onDismiss: () => void }` prop, rendered as an `<li className="tip" dir="auto">` before the footnote, with a Got it button.

`extension/src/prompter/components/SitesSheet.tsx`
- Props `remembered: boolean | null` and `onToggleRemember`. The current tab's row in "Open now" gets a switch "Reconnect automatically" (hidden when `remembered === null`, as for local files).

`extension/src/prompter/components/Timer.tsx`
- An `aria-label` with the time ("Time presenting, 12 minutes 4 seconds. Start again"); a ↺ span shown on hover and focus; title "Time presenting. Click to start again."

`extension/src/prompter/styles.css`
- `.icon-button` (28 px, 6 px radius, transparent, `--line` on hover, `--live` focus ring); `.controls` (flex, 4 px gap); `.size-buttons` (2 px gap); `.lines-toggle` and `.lines-toggle[aria-pressed='true']`; `.is-quiet .lines-toggle.is-sticky { opacity: 1 }`; `.resume`; `.page-name .chevron`; `.timer .reset`; `.tip`; `.kbd` in menu rows; `@media (max-width: 299px)` hides `.lines-toggle .label`.
- Remove `.lines-on` and `.lines-on::before`. Remove the text-size `.menu-row` styles if nothing else uses them.

`extension/e2e/run.mjs`
- Replace `.lines-on` with `getByRole('button', { name: /Section lines are showing/ })`. Add steps: the larger-A button raises the size and is disabled at XL; the delete toast's Undo restores the cue; the needs-access state offers "Always reconnect". The ··· selector stays `.menu-button`.

`docs/design/prompter.md`
- Update the Layout sketch (footer: timer, Lines, A A, ···), principle 2 (the Lines toggle stays at rest while on), and the Controls table (text size on the footer, reconnect in the error and Sites sheet, Done and Undo). Link to this document.

`README.md`
- Update any screenshot or text that mentions text size in the menu or the "Lines on page" pill.
