import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { offsetOf, positionAt, positionChanged, READING_LINE, type Layout } from '../../lib/position';
import { ScrollGuard, USER_INPUT_EVENTS } from '../../lib/scrollGuard';
import type { Cue, CuePosition } from '../../lib/types';
import { textDirection } from '../../lib/text';
import { CueCard } from './CueCard';

/** Time constant of the follow spring: about 120 ms feels attached without being jumpy. */
const SPRING_TAU_MS = 120;

export interface CueListHandle {
  /** Follow the page: glide to a position without echoing it back. */
  follow: (position: CuePosition) => void;
  /** Glide to a cue. */
  reveal: (index: number) => void;
}

interface Props {
  cues: Cue[];
  /** Index of the current cue: the one whose part of the page is at the reading line. */
  current: number;
  editingId: string | null;
  /** Shown after the cues: a quiet note about cues this page does not contain. */
  footnote?: string;
  /** Show the faint "double-click to add" hint after the cues, on hover. */
  addHint?: boolean;
  /** A one-time tip for newcomers, shown after the cues until dismissed. */
  tip?: { text: string; onDismiss: () => void };
  /** The presenter scrolled the list: move the page to match. */
  onScrollPosition: (position: CuePosition) => void;
  onSelect: (index: number) => void;
  onEdit: (id: string | null) => void;
  onSave: (id: string, patch: Pick<Cue, 'title' | 'notes'>) => void;
  onDelete: (id: string) => void;
  onDiscard: (id: string) => void;
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The column of cues. It mirrors the page through cue positions: the cue at the reading line here
 * is the cue at the page's reading line, and the space between two cues maps to the space between
 * their elements, so slow scrolling stays in step on both sides.
 *
 * Exactly one cue is lit: the current one, from the moment its start reaches the page's reading
 * line until the next cue's start does. The list stays still while the presenter scrolls through
 * a cue's part of the page, and glides (a short spring) to the next cue when it comes up. A cue too
 * tall to show in full scrolls within itself, in step with its part of the page.
 */
export const CueList = forwardRef<CueListHandle, Props>(function CueList(props, ref) {
  const { cues, onScrollPosition } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const guard = useRef(new ScrollGuard());
  const last = useRef<CuePosition | null>(null);
  const spring = useRef<{ target: number; frame: number; time: number } | null>(null);
  const scrollFrame = useRef(0);
  const editingRef = useRef(props.editingId);
  editingRef.current = props.editingId;
  // Direction for a cue with no words yet (just added): the direction of the cues around it.
  const dirHint = textDirection(cues.map((cue) => `${cue.title} ${cue.notes}`).join(' '));

  const line = useCallback((): number => {
    const rect = scrollRef.current!.getBoundingClientRect();
    return rect.top + rect.height * READING_LINE;
  }, []);

  const layout = useCallback((): Layout | null => {
    const container = scrollRef.current;
    if (!container) return null;
    const tops = cardRefs.current.slice(0, cues.length).map((card) => card?.getBoundingClientRect().top ?? 0);
    const rect = container.getBoundingClientRect();
    return { tops, end: rect.top + container.scrollHeight - container.scrollTop };
  }, [cues.length]);

  /** Glides the list so `scrollTop` reaches `target`; calling again retargets the same glide. */
  const glideTo = useCallback((target: number, immediate = false) => {
    const container = scrollRef.current;
    if (!container) return;
    const clamped = Math.min(container.scrollHeight - container.clientHeight, Math.max(0, target));
    guard.current.beginProgrammatic();
    // Jump instead of gliding when asked, when motion is reduced, and when the window is hidden
    // (animation frames do not run there, so a glide would never arrive).
    if (immediate || reducedMotion() || document.visibilityState === 'hidden') {
      if (spring.current) cancelAnimationFrame(spring.current.frame);
      spring.current = null;
      container.scrollTop = clamped;
      guard.current.settle();
      return;
    }
    if (spring.current) {
      spring.current.target = clamped;
      return;
    }
    const step = (time: number): void => {
      const state = spring.current;
      if (!state) return;
      const dt = Math.min(64, Math.max(1, time - state.time));
      state.time = time;
      const delta = state.target - container.scrollTop;
      if (Math.abs(delta) < 0.5) {
        container.scrollTop = state.target;
        spring.current = null;
        guard.current.settle();
        return;
      }
      container.scrollTop += delta * (1 - Math.exp(-dt / SPRING_TAU_MS));
      guard.current.beginProgrammatic();
      state.frame = requestAnimationFrame(step);
    };
    spring.current = { target: clamped, time: performance.now(), frame: requestAnimationFrame(step) };
  }, []);

  const moveTo = useCallback(
    (position: CuePosition, immediate = false) => {
      const current = layout();
      const container = scrollRef.current;
      if (!current || !container) return;
      const top = offsetOf(current, { index: position.index, progress: 0 });
      if (top === null) return;
      last.current = position;
      // The current cue sits still at the reading line while its part of the page scrolls by. Only
      // a cue too tall to show in full below the line moves, just enough to reveal the rest of it.
      const card = cardRefs.current[position.index];
      const room = container.clientHeight * (1 - READING_LINE) - 24;
      const overflow = card ? Math.max(0, card.offsetHeight - room) : 0;
      glideTo(container.scrollTop + (top - line()) + overflow * position.progress, immediate);
    },
    [glideTo, layout, line],
  );

  useImperativeHandle(
    ref,
    () => ({ follow: (position) => moveTo(position), reveal: (index) => moveTo({ index, progress: 0 }) }),
    [moveTo],
  );

  // When cues are added or removed, or an edit ends, the cards may have moved under the reading
  // line: settle on the current cue again.
  const ids = cues.map((cue) => cue.id).join();
  const editing = props.editingId !== null;
  useLayoutEffect(() => {
    // The list itself just changed, so there is nothing to animate from: settle at once.
    if (last.current) moveTo(last.current, true);
  }, [ids, editing, moveTo]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onInput = (): void => {
      // The presenter takes over: stop gliding and let their scroll drive the page.
      guard.current.noteUserInput();
      if (spring.current) cancelAnimationFrame(spring.current.frame);
      spring.current = null;
    };
    const onScroll = (): void => {
      if (scrollFrame.current) return;
      scrollFrame.current = requestAnimationFrame(() => {
        scrollFrame.current = 0;
        guard.current.noteScroll();
        const current = layout();
        // While a cue is being edited, the list may scroll to keep the caret in view; that must
        // never move the page.
        if (!current || !guard.current.shouldBroadcast() || editingRef.current) return;
        const position = positionAt(current, line());
        if (positionChanged(last.current, position)) {
          last.current = position;
          onScrollPosition(position);
        }
      });
    };
    for (const type of USER_INPUT_EVENTS) container.addEventListener(type, onInput, { passive: true });
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      for (const type of USER_INPUT_EVENTS) container.removeEventListener(type, onInput);
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
      if (spring.current) cancelAnimationFrame(spring.current.frame);
      spring.current = null;
    };
  }, [layout, line, onScrollPosition]);

  return (
    <div className="cue-list" ref={scrollRef} data-testid="cue-list">
      <ol className="cues">
        {cues.map((cue, index) => (
          <CueCard
            key={cue.id}
            ref={(element) => {
              cardRefs.current[index] = element;
            }}
            cue={cue}
            lit={props.current === index}
            current={props.current === index}
            editing={props.editingId === cue.id}
            onSelect={() => props.onSelect(index)}
            onEdit={props.onEdit}
            onSave={props.onSave}
            onDelete={props.onDelete}
            onDiscard={props.onDiscard}
            dirHint={dirHint}
          />
        ))}
        {props.tip && (
          <li className="tip" dir="auto">
            <span>{props.tip.text}</span>
            <button type="button" className="quiet-button" onClick={props.tip.onDismiss}>
              Got it
            </button>
          </li>
        )}
        {props.footnote && <li className="footnote">{props.footnote}</li>}
        {props.addHint && (
          <li className="add-hint" aria-hidden="true">
            Double-click empty space to add a cue at the reading line
          </li>
        )}
      </ol>
    </div>
  );
});
