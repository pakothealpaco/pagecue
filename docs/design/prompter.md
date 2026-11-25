# Prompter design

The prompter is a confidence monitor: the screen a speaker glances at while talking to an audience that cannot see it. It is read in half-second glances, from arm's length, while the presenter is thinking about something else. Everything on it either helps that glance or gets out of the way. The research behind these choices is in [research-presenter-ui.md](research-presenter-ui.md).

## Principles

1. **One thing is lit.** The current cue is bright; everything else recedes. The page is cut into full-width horizontal parts, one per cue; a cue is current from the moment its line reaches the page's reading line until the next cue's line does. Side-by-side sections split their row in reading order, so two cues are never lit together. The list moves with the page continuously, so the lit cue rides the reading line.
2. **No chrome at rest.** While you present, the window shows only cues, a cue light and "3 of 6" (and the Lines button while section lines are on, because viewers see them). The title, timer and controls appear when the pointer moves and fade away after two seconds. Where each control sits, and why, is in [controls.md](controls.md).
3. **The agent places cues; people polish words and tune.** There is no element picking or edit mode. The presenter can still add a cue at the reading line, drag where a cue starts, or delete one. Click a cue to bring its part of the page into view; double-click it to fix the wording.
4. **Colour means state, like stage cue lights.** Green is live and following, amber is paused, red is an error. The green rail beside the current cue is the same light.
5. **Motion answers the presenter.** The prompter follows the page with a short spring and never animates on its own. With reduced motion turned on, it jumps instead.

## Layout

```
 ● Q3 business review                     3 of 6     ← fades when idle; the light stays
                                                     
   Costs rose, then flattened                        ← previous cue, receding
   +11% after the March migration                    
                                                     
 ▍ Churn down to 2.1%                                ← current cue, at 30% height
 ▍ ·  Was 3.4%                                       
 ▍ ·  Onboarding changes did it                      
                                                     
   Pipeline 1.8x quota                               ← next cue
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ← fade at the bottom edge
                                        0:42    ···  ← fades when idle
```

The text is aligned to the start of the line, which is the right edge for Hebrew. Every headline and bullet has `dir="auto"`, and the layout uses logical properties, so mixed Hebrew and English lays out correctly.

## Tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#101318` | `#F4F6F9` | window |
| `--raised` | `#191D24` | `#FFFFFF` | menu, edit field |
| `--ink` | `#ECE8E1` | `#151A22` | cue text |
| `--muted` | `#8A919C` | `#5E6672` | meta, bullets' markers |
| `--line` | `#252A33` | `#DDE2E9` | hairlines |
| `--live` | `#6FD3A0` | `#1E9E63` | cue light, current-cue rail, focus |
| `--standby` | `#E8B85C` | `#B07A12` | paused |
| `--fault` | `#F08072` | `#C2412F` | errors |

**Type:** IBM Plex Sans with IBM Plex Sans Hebrew (SIL Open Font License), bundled with the extension so no font is fetched. Headline 24 px / 1.22, weight 600, tracking −0.01em; bullets 18 px / 1.5, weight 400; meta text 13 px, weight 500, tabular figures. Text size steps S, M, L, XL multiply these by 0.88, 1, 1.15 and 1.3. Line length stays under about 42 characters at the default window width.

**Space:** an 8 px grid. Side gutters 24 px; 12 px from headline to the first bullet; 8 px between bullets; 44 px between cues.

**Emphasis:** opacity `0.36 + 0.64 × p`, where `p` is 1 at the reading line and falls to 0 one cue away. The rail's opacity is `p`. No blur, borders, backgrounds or shadows on cues.

**Motion:**
- Follow-scroll is a frame-driven spring (τ ≈ 120 ms) that changes target as the page moves.
- Chrome fades in over 180 ms and out over 240 ms, using `cubic-bezier(0.2, 0, 0, 1)`.
- The menu opens in 140 ms (opacity and a 0.98 to 1 scale).
- Toasts last 3.5 s.

## Controls

| Action | How |
|---|---|
| Show this part of the page | click a cue |
| Fix the wording | double-click a cue, or Enter on the current one; Esc cancels, clicking away saves |
| Next / previous cue | ↓ ↑, J K, PageDown PageUp, Space; a presentation clicker; Alt+Shift+↓/↑ from anywhere in Chrome |
| Pause following | P, or the cue light |
| Add a cue (a new part) | double-click empty space in the prompter, N, the ··· menu, or "+ Add cue here" on the page's reading line while section lines are on; it opens for writing. Delete from the cue's edit mode |
| Section lines on the page | **Lines** in the footer, or L; a full-width line per cue and a tint over the current part; drag a line's tag to move where its cue starts, double-click to reset. The Lines button stays lit and visible while they are on, because viewers see them |
| Text size | the two A buttons in the footer, or ⌘/Ctrl + and − |
| Switch site, reconnect automatically | the page title (opens the site list); "Always reconnect" also appears when a page reloads |
| Finish editing, delete | the cue lifts onto one quiet sheet, its text in place; **Done** and **Delete** sit on a hairline at its foot, and Delete offers Undo. A new cue left empty is removed |
| Everything else | the ··· menu: add a cue, edit this cue, pause, theme, import and export cues, keyboard shortcuts (?) |

## Removed from the first version

Section lines are the one thing pagecue draws on a page. They are off by default, turned on only by the presenter, and drawn in a shadow root that never changes the page's layout.

The toolbar, the Edit/Present switch, element picking, "Cue here", re-attaching, per-cue badges and links, card borders and backgrounds, the reading-line arrow, and the always-visible scrollbar. Cues the page cannot find are summarised in one quiet line at the end of the list; fixing them is the agent's job.
