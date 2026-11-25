# pagecue

Instructions for Claude Code (and people) working on this repository. Code, comments and docs are in English.

An open-source Chrome extension plus Claude Code plugin: private speaker cues for presenting any web page, with a prompter window synced to the page in both directions. See [README.md](README.md).

## Layout and commands

- `extension/`: the Chrome extension (WXT, React, TypeScript). `npm run check` (types, lint, format, unit tests), `npm run build`, `npm run e2e` (real Chromium), `npm run qa -- <url>…` (the presenter flow on real sites, with a test build that may access every site), `npm run dev`.
- `plugins/pagecue/`: the Claude Code plugin (skill `add-cues`, cue file schema, checker script). `.claude-plugin/marketplace.json` makes the repo a marketplace; `claude plugin validate .` checks it.
- The cue file format is defined once in `plugins/pagecue/schema/pagecue.schema.json` and parsed by `extension/src/lib/cueFile.ts`; a unit test keeps them in step.

## Working rules

- Public repository, permissive licence (MIT). Do not copy code from GPL or AGPL projects (for example QPrompt, CueCard, Shepherd.js, Intro.js); prefer MIT, BSD or Apache-2.0 dependencies.
- Frontend in TypeScript and React.
- Local first: no accounts, no servers the user must run, cue data stays on the user's machine unless they export it.
- Privacy model: the presenter shares only the site's tab or window; the prompter is a separate extension window that is simply not shared. Do not build OS-level hide-from-capture tricks. Draw nothing on the page by default; the one exception is section lines, which the presenter turns on and off from the prompter (key L) to see and drag where each cue starts, with a visible reminder while they are on.
- Do not market or build features as "undetectable" or for deceiving viewers; pagecue is a presenter aid, like presenter view.
- Releases and Chrome Web Store submissions are done by the maintainer.
