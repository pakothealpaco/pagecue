/**
 * Section lines: an optional layer that shows on the page where each cue starts.
 *
 * Off unless the presenter turns it on in the prompter, because anything drawn here is part of the
 * page the audience sees. The page is cut into horizontal parts, one per cue: each cue owns the full
 * width of the page from its line down to the next cue's line. Each line carries a small tag with
 * the cue's number and headline, the current part is tinted, and a dashed line marks the reading
 * line where cues change. Dragging a tag moves where that cue starts; double-clicking puts it back.
 *
 * Everything lives in a shadow root on one host element, so the page's styles cannot reach
 * it and pagecue's own anchor search (which reads the page's light DOM) never sees it.
 */

export interface OverlayMark {
  /** Cue number shown in the tag (1-based). */
  number: number;
  title: string;
  /** Where the cue starts, in viewport pixels. */
  y: number;
}

/** The scrolling area the parts span, in viewport pixels. */
export interface OverlayFrame {
  left: number;
  width: number;
  /** Where the content ends: the bottom of the last part. */
  end: number;
  /** Tags sit at the page's reading start: the right edge on right-to-left pages. */
  rtl: boolean;
}

export interface OverlayHandlers {
  /** The presenter is dragging cue `index`'s line to viewport `y`. */
  onDrag: (index: number, y: number) => void;
  /** The drag ended. */
  onDrop: (index: number) => void;
  /** Double-click: back to where the cue starts by itself. */
  onReset: (index: number) => void;
  /** The "Add cue here" button on the reading line. */
  onAdd: () => void;
}

const ACCENT = '#1e9e63';

const STYLE = `
:host { all: initial; }
.layer {
  position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; overflow: hidden;
  font: 600 12px/1.2 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.box {
  position: absolute;
  background: color-mix(in srgb, ${ACCENT} 6%, transparent);
  transition: opacity 180ms ease-out;
}
.mark { position: absolute; height: 0; }
.mark::before {
  content: ''; position: absolute; inset-inline: 0; top: -1px; height: 2px; border-radius: 1px;
  background: color-mix(in srgb, ${ACCENT} 45%, transparent);
}
.mark.is-current::before { background: ${ACCENT}; }
.tag {
  position: absolute; top: 0; transform: translateY(-50%); pointer-events: auto;
  display: flex; align-items: center; gap: 6px; max-width: min(320px, 90%);
  padding: 4px 10px 4px 4px; border-radius: 999px;
  background: #fff; color: #15201a; border: 1px solid color-mix(in srgb, ${ACCENT} 55%, transparent);
  box-shadow: 0 2px 8px rgba(15, 30, 22, 0.14);
  cursor: grab; user-select: none; touch-action: none; white-space: nowrap;
}
.mark[dir='ltr'] .tag { left: 24px; }
.mark[dir='rtl'] .tag { right: 24px; padding: 4px 4px 4px 10px; }
.tag:active { cursor: grabbing; }
.num {
  flex: none; min-width: 18px; height: 18px; border-radius: 9px; padding: 0 5px; box-sizing: border-box;
  display: grid; place-items: center; font-size: 11px;
  background: color-mix(in srgb, ${ACCENT} 14%, transparent); color: ${ACCENT};
}
.title { overflow: hidden; text-overflow: ellipsis; }
.is-current .tag { background: ${ACCENT}; color: #fff; border-color: ${ACCENT}; }
.is-current .num { background: rgba(255, 255, 255, 0.22); color: #fff; }
.is-dragging .tag { box-shadow: 0 6px 18px rgba(15, 30, 22, 0.28); }
.reading {
  position: absolute; height: 0;
  border-top: 1px dashed color-mix(in srgb, ${ACCENT} 55%, transparent);
}
.add {
  position: absolute; top: 0; transform: translateY(-50%); pointer-events: auto;
  padding: 4px 10px; border-radius: 999px; border: 1px dashed ${ACCENT};
  background: #fff; color: ${ACCENT}; font: inherit; cursor: pointer; white-space: nowrap;
  box-shadow: 0 2px 8px rgba(15, 30, 22, 0.12);
}
.add:hover { background: ${ACCENT}; color: #fff; border-style: solid; }
.reading[dir='rtl'] .add { left: 24px; }
.reading[dir='ltr'] .add { right: 24px; }
@media (prefers-reduced-motion: reduce) { .box { transition: none; } }
`;

export class SectionOverlay {
  private host: HTMLElement | null = null;
  private layer: HTMLDivElement | null = null;
  private box: HTMLDivElement | null = null;
  private reading: HTMLDivElement | null = null;
  private marks: HTMLDivElement[] = [];
  private dragging = -1;

  constructor(private readonly handlers: OverlayHandlers) {}

  get visible(): boolean {
    return this.host !== null;
  }

  get isDragging(): boolean {
    return this.dragging >= 0;
  }

  show(): void {
    if (this.host) return;
    const host = document.createElement('pagecue-sections');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const layer = document.createElement('div');
    layer.className = 'layer';
    const box = document.createElement('div');
    box.className = 'box';
    const reading = document.createElement('div');
    reading.className = 'reading';
    const add = document.createElement('button');
    add.className = 'add';
    add.type = 'button';
    add.dir = 'ltr';
    add.textContent = '+ Add cue here';
    add.title = 'Start a new cue at this line';
    add.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.handlers.onAdd();
    });
    reading.append(add);
    layer.append(box, reading);
    root.append(style, layer);
    document.documentElement.append(host);
    this.host = host;
    this.layer = layer;
    this.box = box;
    this.reading = reading;
  }

  hide(): void {
    this.host?.remove();
    this.host = this.layer = this.box = this.reading = null;
    this.marks = [];
    this.dragging = -1;
  }

  /** Redraws every line. Cheap enough to call on each scroll frame. */
  draw(marks: readonly OverlayMark[], current: number, line: number, frame: OverlayFrame): void {
    if (!this.layer || !this.box || !this.reading) return;
    while (this.marks.length < marks.length) this.marks.push(this.createMark(this.marks.length));
    while (this.marks.length > marks.length) this.marks.pop()!.remove();

    const dir = frame.rtl ? 'rtl' : 'ltr';
    marks.forEach((mark, index) => {
      const element = this.marks[index]!;
      if (element.dir !== dir) element.dir = dir;
      element.style.cssText = `left:${frame.left}px;width:${frame.width}px;top:${mark.y}px`;
      element.classList.toggle('is-current', index === current);
      element.classList.toggle('is-dragging', index === this.dragging);
      const num = element.querySelector('.num')!;
      const title = element.querySelector('.title')!;
      if (num.textContent !== String(mark.number)) num.textContent = String(mark.number);
      if (title.textContent !== mark.title) title.textContent = mark.title;
    });

    const active = marks[current];
    if (active) {
      const bottom = marks[current + 1]?.y ?? frame.end;
      this.box.style.cssText = `opacity:1;left:${frame.left}px;width:${frame.width}px;top:${active.y}px;height:${Math.max(0, bottom - active.y)}px`;
    } else {
      this.box.style.opacity = '0';
    }
    this.reading.style.cssText = `top:${line}px;left:${frame.left}px;width:${frame.width}px`;
    if (this.reading.dir !== dir) this.reading.dir = dir;
  }

  private createMark(index: number): HTMLDivElement {
    const mark = document.createElement('div');
    mark.className = 'mark';
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.title = 'Drag to change where this cue starts. Double-click to put it back.';
    const num = document.createElement('span');
    num.className = 'num';
    const title = document.createElement('span');
    title.className = 'title';
    title.dir = 'auto';
    tag.append(num, title);
    mark.append(tag);

    let offset = 0;
    tag.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      tag.setPointerCapture(event.pointerId);
      offset = event.clientY - mark.getBoundingClientRect().top;
      this.dragging = index;
    });
    tag.addEventListener('pointermove', (event) => {
      if (this.dragging !== index) return;
      this.handlers.onDrag(index, event.clientY - offset);
    });
    const end = (event: PointerEvent): void => {
      if (this.dragging !== index) return;
      this.dragging = -1;
      if (tag.hasPointerCapture(event.pointerId)) tag.releasePointerCapture(event.pointerId);
      this.handlers.onDrop(index);
    };
    tag.addEventListener('pointerup', end);
    tag.addEventListener('pointercancel', end);
    tag.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.handlers.onReset(index);
    });
    // Clicks on a tag are pagecue's, never the page's.
    tag.addEventListener('click', (event) => event.stopPropagation());
    this.layer!.append(mark);
    return mark;
  }
}
