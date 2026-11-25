# Chrome Web Store listing

Everything the Chrome Web Store developer dashboard asks for, ready to paste. The images in this folder are made by `extension/scripts/store-media.mjs`; the package is `pagecue-extension.zip` from the [latest release](https://github.com/pakothealpaco/pagecue/releases/latest).

## Store listing

**Name:** pagecue

**Summary** (132 characters at most; this is the manifest description):

> Speaker notes for any web page, written with Claude: a private prompter that follows your scroll.

**Description:**

```text
Speaker notes for any web page, written with Claude.

You made a report, a dashboard or a site with Claude. Now you have to present it to partners, clients or your team. pagecue gives you speaker notes for it, the way presenter view does for slides.

Your notes, called cues, sit in a small window of their own: the prompter. As you scroll the page, the prompter shows the cue for the part on screen. Click a cue, or press the arrow keys or your clicker, and the page scrolls there.

WRITTEN WITH CLAUDE
Install the free pagecue plugin for Claude Code and ask for cues in your own words: "Add presenter cues to this report." Claude reads the page, asks once what you want to say, and writes a short headline and up to three points for each part, using only your words and the page's facts. While you rehearse, it changes them on the spot: "Make cue 3 shorter." Every change shows in the prompter with Undo.

PRIVATE BY HOW YOU SHARE
The prompter is a separate window. In Zoom, Google Meet or Microsoft Teams, share the page's tab or window: viewers see the page, and your cues stay with you. pagecue draws nothing on the page you share, except section lines while you turn them on.

MADE FOR TALKING
• One cue lit at a time, level with your eye.
• Works both ways: scroll the page or the prompter.
• Double-click a cue to change its words; press N to add one.
• Press L to see on the page where each cue starts, and drag to adjust.
• Works on reports, dashboards, docs, web apps, Claude artifacts and local files, in any language.

YOURS
No account and no cloud. Your cues stay on your computer. pagecue asks for no access to your sites when you install it: it reaches a page only when you click its button there. Free and open source under the MIT licence.

Guide: https://usepagecue.com/guide/
Source: https://github.com/pakothealpaco/pagecue
```

**Category:** Productivity → Tools

**Language:** English

**Images:**

| Field | File |
|---|---|
| Store icon (128×128) | `extension/public/icon/128.png` |
| Screenshots (1280×800) | `1-follows.jpg`, `2-claude.jpg`, `3-lines.jpg`, `4-edit.jpg`, `5-dark.jpg`, in that order |
| Small promo tile (440×280) | `promo-small.png` |

**Official URL:** none (it needs Search Console verification of the domain; can be added later).

**Homepage URL:** https://usepagecue.com

**Support URL:** https://github.com/pakothealpaco/pagecue/issues

## Privacy practices

**Single purpose:**

> pagecue shows the presenter's speaker notes (cues) for the web page they are presenting, in a separate prompter window that follows the page as it scrolls.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `activeTab` | When the user clicks pagecue's toolbar button, pagecue connects to that tab only, to find where each cue belongs on the page and follow its scrolling. |
| `scripting` | Injects pagecue's own content script into the tab the user clicked pagecue on (and into its frames), which reads the page's layout to follow scrolling and draws section lines only when the user turns them on. |
| `storage` | Saves the user's cues and prompter settings locally in the browser. |
| `unlimitedStorage` | Users keep cues for many pages; this keeps them from hitting the default local storage quota. Nothing leaves the computer. |
| Host permissions (optional, `<all_urls>`) | Never granted at install. Requested at run time, one site at a time, only when the user asks: "Always reconnect on {site}" so pagecue reconnects after a reload, or "Allow on {site}" when the page shows its content in a frame from another site (for example Claude artifacts on claudeusercontent.com). |

**Remote code:** No, I am not using remote code. Everything pagecue runs is in the package.

**Data usage:** tick nothing. pagecue collects and transmits no user data. It reads the page's structure and text locally, only on pages the user opens it on, and never sends it anywhere. Its only network requests are a cue file linked by the page itself (same site) and the optional Claude plugin's server on the user's own computer (`127.0.0.1`).

Certify all three disclosures (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL:** https://github.com/pakothealpaco/pagecue/blob/main/PRIVACY.md

## Distribution

**Visibility:** Public. **Regions:** all.

## Notes for the reviewer

```text
pagecue needs no account. To test it:
1. Open https://usepagecue.com/demo/ (a sample report that ships with six cues).
2. Click the pagecue icon in the toolbar (or press Alt+Shift+P). The prompter window opens with the cues.
3. Scroll the report: the lit cue in the prompter follows. Click a cue: the report scrolls to it. Press L to show section lines on the page, L again to hide them.
The Claude plugin is optional and runs separately in Claude Code; the extension works fully without it.
```
