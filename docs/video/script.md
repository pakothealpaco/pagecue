# pagecue: launch video (about 43 seconds)

English. Real footage only: the extension recorded in Chrome on the site's sample page (usepagecue.com/sample), and a real claude.ai chat in which Claude was given that link and wrote the cues. The prompter in the video shows exactly the cues Claude published in that chat. Voice: ElevenLabs "Matilda", speed 1.0. Music: an original soft bed (`extension/scripts/video-music.mjs`), ducked under the voice.

## Principles

- The payoff in the first seconds: the page and the prompter side by side, moving together.
- One idea per beat. No feature tour.
- The captions tell the whole story with the sound off.
- One camera move per sentence: a slow, eased push-in to the detail that matters (1.2 to 1.5x), then hold. The camera stays below the caption band.
- One look throughout: soft brand background, rounded windows, soft shadow, IBM Plex Sans.

## Shot list

| # | Time | Shot | Voice-over | Caption |
|---|---|---|---|---|
| 1 | 0.0 to 4.4 | The page and the prompter; the page scrolls, the lit cue follows. Push toward the prompter. | Presenting a web page? Keep your speaker notes right beside it. | Speaker notes for any web page |
| 2 | 4.4 to 8.4 | The page on its own, drifting down. | Reports, dashboards and sites have no presenter view. | No presenter view for the web |
| 3 | 8.4 to 13.6 | claude.ai: "Add speaker notes to usepagecue.com/sample — I'm presenting it to my team tomorrow." Then Claude's answer listing the 5 cues. | Give Claude the link, and ask for speaker notes. | Give Claude the link |
| 4 | 13.6 to 18.6 | The prompter says "No cues yet"; Claude's cues arrive. Push in on the prompter. | It writes your cues, and sends them straight to your prompter. | Your cues arrive in your prompter |
| 5 | 18.6 to 25.6 | The page scrolls section by section; one cue lights at a time. | Scroll the page, and your cues follow. | Your cues follow the page |
| 6 | 25.6 to 31.4 | Pull back to wide; the shared tab gets a red outline. | Share just the tab. Viewers see the page. Your notes stay with you. | Viewers see the page, not your notes |
| 7 | 31.4 to 39.0 | Click a cue: the page jumps there. Double-click a cue and change its words. | Click a cue to jump there. Fix any word in place. | Click to jump. Edit in place. |
| 8 | 39.0 to 43.6 | End card: logo, tagline, "Free for Chrome", usepagecue.com. | pagecue. Free for Chrome. | Speaker notes for any web page, written with Claude. |

## Audio

- Voice about -16 LUFS; music about 20 dB under it while the voice speaks, rising in the gaps and under the end card; a small music dip at 2.5 kHz.
- Final mix: about -14 LUFS integrated, true peak no higher than -1 dBTP.

## Not on screen

No Zoom, Meet or Teams interface, no personal chats, names or tabs, no "undetectable" wording, no ranking claims.

## Making it

```bash
cd extension
PAGECUE_QA=1 npx wxt build
node scripts/video-takes.mjs    # records the page and the prompter (cues from docs/video/build/sample-cues.json)
node scripts/video-music.mjs 44 # composes the music
node scripts/video-render.mjs   # renders docs/video/pagecue-launch.mp4
```

The voice-over (`vo2.mp3`, `vo2-times.json`) and the claude.ai close-ups (`claude-prompt.png`, `claude-result.png`) are made once and kept in `docs/video/build/`, which is not in git.
