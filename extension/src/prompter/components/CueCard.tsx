import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { scriptLanguage, textDirection } from '../../lib/text';
import type { Cue } from '../../lib/types';

interface Props {
  cue: Cue;
  /** Its section is at the page's reading line. */
  lit: boolean;
  /** The first lit cue (for assistive technology). */
  current: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: (id: string | null) => void;
  onSave: (id: string, patch: Pick<Cue, 'title' | 'notes'>) => void;
  onDelete: (id: string) => void;
  /** Removes a cue that was added and left empty, with no undo. */
  onDiscard: (id: string) => void;
  /** Direction to use while the cue has no letters yet. */
  dirHint: 'rtl' | 'ltr';
}

/** Each non-empty line of the notes is one point; a leading "-", "*" or "•" is dropped. */
export function points(notes: string): string[] {
  return notes
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
}

/** Grows a textarea to fit its text, so editing looks like the text it replaces. */
function fit(element: HTMLTextAreaElement | null): void {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

/**
 * One cue. At rest it is plain text: a headline and a few points. Double-click (or Enter, for the
 * current cue) turns the same text into fields in place. Clicking away saves, Esc puts it back.
 * Cues never take keyboard focus themselves: the window's keys move between them.
 */
export const CueCard = forwardRef<HTMLLIElement, Props>(function CueCard(
  { cue, editing, lit, current, ...props },
  ref,
) {
  const [title, setTitle] = useState(cue.title);
  const [notes, setNotes] = useState(cue.notes);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  // Typing must survive the card going away mid-edit (the page reloads, the cue moves).
  const draft = useRef<{ title: string; notes: string } | null>(null);
  const saveRef = useRef(props.onSave);
  useEffect(() => {
    saveRef.current = props.onSave;
  });

  useEffect(() => {
    if (!editing) {
      setTitle(cue.title);
      setNotes(cue.notes);
    }
  }, [cue.title, cue.notes, editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    fit(titleRef.current);
    fit(notesRef.current);
    titleRef.current?.focus({ preventScroll: true });
    titleRef.current?.select();
  }, [editing]);

  const id = cue.id;
  useEffect(
    () => () => {
      if (draft.current) saveRef.current(id, draft.current);
    },
    [id],
  );

  /** A cue that was added and left without a word was never really added: remove it quietly. */
  const discardIfEmpty = (): boolean => {
    if (cue.title || cue.notes.trim() || title.trim() || notes.trim()) return false;
    draft.current = null;
    props.onDiscard(cue.id);
    return true;
  };

  const commit = (): void => {
    if (discardIfEmpty()) return;
    draft.current = null;
    if (title.trim() !== cue.title || notes !== cue.notes) props.onSave(cue.id, { title: title.trim(), notes });
    props.onEdit(null);
  };

  const cancel = (): void => {
    if (!cue.title && !cue.notes.trim()) {
      draft.current = null;
      props.onDiscard(cue.id);
      return;
    }
    draft.current = null;
    setTitle(cue.title);
    setNotes(cue.notes);
    props.onEdit(null);
  };

  const onFieldKey = (event: KeyboardEvent<HTMLTextAreaElement>, field: 'title' | 'notes'): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commit();
    } else if (event.key === 'Enter' && field === 'title') {
      event.preventDefault();
      notesRef.current?.focus({ preventScroll: true });
    }
  };

  const list = points(cue.notes);
  // One direction for the whole cue, from all its words, so a Hebrew cue stays right to left even
  // when it starts with a product name or a bullet is mostly English.
  const words = editing ? `${title} ${notes}` : `${cue.title} ${cue.notes}`;
  const dir = /\p{L}/u.test(words) ? textDirection(words) : props.dirHint;
  const lang = scriptLanguage(words);

  return (
    <li
      ref={ref}
      className={`cue${lit ? ' is-lit' : ''}${editing ? ' is-editing' : ''}`}
      aria-current={current ? 'step' : undefined}
      dir={dir}
      lang={lang}
      data-cue-id={cue.id}
      onClick={() => !editing && props.onSelect()}
      onDoubleClick={() => !editing && props.onEdit(cue.id)}
      onBlur={(event) => {
        // Save when focus leaves the cue entirely, not when it moves between its two fields.
        if (editing && !event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
      }}
      title={editing ? undefined : 'Click to show on the page. Double-click to edit.'}
    >
      {editing ? (
        <>
          <textarea
            ref={titleRef}
            className="cue-title field"
            dir={dir}
            rows={1}
            value={title}
            aria-label="Headline"
            placeholder="Headline"
            onChange={(event) => {
              setTitle(event.target.value);
              draft.current = { title: event.target.value, notes };
              fit(event.target);
            }}
            onKeyDown={(event) => onFieldKey(event, 'title')}
          />
          <textarea
            ref={notesRef}
            className="cue-points field"
            dir={dir}
            rows={2}
            value={notes}
            aria-label="Points, one per line"
            placeholder="One point per line"
            onChange={(event) => {
              setNotes(event.target.value);
              draft.current = { title, notes: event.target.value };
              fit(event.target);
            }}
            onKeyDown={(event) => onFieldKey(event, 'notes')}
          />
          <p className="edit-hint" dir="ltr">
            <button
              type="button"
              className="quiet-button danger"
              aria-label="Delete cue"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                draft.current = null;
                props.onDelete(cue.id);
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2c.05.7.6 1.3 1.3 1.3h3.2c.7 0 1.25-.6 1.3-1.3l.6-8.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Delete
            </button>
            <span className="edit-keys">
              <kbd>Esc</kbd> to cancel
            </span>
            <button
              type="button"
              className="done-button"
              title="Save (⌘ Enter)"
              onMouseDown={(event) => event.preventDefault()}
              onClick={commit}
            >
              Done
            </button>
          </p>
        </>
      ) : (
        <>
          <h2 className="cue-title" dir={dir}>
            {cue.title || 'Untitled'}
          </h2>
          {list.length > 0 && (
            <ul className="cue-points">
              {list.map((point, index) => (
                <li key={index} dir={dir}>
                  {point}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
});
