# How pagecue works

```
 your page (shared)                      pagecue prompter (private window)
┌─────────────────────────┐             ┌──────────────────────────┐
│ <section data-pagecue=  │  position   │  Revenue up 24% in Q3    │
│        "revenue">       │ ──────────▶ │ ▶ Churn down to 2.1%  ◀──┼── reading line
│ <figure data-pagecue=   │ ◀────────── │    • Was 3.4%            │
│        "churn">         │  scroll-to  │    • Onboarding fix      │
└─────────────────────────┘             └──────────────────────────┘
```

Both sides describe where they are as *"cue n, x% of the way to the next one"*, measured in their own layout. Neither side ever sees the other's pixels, so the sync holds across any window sizes. A cue finds its element again through several anchors, tried in order: the site's `data-pagecue` attribute, a stable id, a test id, a CSS selector checked against the element's text, then a fuzzy text match. A cue that can't be found is listed as missing. pagecue never quietly attaches it to some other element.


## Parts, not slides

The page is cut into horizontal parts, one per cue, each the full width of the page: a cue starts at its line and runs to the next cue's line. One cue is current at a time, the one whose line has passed the reading line (about a third of the way down the window). Where two sections sit side by side, the row is split between them in reading order. A cue added by hand starts exactly where you added it, and dragging its line in section-lines mode moves that start; both are kept as a share of the element the cue is attached to, so they survive window resizes and zoom.

## Pages, frames and agents

- **Inner scrolling.** Dashboards and apps that scroll an inner container are followed through that container.
- **Single-page apps.** A route change switches to that route's cues. A page that only rewrites its own address while you scroll (`?p=2`, or a docs site moving from `/api` to `/api/errors`) keeps its cues.
- **Frames.** A page that is only a shell around one frame (a claude.ai artifact, a Streamlit app) hands the presenting over to the content script inside that frame, which then does everything the page would have done. The handoff is a bare signal; no cue data passes through the page.
- **Agents.** Claude Code and the Claude app reach the prompter through a small local server in the plugin (`127.0.0.1` only). Nothing is added to the page itself.
