/**
 * Renders the launch video (docs/video/script.md) frame by frame in a browser, so camera moves,
 * captions and transitions are eased and exact, then mixes the voice-over and music with ffmpeg.
 *
 * Inputs in docs/video/build/: the takes (video-takes.mjs), claude-prompt.png and claude-result.png
 * (real claude.ai close-ups), vo2.mp3 with vo2-times.json (ElevenLabs), music-raw.wav (video-music.mjs).
 *
 *   node scripts/video-render.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium } from './chromium.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const build = join(root, 'docs/video/build');
const FPS = 30;
const W = 1920;
const H = 1080;
const takes = JSON.parse(readFileSync(join(build, 'takes.json'), 'utf8'));
const voice = JSON.parse(readFileSync(join(build, 'vo2-times.json'), 'utf8'));
const json = (file) => JSON.parse(readFileSync(join(build, file), 'utf8'));
// Two recordings: "live" is the take in which Claude, asked in claude.ai, sent its cues to the open
// prompter; the other is a re-run on the same page with those cues, for the remaining shots.
const takesLive = json('takes-live.json');
const frames = {
  site: json('frames-site/frames.json'),
  prompter: json('frames-prompter/frames.json'),
  'site-live': json('frames-site-live/frames.json'),
  'prompter-live': json('frames-prompter-live/frames.json'),
};

// Layout, in frame pixels. The page and the prompter sit side by side under the caption.
const SITE = { w: 840, h: 780 };
const PROMPTER = { w: 440, h: 780 };
const GAP = 36;
const TOP = 238;
const LEFT = (W - SITE.w - GAP - PROMPTER.w) / 2;
const P_X = LEFT + SITE.w + GAP;
// The camera works below the caption: zoomed content never slides under the caption or the logo.
const VIEW_TOP = 168;
const VIEW_CENTER = (VIEW_TOP + H) / 2;
const WIDE = { z: 1, x: W / 2, y: VIEW_CENTER };
const ON_PROMPTER = (z, y = 600) => ({ z, x: P_X + PROMPTER.w / 2 - 40, y });
/** Framed on the seam between the page and the prompter, so both read and neither looks cropped. */
const SEAM = (z) => ({ z, x: (LEFT + P_X + PROMPTER.w) / 2, y: TOP + SITE.h / 2 + 6 });

/**
 * The shots. `take` names the recorded take and `from` how far into it the shot starts; `camera`
 * lists [time, framing] keys, eased between; `line` is the voice-over line placed at `start + 0.35`.
 */
const shots = [
  {
    start: 0,
    end: 4.2,
    kind: 'pair',
    take: 'follow',
    from: 1.0,
    caption: 'Speaker notes for any web page',
    camera: [
      [0, SEAM(1.1)],
      [4.2, SEAM(1.14)],
    ],
  },
  {
    start: 4.2,
    end: 7.9,
    kind: 'report',
    take: 'report',
    from: 0.3,
    caption: 'No presenter view for the web',
    camera: [
      [0, WIDE],
      [3.7, { z: 1.06, x: W / 2, y: VIEW_CENTER + 30 }],
    ],
  },
  {
    start: 7.9,
    end: 11.5,
    kind: 'claude',
    caption: 'Just ask Claude',
    switchAt: 1.6,
    camera: [
      [0, WIDE],
      [1.6, WIDE],
      [3.6, { z: 1.04, x: W / 2, y: VIEW_CENTER - 20 }],
    ],
  },
  {
    start: 11.5,
    end: 15.6,
    kind: 'pair',
    live: true,
    take: 'arrived',
    from: -0.7,
    caption: 'Your cues arrive in your prompter',
    camera: [
      [0, SEAM(1.12)],
      [4.1, SEAM(1.12)],
    ],
  },
  {
    start: 15.6,
    end: 19.6,
    kind: 'pair',
    take: 'follow',
    from: 0,
    caption: 'Your cues follow the page',
    camera: [
      [0, SEAM(1.12)],
      [4.0, SEAM(1.12)],
    ],
  },
  {
    start: 19.6,
    end: 24.6,
    kind: 'pair',
    take: 'private',
    from: 0,
    caption: 'Viewers see the page, not your notes',
    camera: [
      [0, SEAM(1.12)],
      [0.3, SEAM(1.12)],
      [1.8, WIDE],
    ],
    share: true,
  },
  {
    start: 24.6,
    end: 30.4,
    kind: 'pair',
    take: 'click',
    from: 0.2,
    caption: 'Click to jump. Edit in place.',
    camera: [
      [0, SEAM(1.12)],
      [2.0, SEAM(1.12)],
      [2.6, ON_PROMPTER(1.5, 560)],
      [5.8, ON_PROMPTER(1.5, 560)],
    ],
  },
  { start: 30.4, end: 34.8, kind: 'end' },
];

/** Where each voice-over line plays: [line, when] or [[from, to] in the recording, when]. */
const VOICE = [
  ['Presenting', 0.2],
  ['Reports', 4.35],
  ['Just ask', 8.1],
  ['It reads', 10.4],
  ['Scroll the', 15.8],
  ['Share just', 19.8],
  ['Click a cue', 24.8],
  ['Fix any', 27.3],
  ['pagecue. Free', 30.7],
];
const LENGTH = shots.at(-1).end;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function cameraAt(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, b] = keys[i];
    const [t0, a] = keys[i - 1];
    if (t <= t1) {
      const k = t1 === t0 ? 1 : ease((t - t0) / (t1 - t0));
      return { z: a.z + (b.z - a.z) * k, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return keys.at(-1)[1];
}
/** The recorded frame showing a take at `t` seconds into the take. */
function frameAt(name, t) {
  const list = frames[name];
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid].at <= t) lo = mid;
    else hi = mid - 1;
  }
  return pathToFileURL(join(build, `frames-${name}`, list[lo].file)).href;
}

const fontUrl = (w) =>
  pathToFileURL(join(root, `site/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-${w}-normal.woff2`))
    .href;
const MARK = readFileSync(join(root, 'site/src/assets/mark.svg'), 'utf8');
const html = `<!doctype html><html><head><style>
  @font-face { font-family: Plex; font-weight: 400; src: url(${fontUrl(400)}); }
  @font-face { font-family: Plex; font-weight: 500; src: url(${fontUrl(500)}); }
  @font-face { font-family: Plex; font-weight: 600; src: url(${fontUrl(600)}); }
  * { box-sizing: border-box; }
  body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; font-family: Plex, system-ui, sans-serif; color: #151a22;
    background: radial-gradient(1200px 700px at 78% 108%, #dff3e8 0%, transparent 60%),
      radial-gradient(1100px 650px at 10% -10%, #e6ecf7 0%, transparent 60%), #f4f6f9; }
  #view { position: absolute; left: 0; right: 0; top: ${VIEW_TOP}px; bottom: 0; overflow: hidden;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 28px); }
  #camera { position: absolute; left: 0; top: -${VIEW_TOP}px; width: ${W}px; height: ${H}px; transform-origin: 0 0; }
  .layer { position: absolute; inset: 0; opacity: 0; }
  .win { position: absolute; overflow: hidden; border-radius: 18px; background: #fff;
    box-shadow: 0 0 0 1px rgba(21,26,34,.08), 0 2px 6px rgba(21,26,34,.05), 0 28px 70px rgba(21,26,34,.16); }
  .win img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top left; }
  .share { transition: none; box-shadow: 0 0 0 3px #d9573f, 0 28px 70px rgba(21,26,34,.16); }
  .label { position: absolute; font-size: 21px; font-weight: 500; color: #4a525e; display: flex; gap: 10px; align-items: center; }
  .dot { width: 11px; height: 11px; border-radius: 50%; }
  #caption { position: absolute; left: 0; right: 0; top: 74px; text-align: center; font-size: 58px; font-weight: 600;
    letter-spacing: -0.022em; }
  .brand { position: absolute; left: 64px; top: 52px; display: flex; gap: 10px; align-items: center; font-weight: 600; font-size: 22px;
    color: #151a22; opacity: .85; }
  .brand svg { width: 28px; height: 28px; }
  #end { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 28px; text-align: center; opacity: 0; }
  #end .logo { display: flex; gap: 24px; align-items: center; font-size: 104px; font-weight: 600; letter-spacing: -.035em; }
  #end .logo svg { width: 112px; height: 112px; }
  #end .tag { font-size: 44px; color: #3d4550; line-height: 1.2; max-width: 24ch; }
  #end .cta { margin-top: 14px; display: flex; gap: 18px; align-items: center; font-size: 30px; font-weight: 600; }
  #end .pill { padding: 14px 26px; border-radius: 999px; background: #1e9e63; color: #fff; }
  #end .url { color: #1e9e63; }
</style></head><body>
  <div class="brand" id="brand">${MARK}pagecue</div>
  <div id="view"><div id="camera">
    <div class="layer" id="pair">
      <div class="label" style="left:${LEFT + 4}px;top:${TOP - 40}px"><span class="dot" style="background:#d9573f"></span>The tab you share</div>
      <div class="win" id="pairSite" style="left:${LEFT}px;top:${TOP}px;width:${SITE.w}px;height:${SITE.h}px"><img id="imgSite"></div>
      <div class="label" style="left:${P_X + 4}px;top:${TOP - 40}px"><span class="dot" style="background:#3ccf7f"></span>Your prompter, not shared</div>
      <div class="win" style="left:${P_X}px;top:${TOP}px;width:${PROMPTER.w}px;height:${PROMPTER.h}px"><img id="imgPrompter"></div>
    </div>
    <div class="layer" id="report">
      <div class="win" style="left:${(W - SITE.w) / 2}px;top:${TOP}px;width:${SITE.w}px;height:${SITE.h}px"><img id="imgReport"></div>
    </div>
    <div class="layer" id="claudeA">
      <div class="win" style="left:${(W - 1388) / 2}px;top:${TOP + 230}px;width:1388px;height:320px">
        <img src="${pathToFileURL(join(build, 'claude-prompt.png')).href}"></div>
    </div>
    <div class="layer" id="claudeB">
      <div class="win" style="left:${(W - 1272) / 2}px;top:${TOP}px;width:1272px;height:756px">
        <img src="${pathToFileURL(join(build, 'claude-result.png')).href}" style="object-fit:cover"></div>
    </div>
  </div></div>
  <div id="caption"></div>
  <div id="end"><div class="logo">${MARK}pagecue</div>
    <div class="tag">Speaker notes for any web page, written with Claude.</div>
    <div class="cta"><span class="pill">Free for Chrome</span><span class="url">usepagecue.com</span></div></div>
</body></html>`;

/** Everything one frame needs, worked out in Node and applied in the page in one call. */
function frameState(t) {
  const shot = shots.find((s) => t < s.end) ?? shots.at(-1);
  const local = t - shot.start;
  const length = shot.end - shot.start;
  // Straight cuts between shots; the camera does the moving.
  const fade = 1;
  const cam = shot.camera ? cameraAt(shot.camera, local) : WIDE;
  const capIn = shot.start === 0 ? 1 : Math.min(1, Math.max(0, (local - 0.1) / 0.3));
  const capOut = Math.min(1, Math.max(0, (length - local) / 0.15));
  const state = {
    camera: `translate(${W / 2 - cam.x * cam.z}px, ${VIEW_CENTER - cam.y * cam.z}px) scale(${cam.z})`,
    layers: { pair: 0, report: 0, claudeA: 0, claudeB: 0 },
    caption: shot.caption ?? '',
    captionOpacity: ease(Math.min(capIn, capOut)),
    captionShift: (1 - ease(capIn)) * 14,
    end: 0,
    brand: shot.kind === 'end' ? 0 : 1,
    share: !!shot.share && local > 1.0,
    images: {},
  };
  if (shot.kind === 'pair') {
    state.layers.pair = fade;
    const set = shot.live ? '-live' : '';
    const at = (shot.live ? takesLive : takes)[shot.take] + shot.from + local;
    state.images.imgSite = frameAt(`site${set}`, at);
    state.images.imgPrompter = frameAt(`prompter${set}`, at);
  } else if (shot.kind === 'report') {
    state.layers.report = fade;
    state.images.imgReport = frameAt('site', takes[shot.take] + shot.from + local);
  } else if (shot.kind === 'claude') {
    const mix = Math.min(1, Math.max(0, (local - shot.switchAt) / 0.3));
    state.layers.claudeA = fade * (1 - mix);
    state.layers.claudeB = fade * mix;
  } else {
    // The end card fades in and holds to the last frame (often the thumbnail).
    state.end = ease(Math.min(1, local / 0.5));
  }
  return state;
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
}

async function render() {
  const dir = join(build, 'render');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  writeFileSync(join(build, 'render.html'), html);
  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(pathToFileURL(join(build, 'render.html')).href);
  await page.evaluate(() => document.fonts.ready);
  const total = Math.round(LENGTH * FPS);
  for (let f = 0; f < total; f++) {
    const state = frameState(f / FPS);
    await page.evaluate(async (s) => {
      const loads = [];
      for (const [id, src] of Object.entries(s.images)) {
        const img = document.getElementById(id);
        if (img.getAttribute('src') !== src) {
          img.src = src;
          loads.push(img.decode());
        }
      }
      await Promise.all(loads);
      document.getElementById('camera').style.transform = s.camera;
      for (const [id, o] of Object.entries(s.layers)) document.getElementById(id).style.opacity = o;
      const cap = document.getElementById('caption');
      cap.textContent = s.caption;
      cap.style.opacity = s.captionOpacity;
      cap.style.transform = `translateY(${s.captionShift}px)`;
      document.getElementById('end').style.opacity = s.end;
      document.getElementById('brand').style.opacity = s.brand;
      document.getElementById('pairSite').classList.toggle('share', s.share);
    }, state);
    await page.screenshot({ path: join(dir, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
    if (f % 150 === 0) console.log(`frame ${f} of ${total}`);
  }
  await browser.close();
  ffmpeg([
    '-framerate',
    String(FPS),
    '-i',
    join(dir, '%05d.jpg'),
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '16',
    '-pix_fmt',
    'yuv420p',
    join(build, 'picture.mp4'),
  ]);
}

/** Voice lines placed at their shots; the music ducks under the voice and rises in the gaps. */
function mix() {
  const parts = [];
  const filters = [];
  VOICE.forEach(([line, when], i) => {
    const [a, b] = typeof line === 'string' ? voice[line] : line;
    const at = Math.round(when * 1000);
    filters.push(`[0]atrim=${Math.max(0, a - 0.05)}:${b + 0.2},asetpts=PTS-STARTPTS,adelay=${at}|${at}[v${i}]`);
    parts.push(`[v${i}]`);
  });
  filters.push(
    `${parts.join('')}amix=inputs=${parts.length}:normalize=0,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-16:TP=-2,apad=whole_dur=${LENGTH},asplit=2[voice][key]`,
  );
  filters.push(
    `[1]atrim=0:${LENGTH},aecho=0.8:0.6:70|140|260|420:0.25|0.18|0.12|0.07,highpass=f=40,equalizer=f=2500:t=q:w=1.2:g=-3,loudnorm=I=-27:TP=-3,afade=t=out:st=${LENGTH - 2.6}:d=2.6[bed]`,
  );
  filters.push(`[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=800:makeup=1[ducked]`);
  filters.push(`[voice][ducked]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-2:LRA=11,atrim=0:${LENGTH}[out]`);
  ffmpeg([
    '-i',
    join(build, 'vo2.mp3'),
    '-i',
    join(build, 'music-raw.wav'),
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[out]',
    '-ar',
    '48000',
    join(build, 'mix.wav'),
  ]);
}

async function main() {
  if (!process.argv.includes('--audio-only')) await render();
  mix();
  const out = join(root, 'docs/video/pagecue-launch.mp4');
  ffmpeg([
    '-i',
    join(build, 'picture.mp4'),
    '-i',
    join(build, 'mix.wav'),
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-af',
    'apad',
    '-shortest',
    '-movflags',
    '+faststart',
    out,
  ]);
  console.log(`Wrote ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
