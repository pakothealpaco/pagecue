<p align="center">
  <img src="extension/public/icon/128.png" width="64" height="64" alt="">
</p>

<h1 align="center">pagecue</h1>

<p align="center">
  <b>Speaker notes for any web page, written with Claude.</b><br>
  They sit in a private window that follows the page as you scroll,<br>
  and change whenever you ask.
</p>

<p align="center">
  <a href="https://github.com/pakothealpaco/pagecue/actions/workflows/ci.yml"><img src="https://github.com/pakothealpaco/pagecue/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/Chrome%20Web%20Store-coming%20soon-lightgrey" alt="Chrome Web Store: coming soon">
</p>

<p align="center">
  <img src="docs/images/demo.gif" alt="A report shared in a meeting on the left; on the right, the private pagecue prompter moves to the matching cue as the page scrolls">
</p>

More of what we present is now made with Claude: reports, research, dashboards, whole sites. They aren't slides, so they have no speaker notes. You memorise the numbers, or lose your place when someone interrupts.

pagecue gives any page a presenter view, built around Claude. Tell Claude what you want to say; it finds where each part of the page starts and writes a short cue for it. While you rehearse, ask for changes and watch them appear. Then share only the page, and your cues follow along in a window no one else sees.

**Try it in two minutes:** [install the extension](#install), open the [demo report](https://usepagecue.com/demo/) and click the pagecue icon. The cues are already there.

## How it works with Claude

1. **Tell Claude what you want to say**, in Claude Code, the Claude app or Claude in Chrome:
   > Add pagecue cues to this report. On the revenue chart I want to say September doubled March.

   Claude plans where each cue starts, asks once what you want to say there, and writes the cues.
2. **Open the page and click the pagecue icon.** The prompter opens in its own window with your cues.
3. **Rehearse, and keep asking.** *"Shorten cue 3." "Add a cue here about the price." "Write them in Hebrew."* Claude sees the page you're on and the cue that's lit, and every change shows up at once, with Undo.
4. **Present.** Share only the page's tab in Zoom, Meet or Teams. Scroll, and the right cue lights up; click a cue, and the page scrolls to it.

## What you get

- **Cues you can read mid-sentence.** The `add-cues` skill writes each cue as a headline of about eight words and up to three short points, in your language, using only facts from the page or from you.
- **Claude at the controls.** While the prompter is open, Claude can add, reword, delete or jump to a cue, and turn section lines on or off, every change with Undo.
- **Private.** The prompter is a separate window, so sharing the page's tab or window leaves it out.
- **Yours to edit, too.** Double-click a cue to reword it, press <kbd>N</kbd> to add one where you are, use <kbd>↓</kbd> <kbd>↑</kbd> or a clicker to move.
- **Works on the pages you present.** Long reports, dashboards, web apps and claude.ai artifacts. Cues can be in any language.
- **No account, no cloud.** Cues stay in your browser; Claude reaches them only on your own computer.

## Install

**The extension.** A Chrome Web Store listing is coming. Until then, it takes a minute:

1. Download `pagecue-extension.zip` from the [latest release](https://github.com/pakothealpaco/pagecue/releases/latest) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the unzipped folder.

Chrome shows a Developer mode notice for extensions installed this way; that's expected until the store listing is live. pagecue is built and tested for Chrome; other Chromium browsers such as Edge, Brave and Arc should work too. It asks for no site access until you click it on a page.

**The Claude plugin.** In Claude Code:

```
/plugin marketplace add pakothealpaco/pagecue
/plugin install pagecue@pagecue
```

(The marketplace and the plugin are both called `pagecue`. Needs Node 20 or later.) Then ask for cues on any page, or run `/pagecue:add-cues`. To use it from the Claude desktop app or Claude in Chrome, see [Working with Claude](docs/working-with-claude.md). The extension also works on its own, with cues you write by hand or that a page ships with.

## Status and limitations

Early beta (0.x): it works well on the pages we've tested, and we'd love bug reports.

- Chromium browsers only for now.
- Share the page's tab or window, not your whole screen: a shared screen includes the prompter.
- Section lines (<kbd>L</kbd>), which show on the page where each cue starts, are visible to viewers. Turn them off before you present.
- Claude in Chrome can edit cues through `window.pagecue` while the prompter is open; so could the page's own scripts. Turn it off in the prompter's ··· menu if you don't use it. See [PRIVACY.md](PRIVACY.md).

## Learn more

- [Presenting with pagecue](docs/guide.md): every key, section lines, adding and deleting cues.
- [Working with Claude](docs/working-with-claude.md): the `add-cues` skill, live changes, the Claude app, Claude in Chrome, the MCP tools.
- [Ship cues with your page](docs/cue-format.md): for report generators and sites.
- [How it works](docs/how-it-works.md), [privacy](PRIVACY.md) and [security](SECURITY.md).

## Contributing

Bug reports, ideas and pull requests are welcome. To build from source (Node 20 or later):

```bash
git clone https://github.com/pakothealpaco/pagecue.git
cd pagecue/extension && npm ci && npm run build   # extension/.output/chrome-mv3
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for tests and checks.

## License

[MIT](LICENSE)

---

<p align="center">
  Made by <a href="https://github.com/pakothealpaco">Paco the Alpaca</a>.
</p>
