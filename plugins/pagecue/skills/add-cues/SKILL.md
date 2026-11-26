---
name: add-cues
description: Write presenter cues (speaker notes) for a report, dashboard or web page, for pagecue's private prompter. Use for speaker notes, talking points, what to say, שליפים, or to add or change cues.
argument-hint: "[page URL or file] [what you want to say]"
---

# Add pagecue cues

pagecue lets someone present a web page in Zoom, Meet or Teams while a private prompter window, which they do not share, shows what to say for the part of the page on screen. The presenter never attaches cues by hand: placing them is your job, so get it right. Each **cue** is attached to one part of the page (a section, chart, table or card) and holds a one-line headline and a few speaker notes. Scrolling the page moves the prompter to the matching cue, and the prompter can scroll the page.

## 0. Choose how the cues reach the prompter

Check which case you are in, in this order, and say nothing about the other cases to the user.

**A. You have pagecue's tools** (`pagecue_status`, `publish_cues`, `add_cue`; Claude Code with the pagecue plugin, or the Claude app with the pagecue extension). Call `pagecue_status` first: when the prompter is open it tells you the page, every cue in order (with the presenter's own edits) and which cue is current, so "here", "this part" and "the next one" have a meaning. Then:

- one cue: `add_cue` (with `near` set to the exact text of the heading where it starts, or without it to start at the reading line, where the presenter is now), `edit_cue`, `remove_cue`, `show_cue`;
- the view: `set_view` for section lines on the page, pausing, text size and theme; `open_page` to move to another page.

Changes show in the prompter at once, each with Undo. Use these for anything the presenter asks about the cues on the page in front of them, including requests with a screenshot ("add this here": find the heading text in the screenshot and pass it as `near`). For a whole new set of cues, follow steps 1 to 8 and publish (step 6).

**B. No pagecue tools, and you are making the page in this conversation** (an artifact, or an HTML file you write; the usual case in claude.ai and the Claude app). Put the cues inside the page itself: a `data-pagecue` attribute on each part and the cue file in an inline `<script type="application/vnd.pagecue+json">` (steps 5 and 6, option 2). When the user opens the page in Chrome and clicks pagecue, the cues appear by themselves. For an existing artifact, update it with the cues added and nothing else changed.

**C. No pagecue tools, and the page is not yours** (a live site, a company dashboard, a page the user pastes or describes). Write a cue file whose cues use `near` (the exact visible heading where each cue starts), as in "When the page is not yours" below, and hand it over: as a file named `<page-name>.cues.json` if you can create files, otherwise in one ```` ```json ```` code block. The user adds it in the prompter with **⋯ → Add cues from Claude** (or by dragging the file onto the prompter).

## 1. Find the page

When you were started as `/pagecue:add-cues <url or file>` (the prompter's "No cues yet" card copies exactly that), the page is that argument, and any text after it, such as "What I want to say: …", is the user's answer to step 3 for those parts. Otherwise work on the page the user means: usually the report or site you just made in this conversation. If it is not clear, ask which page. Read the page end to end before planning (its source, the artifact you wrote, or the text the user pasted); you must not invent content.

## 2. Plan the breakpoints

List the points where the presenter's talk changes topic, in page order: usually each section, and each chart, table or figure that needs explaining. Aim for one cue per screenful the presenter will talk to (typically 5 to 15). Skip decoration, navigation and footers.

Give every breakpoint a short, stable kebab-case id that names the content (`revenue-chart`, `churn`, `risks`), not its position (`section-3`).

## 3. Ask what the user wants to say

Unless the user already told you what to say, show the plan as a compact numbered list (id and what the element shows) and ask, in the user's language, what they want to say at each point. Make answering easy:

- they can answer for only some points, in any order, by number or name;
- they can dictate, in any language;
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

## 5. Mark the elements (cases A and B, when the page is yours)

Add `data-pagecue="<id>"` to the element each cue belongs to: the container that holds the whole topic (a `section`, `figure`, `table` or card), not a single word. Rules:

- Each value must appear on exactly one element of the rendered page.
- Cues follow the page from top to bottom: each one runs from where its element starts down to the next cue. So mark parts that stack vertically. Never mark an element inside another marked element, or two elements side by side (columns, a chart beside its text, cards in one row): mark their shared container once and cover both in one cue.
- Edit the **source** the page is built from (HTML, JSX, TSX, Vue, Svelte, Markdown/MDX, or the artifact's code), not a build output. In JSX write `data-pagecue="revenue-chart"`; it passes through to the DOM. For a component rendered several times, pass the id as a prop (`data-pagecue={id}`) and confirm each one renders.
- Do not change anything else: no layout, style, text or behaviour changes. The attribute is invisible.
- For a chart drawn on a `<canvas>` or in an SVG, mark its wrapping element.

## 6. Deliver the cues

Write the cues in the cue file format below, then deliver them for your case.

**Case A: publish** them, so the presenter's prompter shows them by itself within seconds, with no import or setup:

- With the MCP tool: `publish_cues` with the page `url` (exactly as the presenter opens it: `https://…`, `http://localhost:…` or `file:///…`) and `cues_path` (absolute path of the cue file) or `cues` (the cue file object).
- Or from a shell in Claude Code: `node "${CLAUDE_PLUGIN_ROOT}/server/bridge.mjs" publish <page-url> <cues file>`

Publishing works for every page, including pages that are not yours and files opened from disk. Publish again after every change; an open prompter updates within a few seconds, and the presenter's own wording edits are kept.

**Case B, and case A when the cues should travel with a page that is yours** (for other presenters, or another computer), ship the cue file with the page. Pick one:

1. **Linked file (default for pages served over http or https, including local dev servers).** Save `<page-name>.cues.json` next to the page and add, inside `<head>`:
   `<link rel="alternate" type="application/vnd.pagecue+json" href="<page-name>.cues.json">`
   In a framework, put the file where static files are served (for example `public/`) and add the link in the document head.
2. **Inline (required for artifacts and for files opened from disk, `file://`).** Put the JSON in
   `<script type="application/vnd.pagecue+json"> … </script>`, inside `<head>` for an HTML file, or anywhere in what an artifact renders (in a React artifact, render it as `<script type="application/vnd.pagecue+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(cueFile) }} />`). Chrome does not let extensions read a linked file next to a page opened from disk, and an artifact has no folder for one.
3. **Private.** If the page will be published or shared where people other than the presenter can open it, the linked or inline cue text is readable by anyone who views the source. Then do not ship the cues with the page: deliver them as in case C (a `.cues.json` file or a code block for ⋯ → Add cues from Claude), and keep only the `data-pagecue` attributes, which reveal nothing.

For artifacts, tell the user once, briefly, that the cues are inside the artifact, so anyone they share or publish it with could read them in its source; offer the private way if that matters.

The linked file must be on the same site (origin) as the page; pagecue ignores cue files from other sites. If you cannot tell whether the page will be published, use option 1 for dev servers, option 2 for artifacts and files opened from disk, and ask before using either for a deployed site.

**Case C:** hand over the cue file as described in step 0.

Cue file format (`pagecue` format version 1):

```json
{
  "pagecue": 1,
  "title": "Q3 business review",
  "cues": [
    {
      "id": "revenue-chart",
      "title": "Revenue up 24% in Q3",
      "notes": ["Driven by new EU customers", "Key number: 24%", "Q: will it hold? → two cohorts so far"]
    },
    { "id": "risks", "near": "Risks and open questions", "title": "Two risks to watch", "notes": ["Hiring", "FX"] }
  ]
}
```

- `id` attaches the cue to the element with `data-pagecue` equal to it. Use `"anchor": "<other-value>"` only if the cue must attach to a differently named element.
- `near` (instead of a `data-pagecue` element) is the exact visible text where the cue starts, usually a heading.
- `notes` is an array of strings, one point each.
- List cues in page order.
- Optional `startAt` moves where a cue comes up, as a share of its section's height (`0.5` is half a section later). Leave it out; the presenter tunes it by dragging section lines.
- In Claude Code the full JSON Schema is at `${CLAUDE_PLUGIN_ROOT}/schema/pagecue.schema.json`.

## When the page is not yours

For a page whose source you cannot edit (a live product page, a vendor dashboard, someone else's report), skip step 5 and anchor each cue to the page as it is:

1. Read the rendered page (with a browser tool if you have one, or the text the user gave you) and list its visible section headings.
2. Give each cue `"near": "<the heading's exact visible text>"`. The extension finds it by its text, tolerates small wording changes and ignores hidden copies. Pick headings whose text is unique on the page.
3. Deliver the cue file: publish it in case A (the prompter picks it up by itself), or hand it over in case C.

## 7. Check

In Claude Code, run the checker on the cue file and the page source (a file or a folder):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-cues.mjs" <cues file> <page source file or folder>
```

For inline cues, pass the HTML file as the cues file: `check-cues.mjs report.html report.html`. Fix every `✗` line. `!` lines are advice: shorten long titles and notes, and make sure an id reported more than once renders only once.

Without the checker, check by reading what you wrote: valid JSON with `"pagecue": 1`; every id unique; every `data-pagecue` value on exactly one element; every `near` copied exactly from a heading on the page; titles of about eight words and at most three short points.

## 8. Tell the user how to present

Finish with a short summary in the user's language: how many cues, the list of titles, where the cues are, and these steps:

1. Install the pagecue extension for Chrome if it is not installed yet (usepagecue.com).
2. Open the page in Chrome and click the pagecue button in the toolbar (or press Alt+Shift+P). The prompter opens in its own window with the cues. If it was already open, the cues have appeared in it.
   - For an artifact: open it in Chrome (in claude.ai, or on its own page). The first time, the prompter asks to allow claudeusercontent.com, where artifacts run; allow it once.
   - For case C: in the prompter, choose **⋯ → Add cues from Claude** and paste the code block, or drag the `.cues.json` file onto the prompter.
3. In Zoom, Meet or Teams, share only the page's tab or window, never the whole screen.
4. Scroll the page, or scroll and click the prompter, and the other side follows. PageDown and PageUp (or a presentation clicker) step through cues while the prompter has focus; Alt+Shift+↓ and Alt+Shift+↑ work from anywhere in Chrome.
5. To see and tune where each cue comes up, press L in the prompter: lines appear on the page and each one can be dragged. Viewers see them too, so press L again before presenting.
6. To fix wording, double-click a cue in the prompter. Those edits stay in the extension and win over the cues you wrote. To move, add or remove cues, ask you again.

## Changing cues later

Keep existing ids stable so the presenter's prompter edits stay attached. To add, remove or reword cues, update the attributes and the cue file together (and check again). Cues the presenter edited in the prompter keep their edited text even when the file changes; cues removed from the file disappear from the prompter unless the presenter edited them.
