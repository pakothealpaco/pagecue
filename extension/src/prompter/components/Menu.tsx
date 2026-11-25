import { useEffect, useRef } from 'react';
import type { Settings, Theme } from '../useSettings';

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
  agentAccess: boolean;
  onToggleAgentAccess: () => void;
  onClose: () => void;
  onSettings: (patch: Partial<Settings>) => void;
  onSites: () => void;
  onImport: () => void;
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
    ref.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
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
        <span>
          Add a cue here
          <small>At the reading line on the page</small>
        </span>
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
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={props.agentAccess}
        disabled={!props.onAddCue}
        onClick={props.onToggleAgentAccess}
      >
        <span>
          Let Claude in Chrome edit cues
          <small>The page’s own scripts could too.</small>
        </span>
        <span className="check" aria-hidden="true" />
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
        <span>
          Sites…
          <small>Switch, rename or delete</small>
        </span>
        <kbd>S</kbd>
      </button>
      <button type="button" role="menuitem" onClick={run(props.onImport)}>
        Import cues…
      </button>
      <button type="button" role="menuitem" disabled={!props.canExport} onClick={run(props.onExport)}>
        Export cues…
      </button>
      <hr />
      {/* Only the keys shown nowhere else: the menu items above carry their own (N, Enter, P), and
          the footer buttons name theirs (L, ⌘ + ⌘ −) in their tooltips. */}
      <dl className="shortcuts" aria-label="Keyboard shortcuts">
        <dt>Next, previous</dt>
        <dd>↓ ↑ Space</dd>
        <dt>Anywhere in Chrome</dt>
        <dd>Alt Shift ↓ ↑</dd>
      </dl>
    </div>
  );
}
