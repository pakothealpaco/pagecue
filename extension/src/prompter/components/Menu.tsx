import { useEffect, useRef } from 'react';
import type { Settings, Theme } from '../useSettings';
import { LINKS } from '../../lib/links';
import { BookIcon, GitHubIcon } from './HelpLinks';

interface Props {
  open: boolean;
  /** Scroll the shortcut list into view when opening (the ? key). */
  showShortcuts: boolean;
  settings: Settings;
  paused: boolean;
  canExport: boolean;
  canEdit: boolean;
  /** Undefined while no page is connected. */
  onAddCue?: () => void;
  onEditCurrent: () => void;
  onTogglePause: () => void;
  onClose: () => void;
  onSettings: (patch: Partial<Settings>) => void;
  onSites: () => void;
  onPaste: () => void;
  onExport: () => void;
}

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

/**
 * The ··· menu: actions that are not needed every few seconds while presenting. Text size and
 * section lines sit on the footer, switching site on the page title, and reconnecting where it is
 * needed (the "page reloaded" state and the site list). Each action shows its key, so the menu
 * also teaches the shortcuts.
 */
export function Menu(props: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!props.open) return;
    if (props.showShortcuts) ref.current?.querySelector('.shortcuts')?.scrollIntoView({ block: 'nearest' });
    ref.current?.querySelector<HTMLElement>('button:not(:disabled), a')?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        props.onClose();
      }
    };
    const onPointer = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node) && !(event.target as Element).closest('.menu-button')) {
        props.onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [props.open, props.showShortcuts, props]);

  const run = (action: () => void) => () => {
    props.onClose();
    action();
  };

  return (
    <div ref={ref} className={`menu${props.open ? ' is-open' : ''}`} role="menu" aria-hidden={!props.open}>
      <button type="button" role="menuitem" disabled={!props.onAddCue} onClick={run(() => props.onAddCue?.())}>
        <span>Add a cue here</span>
        <kbd>N</kbd>
      </button>
      <button type="button" role="menuitem" disabled={!props.canEdit} onClick={run(props.onEditCurrent)}>
        <span>Edit this cue</span>
        <kbd>Enter</kbd>
      </button>
      <button type="button" role="menuitem" onClick={run(props.onTogglePause)}>
        <span>{props.paused ? 'Resume following' : 'Pause following'}</span>
        <kbd>P</kbd>
      </button>
      <hr />
      <div className="menu-row">
        <span>Theme</span>
        <div className="choice" role="group" aria-label="Theme">
          {THEMES.map((theme) => (
            <button
              key={theme.value}
              type="button"
              aria-pressed={props.settings.theme === theme.value}
              onClick={() => props.onSettings({ theme: theme.value })}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </div>
      <hr />
      <button type="button" role="menuitem" onClick={run(props.onSites)}>
        <span>Sites…</span>
        <kbd>S</kbd>
      </button>
      <button type="button" role="menuitem" onClick={run(props.onPaste)}>
        Add cues from Claude…
      </button>
      <button type="button" role="menuitem" disabled={!props.canExport} onClick={run(props.onExport)}>
        Export cues…
      </button>
      <hr />
      <div className="menu-links">
        <a role="menuitem" href={LINKS.guide} target="_blank" rel="noopener noreferrer" onClick={props.onClose}>
          <BookIcon />
          Guide
        </a>
        <a role="menuitem" href={LINKS.github} target="_blank" rel="noopener noreferrer" onClick={props.onClose}>
          <GitHubIcon />
          GitHub
        </a>
      </div>
      <hr />
      {/* Only the keys shown nowhere else: the menu items above carry their own (N, Enter, P), and
          the footer buttons name theirs (L, ⌘+ ⌘−, Ctrl on Windows) in their tooltips. */}
      <dl className="shortcuts" aria-label="Keyboard shortcuts">
        <dt>Next, previous</dt>
        <dd>↓ ↑ Space</dd>
        <dt>Anywhere in Chrome</dt>
        <dd>Alt Shift ↓ ↑</dd>
      </dl>
    </div>
  );
}
