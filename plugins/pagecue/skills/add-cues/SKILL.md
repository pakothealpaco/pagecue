---
name: add-cues
description: Add presenter cues to a report, dashboard or website so it can be presented with the pagecue Chrome extension's private prompter. Marks the breakpoints in the page with data-pagecue attributes and writes short speaker notes (a headline, a key number, up to three points) from what the user wants to say. Use when the user wants speaker notes, talking points, cue cards, a teleprompter or "what to say" for a page, site or report they will present or screen-share, in any language (for example Hebrew שליפים, נקודות דיבור, מה להגיד), or asks to add, change or remove pagecue cues, including from inside their Chrome tab.
---

# Add pagecue cues

pagecue lets someone present a web page in Zoom, Meet or Teams while a private prompter window, which they do not share, shows what to say for the part of the page on screen. The presenter never attaches cues by hand: placing them is your job, so get it right. Each **cue** is attached to one element of the page (a section, chart, table or card) and holds a one-line headline and a few speaker notes. Scrolling the page moves the prompter to the matching cue, and the prompter can scroll the page.

Your job is to make the page ready: mark the breakpoints in the page source and write the cues.

## 0. If the prompter is open, work live

The pagecue MCP server lets you operate the open prompter. Call `pagecue_status` first: when the prompter is open it tells you the page, every cue in order (with the presenter's own edits) and which cue is current, so "here", "this part" and "the next one" have a meaning. Then:

- one cue: `add_cue` (with `near` set to the exact text of the heading where it starts, or without it to start at the reading line, where the presenter is now), `edit_cue`, `remove_cue`, `show_cue`;
- the view: `set_view` for section lines on the page, pausing, text size and theme; `open_page` to move to another page.

Changes show in the prompter at once, each with Undo. Use these for anything the presenter asks about the cues on the page in front of them, including requests with a screenshot ("add this here": find the heading text in the screenshot and pass it as `near`). For a whole new set of cues for a page, follow the steps below and publish.

## 1. Find the page

Work on the page the user means: usually the report or site you just generated in this conversation. If it is not clear, ask which file or route. Read the page source end to end before planning; you must not invent content.

## 2. Plan the breakpoints

List the points where the presenter's talk changes topic, in page order: usually each section, and each chart, table or figure that needs explaining. Aim for one cue per screenful the presenter will talk to (typically 5 to 15). Skip decoration, navigation and footers.

Give every breakpoint a short, stable kebab-case id that names the content (`revenue-chart`, `churn`, `risks`), not its position (`section-3`).

## 3. Ask what the user wants to say

Unless the user already told you what to say, show the plan as a compact numbered list (id and what the element shows) and ask, in the user's language, what they want to say at each point. Make answering easy:

- they can answer for only some points, in any order, by number or name;
- they can dictate (Claude Code's `/voice`), in any language;
- "you write it" means you draft the cue from the page content;
- "skip" removes a breakpoint.

Ask once, then work with what you get. Do not run a long interview.

## 4. Write the cues

Write cues in the language the user speaks to you (any language: English, Hebrew, Chinese, Arabic, Spanish, French and so on), unless they ask for another one. For each cue:

- **title**: the point to make, as a glanceable headline of about eight words or fewer ("Churn down to 2.1% after onboarding fix"), not a label ("Churn section").
- **notes**: at most three short points, each a phrase of about twelve words or fewer:
  - the one number or fact to say out loud, if there is one;
  - the reason or the "so what";
  - optionally the likely question and the answer, as `Q: … → …`.
- Use only facts that are on the page or that the user gave you. Never invent numbers, names or explanations. If the user's note contradicts the page, keep the user's wording and tell them about the conflict.
- Keep the user's own words and emphasis when they dictated a note; tighten them, do not rewrite their meaning.

## 5. Mark the elements

Add `data-pagecue="<id>"` to the element each cue belongs to: the container that holds the whole topic (a `section`, `figure`, `table` or card), not a single word. Rules:

- Each value must appear on exactly one element of the rendered page.
- Edit the **source** the page is built from (HTML, JSX, TSX, Vue, Svelte, Markdown/MDX), not a build output. In JSX write `data-pagecue="revenue-chart"`; it passes through to the DOM. For a component rendered several times, pass the id as a prop (`data-pagecue={id}`); the checker cannot see those values and reports them as warnings, so confirm each one renders.
- Do not change anything else: no layout, style, text or behaviour changes. The attribute is invisible.
- For a chart drawn on a `<canvas>` or in an SVG, mark its wrapping element.

## 6. Publish the cues

Write the cues to a cue file in the format below, then **publish** it, so the presenter's prompter shows the cues by itself within seconds, with no import or setup:

- With the plugin's MCP tool: `publish_cues` with the page `url` (exactly as the presenter opens it: `https://…`, `http://localhost:…` or `file:///…`) and `cues_path` (absolute path of the cue file).
- Or from a shell: `node "${CLAUDE_PLUGIN_ROOT}/server/bridge.mjs" publish <page-url> <cues file>`

Publishing works for every page, including pages that are not yours and files opened from disk. Publish again after every change; an open prompter updates within a few seconds, and the presenter's own wording edits are kept.

Optionally, when the page is yours and its cues should travel with it (for other presenters, or another computer), also ship the cue file with the page. Pick one:

1. **Linked file (default for pages served over http or https, including local dev servers).** Save `<page-name>.cues.json` next to the page and add, inside `<head>`:
   `<link rel="alternate" type="application/vnd.pagecue+json" href="<page-name>.cues.json">`
   In a framework, put the file where static files are served (for example `public/`) and add the link in the document head.
2. **Inline (required for files opened from disk, `file://`).** Chrome does not let extensions read a linked file next to a page opened from disk, so for a standalone HTML report, or any single file that must stay one file, put the JSON in
   `<script type="application/vnd.pagecue+json"> … </script>` inside `<head>`.
3. **Private.** If the page will be published where people other than the presenter can open it, the linked or inline cue text is readable by anyone who views the source. Then write the cue file somewhere that is **not** published, do not add the link, and tell the user to load it with the prompter's ⋯ menu → **Import cues**. The `data-pagecue` attributes alone reveal nothing.

The linked file must be on the same site (origin) as the page; pagecue ignores cue files from other sites. If you cannot tell whether the page will be published, use option 1 for dev servers, option 2 for files opened from disk, and ask before using either for a deployed site.

Cue file format (`pagecue` format version 1; full JSON Schema: `${CLAUDE_PLUGIN_ROOT}/schema/pagecue.schema.json`):

```json
{
  "pagecue": 1,
  "title": "Q3 business review",
  "cues": [
    {
      "id": "revenue-chart",
      "title": "Revenue up 24% in Q3",
      "notes": ["Driven by new EU customers", "Key number: 24%", "Q: will it hold? → two cohorts so far"]
    }
  ]
}
```

- `id` attaches the cue to the element with `data-pagecue` equal to it. Use `"anchor": "<other-value>"` only if the cue must attach to a differently named element.
- `notes` is an array of strings, one point each.
- List cues in page order.
- Optional `startAt` moves where a cue comes up, as a share of its section's height (`0.5` is half a section later). Leave it out; the presenter tunes it by dragging section lines, and exported cue files carry their adjustments.

## When the page is not yours

For a page whose source you cannot edit (a live product page, a vendor dashboard, someone else's report), skip step 5 and anchor each cue to the page as it is:

1. Read the rendered page (with a browser tool if you have one) and list its visible section headings.
2. Give each cue an object anchor naming the heading's tag and its exact visible text, for example `"anchor": { "tag": "h2", "text": "Premium design", "heading": "Premium design" }`. The extension finds the heading by its text, tolerates small wording changes and ignores hidden copies. Pick headings whose text is unique on the page.
3. Save the cue file outside the site and publish it (step 6). The prompter picks it up by itself.

The checker cannot verify text anchors against a live page; if you have a browser tool, open the page and confirm each heading's text exists exactly once.

## In the user's browser (Claude in Chrome)

If you are working inside the user's Chrome tab rather than on files, and the page has `window.pagecue` (check with your JavaScript tool: `typeof window.pagecue`), the pagecue prompter is open on it and you can edit cues directly; they are saved in the extension and appear in the prompter at once, with Undo for the presenter. Skip steps 5 to 7.

1. Run `pagecue.help()` once, then `await pagecue.cues()` to see what is there.
2. To add a cue, `await pagecue.add({ title, notes, near })`, where `near` is the exact visible text of the heading (or the start of the paragraph) where the cue should start. When the user sends a screenshot and says "here", find that heading's text on the page. Without `near`, the cue starts at the reading line, a third of the way down the window.
3. `pagecue.edit(number, { title, notes })`, `pagecue.remove(number)` and `pagecue.show(number)` change, delete and jump to a cue.
4. Write cues by the rules in step 4, then tell the user in one line what you added.

If `window.pagecue` is missing, ask the user to click the pagecue button in Chrome's toolbar on this page, then try again.

## 7. Check

Run the checker on the cue file and the page source (a file or a folder):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-cues.mjs" <cues file> <page source file or folder>
```

For inline cues, pass the HTML file as the cues file: `check-cues.mjs report.html report.html`.

Fix every `✗` line. `!` lines are advice: shorten long titles and notes, and make sure an id reported more than once renders only once.

## 8. Tell the user how to present

Finish with a short summary in the user's language: how many cues, the list of titles, where the cue file is, and these steps:

1. Install the pagecue extension for Chrome if it is not installed yet.
2. Open the page in Chrome and click the pagecue button in the toolbar (or press Alt+Shift+P). The prompter opens in its own window with the cues. If it was already open, the cues have appeared in it.
3. In Zoom, Meet or Teams, share only the page's tab or window, never the whole screen.
4. Scroll the page, or scroll and click the prompter, and the other side follows. PageDown and PageUp (or a presentation clicker) step through cues while the prompter has focus; Alt+Shift+↓ and Alt+Shift+↑ work from anywhere in Chrome.
5. To see and tune where each cue comes up, press L in the prompter: lines appear on the page and each one can be dragged. Viewers see them too, so press L again before presenting.
6. To fix wording, double-click a cue in the prompter. Those edits stay in the extension and win over the cue file. To move, add or remove cues, ask you (the agent) again.

## Changing cues later

Keep existing ids stable so the presenter's prompter edits stay attached. To add, remove or reword cues, update the attributes and the cue file together and run the checker again. Cues the presenter edited in the prompter keep their edited text even when the file changes; cues removed from the file disappear from the prompter unless the presenter edited them.
