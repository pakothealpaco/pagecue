# Presenter window UI research (pagecue)

Date: 2026-11-25. Scope: redesign of the private prompter window (about 420x800 px, resizable) that follows the shared page. Numbers marked "proposed" are our design choices, not measured results. Sources are listed per section; some are third-party summaries and are marked so.

## 1. How the best presenter views work

| Product | Shows | Hides / notable |
|---|---|---|
| iA Presenter | Notes teleprompter plus a thumbnail of the audience slide; "Focus on the current note" **dims surrounding notes**; 110 wpm default for time estimates. | Notes in a separate window, only slides shared. Closest analogue: text first, slide secondary. |
| Keynote presenter display | Pick from Current/Next Slide, Notes, Ready-to-Advance, Clock, Timer. Layout controls appear **only when the pointer moves**; notes editable by double-click. | Chrome is hover-revealed. |
| PowerPoint Presenter View / Teams Live | Current, next, notes, timer; notes size buttons in the Notes pane; draggable divider. | Hidden on small screens. Font size is the one setting presenters use. |
| Google Slides | Notes, prev/next, auto-start timer (pause/reset). | Resizable notes. |
| Gamma, Pitch | Private per-card notes; Gamma edits by double-click, has a timer. | Complaints: notes vanish in full screen. Pitch info third-party only. |
| reveal.js | Current/next slide, notes, elapsed time, clock; `s` opens it. | Notes per slide. |
| Slidev | Previews, notes, timer; notes split by click markers, **active section highlighted and auto-scrolled**. | The pagecue pattern: one column, active part emphasised, rest readable. |
| CueCard | Floating notes window hidden from screen sharing. | Just the text. |
| Notch prompters (Notchie, CueNotch, NotchPrompter, Textream) | Narrow text strip near the camera; size and speed; voice-paced scroll. | Text is the interface. |
| PromptSmart, Teleprompter Pro | Voice-tracked scroll that waits off-script; a "focus indicator" zone on the current line. | Mirror, size. |

Pattern: the winners show **current content large, the next item visible but quieter, and at most one small status element** (timer or position). Everything else is behind a hover or a menu.

Sources: https://ia.net/presenter/support/action/presentation-mode · https://ia.net/presenter/support/action/presentating-online · https://ia.net/presenter/support/basics/settings · https://support.apple.com/en-ph/guide/keynote/tana4da2681/mac · https://support.microsoft.com/en-us/office/format-text-in-the-notes-pane-bf14a18f-5098-4371-aadb-ee3b7e48549c · https://support.microsoft.com/en-us/PowerPoint/present-from-powerpoint-live-in-microsoft-teams · https://support.google.com/docs/answer/1696787 · https://help.gamma.app/en/articles/9028551-how-to-use-speaker-notes-and-presenter-view-in-gamma · https://ideas.gamma.app/ideas/p/improve-present-mode-speaker-notes-and-present-mode-controls · https://www.guideflow.com/tutorial/how-to-view-speaker-notes-while-presenting-in-pitch (third-party) · https://revealjs.com/speaker-view · https://sli.dev/guide/presenter-mode · https://sli.dev/features/click-marker · https://github.com/thisisnsh/cuecard · https://github.com/jpomykala/NotchPrompter · https://raw.githubusercontent.com/f/textream/master/README.md · https://apps.apple.com/us/app/id894811756 · https://chromewebstore.google.com/detail/teleprompter-pro/kjdckhphpkjkhmnohljimhkkgomdnjhe

## 2. Glanceable reading

- **Size scales with distance** (signage rule: letter height in inches = distance in feet / 25). At laptop distance, 17-20 px body text suits glances; teleprompter guides only say "test on the real display". Offer a size control.
- **Line length:** 45-75 characters for reading, 30-50 on narrow screens. 420 px, 24 px gutters and 18 px text give about 40-45, good for glancing.
- **Hierarchy by size and weight, not colour:** headline about 1.3x bullet size, 600 vs 400 weight; line-height 1.2-1.25 headline, 1.45-1.5 bullets.
- **How many items:** one current item plus a preview of the next; three or more full cards compete.
- **Current vs next:** opacity (1.0 vs ~0.4), at most a 0.97 scale. No blur: it hurts the next cue you need in a second and costs GPU.
- **Dark vs light:** dark default (less glare, does not light your face on camera), but no pure white on black (halation, worse with astigmatism): text in the #CCCCCC-#E4E4E4 band, dark grey surfaces. Light mode by system preference.
- **High contrast:** under `prefers-contrast: more`, raise neighbour opacity and use full white text.

Sources: https://knightadrc.wustl.edu/?p=4979 · https://www.uxpin.com/studio/?p=56143 · https://8thlight.com/insights/readability · https://flatisbad.com/resources/Sawyer-HFES17.pdf (Sawyer et al., HFES 2017, glanceable reading) · https://beverlyboy.com/filmmaking/what-is-teleprompter-font-sizing/ · https://www.github.com/Myndex/SAPC-APCA/discussions/111 · https://blog.superhuman.com/how-to-design-delightful-dark-themes/ · https://www.boia.org/blog/dark-mode-can-improve-text-readability-but-not-for-everyone

## 3. Calm, premium utility-window patterns

- **Linear (2024 redesign, 2026-03 refresh):** less weight on navigation so the work area stands out; softer borders; "a few notches dimmer"; inline editing with autosave.
- **Raycast:** Cmd+K opens an action list with shortcuts beside each action; Enter runs the primary action. Raycast admitted a tiny hidden button hurt discovery and added a slim action bar.
- **Superhuman dark themes:** no pure black; elevation by lighter surfaces, not shadows; desaturated accents.
- **Apple apps, Things:** chrome hidden until hover, one accent colour, rows editable in place.
- Adopt: chrome-less header that fades in on pointer movement; one overflow menu; one status dot instead of badges; toasts only for errors or undo (bottom, 3-4 s); a one-line written empty state.

Sources: https://linear.app/now/behind-the-latest-design-refresh · https://linear.app/changelog/2026-03-12-ui-refresh · https://linear.app/now/how-we-redesigned-the-linear-ui · https://linear.app/changelog/2022-06-09-inline-editing · https://manual.raycast.com/action-panel · https://manual.raycast.com/keyboard-shortcuts · https://raycast.com/blog/a-fresh-look-and-feel · https://blog.superhuman.com/how-to-design-delightful-dark-themes/ · https://maggieappleton.com/command-bar

## 4. Motion for scroll-linked UI

- **Interpolate, do not switch.** Give each cue a continuous progress value p (0-1): how central its page region is in the viewport. Map p to opacity and translate; hard class toggles at thresholds cause the jumpy feel. CSS scroll-driven animations (`view-timeline`, `animation-range`) do this off the main thread for the prompter's own scroller (Chrome 115+); for page-driven progress, write one CSS variable (`--p`) per frame from JS.
- **Follow-scroll.** Never fire a new smooth `scrollTo` per event (stacked smooth scrolls stutter). Run one rAF loop toward the latest target with a critically damped spring or `pos += (target - pos) * (1 - exp(-dt/τ))`, τ about 120 ms. It retargets mid-flight without a velocity jump, which is why springs beat fixed-duration ease-outs for interrupted motion (WWDC23 "Animate with springs").
- **Discrete transitions:** 140-200 ms in, 100-150 ms out. Curves: `cubic-bezier(0.2, 0, 0, 1)` (Material standard), `cubic-bezier(0.05, 0.7, 0.1, 1)` (emphasized decelerate). Springs with bounce 0; no visible bounce in a reading tool.
- **Avoid jank:** animate only `opacity` and `transform` (no height, blur, shadow); passive listeners; coalesce content-script messages to one per frame; `contain: layout paint`; no `scroll-snap` (fights follow-scroll).
- **Feedback loop:** track who leads (a driver flag held ~300 ms after the last user input) or the two scrollers chase each other.
- **Reduced motion:** jump scroll, crossfades ≤120 ms or none. JS `scrollIntoView({behavior:'smooth'})` must check `matchMedia` itself.

Sources: https://developer.chrome.com/docs/css-ui/scroll-driven-animations · https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines · https://www.w3.org/TR/scroll-animations/ · https://smashingmagazine.com/2024/12/introduction-css-scroll-driven-animations/ · https://developer.apple.com/videos/play/wwdc2023/10158/ · https://developer.apple.com/documentation/swiftui/spring.md · https://api.flutter.dev/flutter/material/Easing/emphasizedDecelerate-constant.html · https://m1.material.io/motion/duration-easing.html · https://web.dev/articles/prefers-reduced-motion · https://www.smashingmagazine.com/2021/10/respecting-users-motion-preferences/ · https://osvaldas.info/you-probably-dont-need-behaviour-smooth-in-scrollintoview/ · https://bugzilla.mozilla.org/show_bug.cgi?id=1753565

## 5. Editing without an edit mode

- **Keynote, Gamma:** double-click notes to edit mid-presentation. **Linear:** click title or description to edit, autosaved. **Things, Apple Notes:** always editable, no Save button.
- For pagecue: single click scrolls the page (primary action in a talk); **double-click, or Enter on the focused cue**, makes that line `contenteditable="plaintext-only"` in place with a faint 1 px inset outline, no layout shift. Esc reverts; Enter or blur commits. Silent autosave; a small "Saved" in the header for 1.5 s; an error toast with Retry on failure; Cmd+Z works in the field.
- Pause follow-scroll while a field is focused.

Sources: https://support.apple.com/en-ph/guide/keynote/tana4da2681/mac · https://help.gamma.app/en/articles/9028551-how-to-use-speaker-notes-and-presenter-view-in-gamma · https://linear.app/changelog/2022-06-09-inline-editing · https://www.macstories.net/reviews/things-adds-extensive-markdown-support-and-search-for-extended-notes-attached-to-tasks/

## 6. Bidi and Hebrew

- Put `dir="auto"` on **each** headline and each bullet element (not only the card), so a Hebrew bullet in an English cue aligns right and gets its own isolation; first strong character decides. Use `<bdi>` for injected fragments such as numbers or element names. Editable fields also take `dir="auto"`. Use logical CSS (`padding-inline-start`, `text-align: start`, `margin-inline`) so bullets and rails flip automatically.
- Inter has no Hebrew glyphs, so Hebrew falls back to a system font with different metrics. Options (all SIL OFL 1.1, on Google Fonts):
  - **Rubik**: one family drawn for Latin and Hebrew together; slightly rounded, friendly; variable weight 300-900. Best single-family choice.
  - **Heebo**: Hebrew extension of Roboto; neutral and modern; variable 100-900.
  - **Assistant**: Hebrew designed to match Source Sans; light and readable at small sizes.
  - **Noto Sans Hebrew** paired with Noto Sans or Inter (match x-height by `size-adjust`); unmodulated design.
  - System stack fallback: `system-ui, -apple-system, "Segoe UI", "Arial Hebrew", "Noto Sans Hebrew", sans-serif` (SF Pro has no Hebrew; macOS falls back to Arial Hebrew or SF Hebrew).
- Bundle the font inside the extension (no network fetch during a call); subset to Latin + Hebrew.

Sources: https://www.w3.org/International/articles/inline-bidi-markup/ · https://developer.mozilla.org/en-us/docs/Web/html/reference/global_attributes/dir · https://www.w3.org/International/docs/html-bidi-requirements/ · https://github.com/googlefonts/rubik · https://github.com/OdedEzer/heebo · https://www.fontsquirrel.com/fonts/assistant · https://fonts.google.com/specimen/Noto+Sans+Hebrew/about · https://github.com/danielrosehill/Awesome-Hebrew-Fonts

## 7. Recommendation (proposed)

**Layout, top to bottom**
1. Header, 40 px, transparent: page title truncated (13 px, muted) at the start, a 6 px status dot (connected / following / paused) and a "1 of 12" position at the end. Fades to 0 opacity after 2 s without pointer movement; the dot stays.
2. Cue column, fills the window. One continuous list, no card borders or backgrounds. The current cue sits at a fixed anchor about 30% from the top; the previous cue partly visible above, the next 1-2 below. Emphasis comes from interpolated opacity only.
3. Bottom gradient fade (32 px) into the background to suggest more content; no scrollbar visible unless scrolling (`scrollbar-width: thin`, transparent thumb at rest).
4. Footer appears on hover only: optional elapsed timer (start on first scroll, click to reset) and the "..." menu.

**Typography** (Rubik or Heebo; sizes at the default "M" step, scale steps S 0.88x / L 1.15x / XL 1.3x)
- Headline: 24 px / 1.22, weight 600, letter-spacing -0.01em.
- Bullets: 18 px / 1.5, weight 400; bullet marker a 5 px dot in the muted colour, 12 px gap; 8 px between bullets.
- Meta (header, position, timer): 13 px / 1.3, weight 500, tabular numerals.
- Max line length about 42 characters; side gutters 24 px (16 px under 360 px width).

**Spacing**: 8 px grid; headline to first bullet 12 px; between cues 48 px; top padding equal to the anchor offset so the first cue can sit at the anchor.

**Colours**

| Token | Dark | Light |
|---|---|---|
| bg | #121214 | #FAFAF8 |
| surface (menu, editor field) | #1C1C1F | #FFFFFF |
| text | #E6E6E3 | #1A1A1C |
| text-muted | #8E8E93 | #6B6B70 |
| hairline | #2A2A2E | #E6E6E2 |
| accent (focus ring, active rail, caret) | #8AB4FF | #2F6BDE |
| status ok / paused / error | #5BD08A / #E0B050 / #F07A6A | #1F9D55 / #B7791F / #C53B2B |

Neighbour cues: opacity 0.38 (dark) / 0.45 (light); in `prefers-contrast: more`, 0.6 and text #FFFFFF / #000000. The active cue gets a 2 px accent rail on its inline-start edge that fades with the same progress value (replaces the reading-line arrow).

**Motion**
- Active emphasis: continuous, `opacity = 0.38 + 0.62 * p`, `translateY((1 - p) * 4px)`, p from viewport centrality, smoothed per frame.
- Follow-scroll: rAF spring toward target, τ ≈ 120 ms (settles ~400 ms), retargetable; no CSS smooth scroll.
- Prompter click to page: send target, page scrolls with the same spring in the content script.
- Header and footer fade: 180 ms `cubic-bezier(0.2, 0, 0, 1)` in, 240 ms out after 2 s idle.
- Menu: 140 ms opacity + scale 0.98 to 1, origin at the button; exit 100 ms.
- Toast: 200 ms rise 8 px with emphasized decelerate; 3.5 s; exit 150 ms.
- Reduced motion: instant scroll, opacity changes only, ≤120 ms.

**Controls and where they hide**
- Click a cue: show on page (primary action, no link needed). Double-click or Enter: edit in place; Esc / blur as above.
- Keyboard: Up/Down or J/K previous/next cue (scrolls page); Cmd/Ctrl +/- text size; Space pause/resume following; T toggle timer; Cmd/Ctrl+K opens the menu; ? shows the shortcut sheet.
- "..." menu (hover footer or Cmd+K): text size, theme (system/dark/light), follow page on/off, show timer, regenerate cues, keyboard shortcuts.
- Pause indicator: status dot turns amber with "Paused" label in the header (header stays visible while paused).
- Empty states: one centred line of muted text and, where useful, one text button ("Generate cues").

**Remove**
- The toolbar of many buttons (replace with the hover footer plus one menu).
- The Edit / Present toggle (editing is in place).
- Badges and per-card status labels (one status dot for the whole window).
- Per-card "Edit" and "Show on page" links (double-click and click).
- The visible reading-line arrow (replace with the fading inline-start rail).
- Card borders, backgrounds and shadows; hard dimming switches (replace with interpolated opacity).
- Any blur effects and the always-visible scrollbar.
