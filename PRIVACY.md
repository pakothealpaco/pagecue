# Privacy policy

pagecue is a Chrome extension and a Claude Code plugin. This policy covers both. Last updated: November 25, 2026.

## The short version

pagecue collects nothing. It has no servers, no accounts, no analytics and no tracking. Your cues stay on your computer unless you export them.

## What pagecue stores, and where

- **Your cues and settings** are stored in your browser (`chrome.storage.local`): the cue text, where each cue attaches on the page, the page's address and title, and your prompter settings. They never leave your browser unless you export them to a file.
- **Cues written by Claude Code** are kept in `~/.pagecue` on your computer, where the extension picks them up.

## Network requests

pagecue makes only these:

1. **A page's own cue file**, when the page links to one: read from that page's own site only, up to 1 MB.
2. **The local bridge** on your own computer (`http://127.0.0.1:47613`), while the prompter is open, so Claude Code can hand over and change cues. Nothing is sent to any other machine.

## What pagecue reads on a page

When you open pagecue on a page, it reads that page's structure and text to find where each cue belongs and to follow your scrolling. It does this only on pages you open it on, and nothing it reads is sent anywhere.

## Permissions

| Permission | Why |
|---|---|
| `activeTab`, `scripting` | Connect to the tab you click the toolbar button on. |
| Optional access to a site | Only when you ask for it: **Reconnect automatically** on a site, or reading a page's content from a frame on another site (for example `claudeusercontent.com` for claude.ai artifacts). You can remove it at any time in Chrome's extension settings. |
| `storage`, `unlimitedStorage` | Keep your cues in your browser. |

pagecue runs no remote code: everything it runs ships inside the extension.

## Sharing your screen

The prompter is a separate window. When you present, share only the page's tab or window: anyone watching sees the page, not the prompter. If you share your whole screen, the prompter is in it. pagecue draws nothing on the page except section lines, and only while you have them on; viewers do see those.

## The website

usepagecue.com counts visits with [GoatCounter](https://www.goatcounter.com): no cookies, and nothing that identifies you (the page, the referring site, the browser and screen size, and the country worked out from the IP address, which isn't stored). The extension and the plugin never send anything to it.

## Contact

Questions about this policy: open an issue at https://github.com/pakothealpaco/pagecue/issues or write to pakothealpaco@gmail.com.
