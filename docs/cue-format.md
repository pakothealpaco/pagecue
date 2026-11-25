# Ship cues with your page

Any page can come with cues: a report generator, a docs site, a dashboard framework. It takes two things.

**1. Mark the breakpoints** with `data-pagecue`:

```html
<section data-pagecue="revenue">…</section>
<figure data-pagecue="churn-chart">…</figure>
```

**2. Describe them** in a cue file and link it from `<head>`:

```html
<link rel="alternate" type="application/vnd.pagecue+json" href="report.cues.json">
```

```json
{
  "pagecue": 1,
  "title": "Q3 business review",
  "cues": [
    { "id": "revenue", "title": "Revenue up 24% in Q3", "notes": ["Driven by new EU customers", "Key number: 24%"] },
    { "id": "churn-chart", "title": "Churn down to 2.1%", "notes": ["Was 3.4%", "Q: will it hold? → two cohorts so far"] }
  ]
}
```

- **Inline instead of linked:** the cue file can also sit inline, in `<script type="application/vnd.pagecue+json">…</script>`. Pages opened from disk (`file://`) must use the inline form: Chrome does not let extensions read a linked file there.
- **Same site only:** a linked cue file must be on the same origin as the page.
- **Attributes without a cue file** still work: each becomes a cue titled after its element.
- **The schema** is [`plugins/pagecue/schema/pagecue.schema.json`](../plugins/pagecue/schema/pagecue.schema.json).
- **Checking a page:** `node plugins/pagecue/scripts/check-cues.mjs <cues.json> <source folder>` confirms that every cue has its element.

> **Privacy note:** anyone who can open a page can read a linked or inline cue file. For a public page with private notes, keep only the `data-pagecue` attributes in the page and load the cue file with the prompter's **⋯ → Import cues**.
