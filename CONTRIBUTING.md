# Contributing to pagecue

Thanks for helping. Bug reports, fixes and ideas are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- pagecue is a presenter aid. Features that hide content from screen capture or help deceive viewers are out of scope.
- Keep it local first: no accounts, no required servers, no tracking.
- Dependencies must use a permissive licence (MIT, BSD, Apache-2.0, ISC). Do not copy code from GPL or AGPL projects.

## Setup

Node 20 or later.

```bash
cd extension
npm ci
npm run dev     # Chrome with the extension and hot reload
```

To try a change on real sites, `npm run qa -- <url> …` runs the presenter flow on each page (connect, add three cues, scroll, reload) with a test build that may access every site.

To refresh the README's pictures after changing the prompter: `PAGECUE_E2E=1 npx wxt build && node scripts/readme-media.mjs`.

## Before you open a pull request

```bash
npm run check   # types, lint, format, unit tests
npm run e2e     # end-to-end test in real Chromium
```

- Add or update tests for behaviour you change. Pure logic belongs in `src/lib/` with unit tests; behaviour across the page and the prompter belongs in the end-to-end test.
- If you change the cue file format, update `plugins/pagecue/schema/pagecue.schema.json`, `extension/src/lib/cueFile.ts` and the `add-cues` skill together.
- If you change the plugin, run `claude plugin validate .` from the repository root.
- Keep pull requests focused: one change per pull request.

## Releasing

Pushing a tag `vX.Y.Z` builds the extension and the skill and attaches both zips to a GitHub release. The Chrome Web Store upload is done by hand by the maintainer.

## Reporting a bug

Include the browser and version, the page (or a minimal page that reproduces it), what you expected and what happened. For anchoring problems, the exported cue file (prompter ⋯ → Export cues) helps a lot.
