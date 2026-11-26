import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { LINKS } from '../lib/links';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** A shortcut as Chrome stores it ("Alt+Shift+P"), written the way this computer's keyboard shows it. */
function keysOf(shortcut: string): string[] {
  // On a Mac, Chrome already gives symbols with no separator ("⌥⇧P").
  if (!shortcut.includes('+')) return [...shortcut];
  const mac: Record<string, string> = { Alt: '⌥', Shift: '⇧', Ctrl: '⌃', Command: '⌘', MacCtrl: '⌃' };
  return shortcut.split('+').map((key) => (isMac ? (mac[key] ?? key) : key));
}

/** Whether pagecue's button is pinned to the toolbar, live (Chrome 91+, updates on Chrome 130+). */
function usePinned(): boolean | null {
  const [pinned, setPinned] = useState<boolean | null>(null);
  useEffect(() => {
    const action = browser.action as typeof browser.action & {
      getUserSettings?: () => Promise<{ isOnToolbar?: boolean }>;
      onUserSettingsChanged?: { addListener: (fn: (s: { isOnToolbar?: boolean }) => void) => void };
    };
    if (!action.getUserSettings) return;
    const read = (): void => {
      void action.getUserSettings!().then((settings) => setPinned(settings.isOnToolbar ?? null));
    };
    read();
    action.onUserSettingsChanged?.addListener((settings) => setPinned(settings.isOnToolbar ?? null));
    // Older Chrome has no change event: look again when the presenter comes back to this tab.
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, []);
  return pinned;
}

/** The shortcut that opens pagecue, or '' when another extension already took it. */
function useOpenShortcut(): string | null {
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    const read = (): void => {
      void browser.commands.getAll().then((commands) => {
        setShortcut(commands.find((command) => command.name === '_execute_action')?.shortcut ?? '');
      });
    };
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, []);
  return shortcut;
}

const openShortcutSettings = (): void => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' });

/** Opened once, right after install: pin the button, try the demo, then bring Claude in. */
export function Welcome() {
  const pinned = usePinned();
  const shortcut = useOpenShortcut();

  return (
    <main className="welcome">
      <header className="welcome-head">
        <img className="welcome-mark" src="/icon/128.png" alt="" width="44" height="44" />
        <h1>pagecue is installed</h1>
      </header>

      <ol className="steps">
        <li className={`step${pinned ? ' is-done' : ''}`}>
          <div className="step-mark" aria-hidden="true">
            {pinned ? '✓' : '1'}
          </div>
          <div className="step-body">
            <h2>{pinned ? 'Pinned to the toolbar' : 'Pin it to the toolbar'}</h2>
            {!pinned && <p>Click the puzzle piece at the top right of Chrome, then the pin next to pagecue.</p>}
          </div>
        </li>

        <li className="step">
          <div className="step-mark" aria-hidden="true">
            2
          </div>
          <div className="step-body">
            <h2>Write your cues with Claude</h2>
            <p>Tell Claude what you want to say. It turns that into a short cue for each part of the page.</p>
            <a className="button" href={LINKS.claudeApp} target="_blank" rel="noopener noreferrer">
              Set up Claude
            </a>
          </div>
        </li>
        <li className="step">
          <div className="step-mark" aria-hidden="true">
            3
          </div>
          <div className="step-body">
            <h2>Try the demo</h2>
            <p>
              Open it, then click pagecue
              {shortcut ? (
                <>
                  {' '}
                  or press{' '}
                  {keysOf(shortcut).map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </>
              ) : null}
              .
            </p>
            {shortcut === '' && (
              <p className="warn">
                Another extension took pagecue’s shortcut.{' '}
                <button type="button" className="link" onClick={openShortcutSettings}>
                  Choose one
                </button>
              </p>
            )}
            <a className="button secondary" href={LINKS.demo} target="_blank" rel="noopener noreferrer">
              Open the demo
            </a>
          </div>
        </li>
      </ol>

      <p className="privacy">
        When you present, share only the page’s <b>tab</b> or <b>window</b>. The prompter stays with you.
      </p>
    </main>
  );
}
