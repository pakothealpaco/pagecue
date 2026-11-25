# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub's [private vulnerability reporting](https://github.com/pakothealpaco/pagecue/security/advisories/new) or by email to pakothealpaco@gmail.com. Do not open a public issue.

Include what an attacker could do, the steps to reproduce it, and the pagecue version. You will get a reply within a week, and a fix or a plan soon after.

## What is in scope

- **The extension:** anything that lets a web page read or change cues it should not, run code in the extension, or reach the prompter. Note that `window.pagecue` is intentionally open to the page while the prompter is open and **Let Claude in Chrome edit cues** is on (see [PRIVACY.md](PRIVACY.md)).
- **The local bridge** (`plugins/pagecue/server/bridge.mjs`): it listens on `127.0.0.1` only and accepts requests only from extensions. Anything that lets a website or another machine talk to it is in scope.
- **Cue files:** a crafted cue file that breaks out of its role (script injection in the prompter or on the page).

## Supported versions

Only the latest release gets fixes.
