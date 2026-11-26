import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LINKS } from '../lib/links';
import { HelpLinks } from './components/HelpLinks';
import { PasteSheet } from './components/PasteSheet';
import { parsePastedCues } from '../lib/paste';
import { browser } from 'wxt/browser';
import { forgetSite, injectInto, isRemembered, rememberSite } from '../lib/access';
import { CueFileError, toCueFile } from '../lib/cueFile';
import type { RuntimeMessage } from '../lib/protocol';
import { SESSION_TARGET, type Target } from '../lib/session';
import { originPattern } from '../lib/siteKey';
import type { FrameAccess } from '../content/frames';
import type { Cue, CuePosition } from '../lib/types';
import { CueList, type CueListHandle } from './components/CueList';
import { LinesToggle } from './components/LinesToggle';
import { Menu } from './components/Menu';
import { SitesSheet } from './components/SitesSheet';
import { shortTitle } from '../lib/store';
import { TextSizeButtons } from './components/TextSizeButtons';
import { Timer } from './components/Timer';
import { useIdle } from './useIdle';
import { usePageConnection, type ConnectionStatus } from './usePageConnection';
import { stepTextSize, TEXT_SIZES, useSettings, type Settings, type TextSize } from './useSettings';
import { useSite } from './useSite';
import { useBridge, type BridgeCommand } from './useBridge';
import { openPage, showTab } from '../lib/openPage';
import { points } from './components/CueCard';

const NEXT_KEYS = new Set(['PageDown', 'ArrowDown', 'ArrowRight', ' ', 'j']);
const PREVIOUS_KEYS = new Set(['PageUp', 'ArrowUp', 'ArrowLeft', 'k']);
const CHROME_IDLE_MS = 2000;

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'page'
  );
}

type Light = 'live' | 'standby' | 'fault' | 'off';

/** The cue light: green following, amber paused or connecting, red not connected. */
function lightFor(status: ConnectionStatus, paused: boolean): { light: Light; label: string } {
  if (status === 'connected')
    return paused ? { light: 'standby', label: 'Paused' } : { light: 'live', label: 'Following' };
  if (status === 'connecting') return { light: 'standby', label: 'Connecting' };
  if (status === 'idle') return { light: 'off', label: 'No page' };
  return { light: 'fault', label: 'Not connected' };
}

export function App() {
  const [target, setTarget] = useState<{ tabId: number | null; restricted: boolean; nonce: number }>({
    tabId: null,
    restricted: false,
    nonce: 0,
  });
  const [settings, updateSettings] = useSettings();
  const [paused, setPaused] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sitesOpen, setSitesOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [toast, setToastState] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  const setToast = useCallback(
    (text: string | null, action?: { label: string; run: () => void }) => setToastState(text ? { text, action } : null),
    [],
  );
  const [shortcutsWanted, setShortcutsWanted] = useState(false);
  /** Cues the page just added, shown before the stored copy arrives. */
  const [pending, setPending] = useState<Record<string, Cue>>({});
  const listRef = useRef<CueListHandle>(null);
  /** Cue commands sent to the page for an agent, waiting for the page's answer. */
  const apiCalls = useRef(new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>());
  const importRef = useRef<HTMLInputElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const idle = useIdle(CHROME_IDLE_MS);

  // The page to follow: the one the toolbar button was last clicked on. Each click has a new
  // timestamp, so clicking again on the same tab reconnects it.
  useEffect(() => {
    const apply = (value: unknown): void => {
      const next = value as Target | undefined;
      if (!next || typeof next.at !== 'number') return;
      setTarget({ tabId: next.tabId, restricted: next.tabId === null, nonce: next.at });
    };
    void browser.storage.session.get(SESSION_TARGET).then(async (value) => {
      if (value[SESSION_TARGET]) return apply(value[SESSION_TARGET]);
      // Opened without a toolbar click (for example after an extension update): follow the tab the
      // presenter is looking at, if pagecue is already running there.
      const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true, windowType: 'normal' });
      if (tab?.id === undefined) return;
      const reply = await browser.tabs.sendMessage(tab.id, { type: 'ping' }).catch(() => undefined);
      if (reply) apply({ tabId: tab.id, at: Date.now() });
    });
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
      if (area === 'session' && SESSION_TARGET in changes) apply(changes[SESSION_TARGET]!.newValue);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  const { status, page, send, reconnect } = usePageConnection(target, {
    onPosition: (position: CuePosition) => {
      if (pausedRef.current || unplacedRef.current) return;
      setActiveIndex(position.index);
      listRef.current?.follow(position);
    },
    onApiResult: (id, ok, result, error) => {
      const pending = apiCalls.current.get(id);
      if (!pending) return;
      apiCalls.current.delete(id);
      if (ok) pending.resolve(result);
      else pending.reject(new Error(error ?? 'The page could not do that.'));
    },
    onAgentChange: (text, undo) => setToast(text, { label: 'Undo', run: () => void change(undo) }),
    onCueAdded: (cue) => {
      if (!cue) return setToast('Nothing at the reading line to attach a cue to. Scroll a little and try again.');
      // Show it at once; the saved copy replaces it when storage reports back.
      setPending((current) => ({ ...current, [cue.id]: cue }));
      setEditingId(cue.id);
      // Added from the page: bring the prompter forward so the presenter can type right away.
      void browser.windows.getCurrent().then(async (window) => {
        if (window.id !== undefined) await browser.windows.update(window.id, { focused: true });
      });
    },
  });

  // Section lines follow the setting on every connection (a reloaded page starts without them).
  useEffect(() => {
    if (status === 'connected') send({ type: 'section-lines', on: settings.sectionLines });
  }, [status, page?.siteKey, settings.sectionLines, send]);

  const pageInfo = useMemo(() => (page ? { title: page.title, url: page.url } : null), [page]);
  const { record, change } = useSite(page?.siteKey ?? null, pageInfo);

  // Cues in page order. Cues the page cannot find are not listed; the agent fixes those. When it
  // finds none of them, they are listed anyway, in their own order, so the presenter still has them
  // (they just cannot follow the page).
  const { cues, missing, unplaced } = useMemo(() => {
    const byId = new Map([...Object.values(pending), ...(record?.cues ?? [])].map((cue) => [cue.id, cue]));
    const found: Cue[] = [];
    const lost: Cue[] = [];
    for (const state of page?.cues ?? []) {
      const cue = byId.get(state.id);
      if (!cue) continue;
      if (state.status === 'found') found.push(cue);
      else lost.push(cue);
    }
    const none = found.length === 0 && lost.length > 0;
    return { cues: none ? lost : found, missing: lost.length, unplaced: none };
  }, [record, page, pending]);
  const unplacedRef = useRef(unplaced);
  useEffect(() => {
    unplacedRef.current = unplaced;
  }, [unplaced]);

  // Drop pending cues once storage has them (or they were deleted before it did).
  useEffect(() => {
    if (!record || Object.keys(pending).length === 0) return;
    const stored = new Set(record.cues.map((cue) => cue.id));
    if (Object.keys(pending).some((id) => stored.has(id))) {
      setPending((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !stored.has(id))));
    }
  }, [record, pending]);

  const pattern = page?.url ? originPattern(page.url) : null;
  useEffect(() => {
    if (!pattern) return setRemembered(false);
    void isRemembered(pattern).then(setRemembered);
  }, [pattern]);

  const siteFileError = page?.siteFileError;
  useEffect(() => {
    if (siteFileError) setToast(siteFileError);
  }, [siteFileError, setToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);

  // ------------------------------------------------------------ moving between cues

  const select = useCallback(
    (index: number) => {
      if (index < 0 || index >= cues.length) return;
      setActiveIndex(index);
      listRef.current?.reveal(index);
      if (!unplacedRef.current) send({ type: 'scroll-to', position: { index, progress: 0 }, smooth: true });
    },
    [cues.length, send],
  );

  const step = useCallback((delta: 1 | -1) => select(Math.max(0, activeIndex + delta)), [activeIndex, select]);

  const followList = useCallback(
    (position: CuePosition) => {
      setActiveIndex(position.index);
      if (!pausedRef.current && !unplacedRef.current) send({ type: 'scroll-to', position, smooth: false });
    },
    [send],
  );

  const discard = useCallback(
    (id: string) => {
      setEditingId(null);
      setPending(({ [id]: _dropped, ...rest }) => rest);
      void change({ kind: 'delete', id }).catch(() => undefined);
    },
    [change],
  );

  const toggleLines = useCallback(() => {
    const on = !settings.sectionLines;
    updateSettings({ sectionLines: on, ...(on ? { linesExplained: true, tipSeen: true } : {}) });
    if (on && !settings.linesExplained) {
      setToast('Section lines are on the page, so viewers see them. Drag a line’s tag to move where its cue starts.');
    }
  }, [settings.sectionLines, settings.linesExplained, updateSettings, setToast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isTyping(event.target) || menuOpen || sitesOpen || pasteOpen) return;
      if ((event.metaKey || event.ctrlKey) && ['=', '+', '-'].includes(event.key)) {
        event.preventDefault();
        updateSettings({ textSize: stepTextSize(settings.textSize, event.key === '-' ? -1 : 1) });
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (NEXT_KEYS.has(event.key)) {
        event.preventDefault();
        step(1);
      } else if (PREVIOUS_KEYS.has(event.key)) {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'p' || event.key === 'P') {
        setPaused((value) => !value);
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        send({ type: 'add-cue' });
      } else if (event.key === 'l' || event.key === 'L') {
        toggleLines();
      } else if (event.key === 's' || event.key === 'S') {
        setSitesOpen(true);
      } else if (event.key === '?') {
        setShortcutsWanted(true);
        setMenuOpen(true);
      } else if (event.key === 'Enter' && cues[activeIndex]) {
        event.preventDefault();
        setEditingId(cues[activeIndex].id);
      }
    };
    const onMessage = (message: RuntimeMessage): void => {
      if (message.type === 'step') step(message.delta);
    };
    window.addEventListener('keydown', onKey);
    browser.runtime.onMessage.addListener(onMessage);
    return () => {
      window.removeEventListener('keydown', onKey);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, [step, menuOpen, sitesOpen, pasteOpen, settings.textSize, toggleLines, updateSettings, cues, activeIndex, send]);

  // ------------------------------------------------------------ editing and menu actions

  const save = useCallback(
    (id: string, patch: Pick<Cue, 'title' | 'notes'>) =>
      void change({ kind: 'patch', id, patch, at: Date.now() }).catch(() =>
        setToast('Couldn’t save that change. Try again.'),
      ),
    [change, setToast],
  );

  const remove = useCallback(
    (id: string) => {
      setEditingId(null);
      setPending(({ [id]: _dropped, ...rest }) => rest);
      const removed = record?.cues.find((cue) => cue.id === id);
      void change({ kind: 'delete', id })
        .then(() => {
          if (removed)
            setToast('Cue deleted.', { label: 'Undo', run: () => void change({ kind: 'import', cues: [removed] }) });
        })
        .catch(() => setToast('Couldn’t delete that cue. Try again.'));
    },
    [change, record, setToast],
  );

  const exportCues = (): void => {
    if (!record || !page) return;
    download(`${slug(page.title)}.cues.json`, `${JSON.stringify(toCueFile(record.cues, page.title), null, 2)}\n`);
  };

  /** Adds cues from a cue file or from text Claude wrote (see `paste.ts`). Throws a message to show. */
  const addCuesFrom = async (text: string): Promise<number> => {
    if (!page) throw new Error('Open the page you’re presenting and click pagecue there first.');
    let cues;
    try {
      cues = parsePastedCues(text).map((cue) => ({ ...cue, origin: 'local' as const }));
    } catch (error) {
      throw new Error(error instanceof CueFileError ? error.message : 'Couldn’t read those cues.', { cause: error });
    }
    await change({ kind: 'import', cues });
    return cues.length;
  };

  const added = (count: number): void => setToast(`Added ${count} ${count === 1 ? 'cue' : 'cues'}.`);

  const importCues = async (file: File): Promise<void> => {
    try {
      added(await addCuesFrom(await file.text()));
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Couldn’t import that file.');
    }
  };

  const toggleRemember = async (): Promise<void> => {
    if (!pattern) return;
    try {
      if (remembered) await forgetSite(pattern);
      else await rememberSite(pattern);
    } catch (error) {
      setToast(`Couldn’t change site access: ${error instanceof Error ? error.message : String(error)}`);
    }
    setRemembered(await isRemembered(pattern).catch(() => false));
  };

  // ------------------------------------------------------------ the agent's live link (bridge)

  /** Sends a cue command to the page and waits for its answer. */
  const callPage = useCallback(
    (method: string, args: unknown[]): Promise<unknown> => {
      if (status !== 'connected') {
        return Promise.reject(
          new Error(
            'The prompter is not connected to a page. Ask the presenter to click the pagecue button on the page.',
          ),
        );
      }
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        apiCalls.current.set(id, { resolve, reject });
        send({ type: 'api', id, method, args });
        window.setTimeout(() => {
          if (apiCalls.current.delete(id)) reject(new Error('The page did not answer.'));
        }, 5000);
      });
    },
    [status, send],
  );

  const runCommand = useCallback(
    async ({ command, args }: BridgeCommand): Promise<unknown> => {
      const words = (input: Record<string, unknown>) => ({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      });
      switch (command) {
        case 'add_cue':
          return callPage('add', [{ ...words(args), near: args.near }]);
        case 'edit_cue':
          return callPage('edit', [args.cue, words(args)]);
        case 'remove_cue':
          return callPage('remove', [args.cue]);
        case 'show_cue':
          return callPage('show', [args.cue]);
        case 'set_view': {
          const patch: Partial<Settings> = {};
          if (typeof args.section_lines === 'boolean') patch.sectionLines = args.section_lines;
          if (typeof args.text_size === 'string' && args.text_size in TEXT_SIZES) {
            patch.textSize = args.text_size as TextSize;
          }
          if (args.theme === 'system' || args.theme === 'dark' || args.theme === 'light') patch.theme = args.theme;
          if (Object.keys(patch).length) updateSettings(patch);
          if (typeof args.paused === 'boolean') setPaused(args.paused);
          return 'Done.';
        }
        case 'open_page': {
          const tabId = await openPage(String(args.url));
          setTarget({ tabId, restricted: false, nonce: Date.now() });
          void showTab(tabId).catch(() => undefined);
          return 'Opened. The prompter follows it as soon as the page has loaded; call pagecue_status to check.';
        }
        default:
          throw new Error(`Unknown command ${command}.`);
      }
    },
    [callPage, updateSettings],
  );

  const bridge = useBridge(
    {
      status,
      page: page ? { url: page.url, title: page.title, key: page.siteKey } : null,
      cues: cues.map((cue, index) => ({ number: index + 1, id: cue.id, title: cue.title, notes: points(cue.notes) })),
      current: activeIndex + 1,
      view: { sectionLines: settings.sectionLines, paused, textSize: settings.textSize, theme: settings.theme },
    },
    runCommand,
  );

  // ------------------------------------------------------------ render

  const { light, label } = lightFor(status, paused);
  const claude: ClaudeLink = !bridge.online
    ? 'offline'
    : olderMinor(bridge.version, browser.runtime.getManifest().version)
      ? 'outdated'
      : 'online';
  const showChrome = !idle || menuOpen || paused || status !== 'connected' || editingId !== null || cues.length === 0;
  const addCue = status === 'connected' ? () => send({ type: 'add-cue' }) : undefined;
  const alwaysReconnect = async (): Promise<void> => {
    await toggleRemember();
    reconnect();
  };
  const frameAccess = page?.frameAccess;
  /** The cue list gives way to the request for access to the page's frame (see `allowFrame`). */
  const listShown = cues.length > 0 && !(unplaced && frameAccess);
  const position = listShown ? `${Math.max(1, Math.min(cues.length, activeIndex + 1))} of ${cues.length}` : '';
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;
  const footnote = unplaced
    ? 'pagecue can’t find where these cues go on this page, so they won’t follow your scrolling. Move through them with ↑ and ↓, or ask Claude to update them.'
    : missing > 0
      ? `${missing} ${missing === 1 ? 'cue isn’t' : 'cues aren’t'} on this page. Ask Claude to update the cues.`
      : undefined;
  /** Asks Chrome for access to the site the page's content comes from, then loads pagecue there. */
  const allowFrame = async (): Promise<void> => {
    if (!frameAccess || target.tabId === null) return;
    const tabId = target.tabId;
    if (!(await rememberSite(frameAccess.pattern).catch(() => false))) return;
    await injectInto(tabId).catch(() => undefined);
  };

  return (
    <div
      className={`app theme-${theme}${showChrome ? '' : ' is-quiet'}${dragging ? ' is-dropping' : ''}`}
      style={{ '--scale': TEXT_SIZES[settings.textSize] } as React.CSSProperties}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        const file = event.dataTransfer.files[0];
        if (!file) return;
        event.preventDefault();
        setDragging(false);
        void importCues(file);
      }}
    >
      <header className="top" dir="ltr">
        <button
          type="button"
          className={`light-button is-${light}`}
          onClick={() => status === 'connected' && setPaused((value) => !value)}
          title={
            status !== 'connected'
              ? label
              : paused
                ? 'Paused. Click to resume (P)'
                : 'Following the page. Click to pause (P)'
          }
          aria-label={label}
          aria-pressed={status === 'connected' ? paused : undefined}
        >
          <span className={`light is-${light}`} />
        </button>
        <button type="button" className="page-name chrome" title="Sites (S)" onClick={() => setSitesOpen(true)}>
          <span className="page-title" dir="auto">
            {record?.name ?? (page?.title ? shortTitle(page.title) : status === 'idle' ? 'pagecue' : label)}
          </span>
          <svg className="chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        {paused ? (
          <button type="button" className="resume" onClick={() => setPaused(false)}>
            Resume
          </button>
        ) : (
          <span className="position">{position}</span>
        )}
      </header>

      <main
        className="stage"
        onDoubleClick={(event) => {
          // Double-click on empty space (not a cue or a control) adds a cue at the page's reading line.
          const target = event.target as Element;
          if (!addCue || editingId || target.closest('.cue, .tip, .footnote, button, a, textarea, input')) return;
          event.preventDefault();
          window.getSelection()?.removeAllRanges();
          addCue();
        }}
      >
        {status === 'connected' && listShown ? (
          <CueList
            ref={listRef}
            cues={cues}
            current={activeIndex}
            editingId={editingId}
            footnote={footnote}
            addHint
            tip={
              settings.tipSeen
                ? undefined
                : {
                    text: 'Scroll the page or this list; they move together. Double-click a cue to change its words, or empty space to add one.',
                    onDismiss: () => updateSettings({ tipSeen: true }),
                  }
            }
            onScrollPosition={followList}
            onSelect={select}
            onEdit={setEditingId}
            onSave={save}
            onDelete={remove}
            onDiscard={discard}
          />
        ) : (
          <Empty
            status={status}
            frameAccess={frameAccess}
            onAllowFrame={() => void allowFrame()}
            host={page?.url ? hostOf(page.url) : pattern ? hostOf(pattern.replace('/*', '/')) : null}
            pageUrl={page?.url ?? null}
            canRemember={pattern !== null && !remembered}
            onRetry={reconnect}
            onAddCue={addCue}
            claude={claude}
            onAlwaysReconnect={() => void alwaysReconnect()}
          />
        )}
      </main>

      <footer className="bottom" dir="ltr">
        {status === 'connected' ? <Timer key={page?.siteKey} /> : <span />}
        <div className="controls">
          {status === 'connected' && <LinesToggle on={settings.sectionLines} onToggle={toggleLines} />}
          <TextSizeButtons size={settings.textSize} onChange={(textSize) => updateSettings({ textSize })} />
          <button
            type="button"
            className="menu-button icon-button"
            aria-label="More"
            title="More (?)"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setShortcutsWanted(false);
              setMenuOpen((open) => !open);
            }}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <Menu
          open={menuOpen}
          showShortcuts={shortcutsWanted}
          settings={settings}
          paused={paused}
          canExport={!!record?.cues.length}
          canEdit={status === 'connected' && !!cues[activeIndex]}
          onAddCue={addCue}
          onEditCurrent={() => cues[activeIndex] && setEditingId(cues[activeIndex].id)}
          onTogglePause={() => setPaused((value) => !value)}
          onClose={() => setMenuOpen(false)}
          onSettings={updateSettings}
          onSites={() => setSitesOpen(true)}
          onPaste={() => setPasteOpen(true)}
          onExport={exportCues}
        />
      </footer>

      <input
        ref={importRef}
        type="file"
        accept=".json,.md,.txt,application/json,text/markdown,text/plain"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importCues(file);
          event.target.value = '';
        }}
      />

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      {pasteOpen && (
        <PasteSheet
          onAdd={async (text) => added(await addCuesFrom(text))}
          onChooseFile={() => importRef.current?.click()}
          onClose={() => setPasteOpen(false)}
        />
      )}

      {sitesOpen && (
        <SitesSheet
          currentKey={page?.siteKey ?? null}
          onChoose={(tabId) => {
            setTarget({ tabId, restricted: false, nonce: Date.now() });
            setSitesOpen(false);
          }}
          onClose={() => setSitesOpen(false)}
        />
      )}
    </div>
  );
}

/** The live link with Claude Code (the plugin's bridge on this computer). */
type ClaudeLink = 'online' | 'outdated' | 'offline';

/** True when `version` (the plugin's) is older than `than` (the extension's) in major or minor. */
function olderMinor(version: string | undefined, than: string): boolean {
  if (!version) return true;
  const [a = 0, b = 0] = version.split('.').map(Number);
  const [c = 0, d = 0] = than.split('.').map(Number);
  return a < c || (a === c && b < d);
}

/** Whether Claude Code can reach this prompter, so a missing or old plugin never fails silently. */
function ClaudeStatus({ link }: { link: ClaudeLink }) {
  if (link === 'online') {
    return (
      <span className="claude-status is-online">
        <span className="claude-dot" aria-hidden="true" />
        Connected to Claude
      </span>
    );
  }
  if (link === 'outdated') {
    return (
      <span className="claude-status is-outdated">
        <span className="claude-dot" aria-hidden="true" />
        Update the pagecue plugin
      </span>
    );
  }
  return (
    <span className="claude-status">
      First time?{' '}
      <a href={LINKS.plugin} target="_blank" rel="noopener noreferrer">
        Set up Claude
      </a>
    </span>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** What the presenter pastes to Claude Code: the add-cues skill's command, so the skill always runs. */
const agentPrompt = (url: string): string => `/pagecue:add-cues ${url}\n\nWhat I want to say: `;

/** The page as people read it: host and path, letters decoded, no scheme. */
const readableUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.host.replace(/^www\./, '') + parsed.pathname + parsed.search).replace(/\/$/, '');
  } catch {
    return url;
  }
};

/** A ready prompt to copy, so nobody has to remember a command. Shows a one-line preview. */
function AgentPrompt({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard.writeText(agentPrompt(url)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <button
      type="button"
      className={`prompt-card${copied ? ' is-copied' : ''}`}
      onClick={copy}
      title={agentPrompt(url)}
    >
      <span className="prompt-card-text">
        <code className="prompt-card-command">/pagecue:add-cues</code>
        <span className="prompt-card-url" dir="auto">
          {readableUrl(url)}
        </span>
      </span>
      <span className="prompt-card-action">{copied ? 'Copied ✓' : 'Copy'}</span>
    </button>
  );
}

function Empty({
  status,
  frameAccess,
  onAllowFrame,
  host,
  pageUrl,
  canRemember,
  onRetry,
  onAddCue,
  claude,
  onAlwaysReconnect,
}: {
  status: ConnectionStatus;
  frameAccess?: FrameAccess;
  onAllowFrame: () => void;
  host: string | null;
  pageUrl: string | null;
  canRemember: boolean;
  onRetry: () => void;
  onAddCue?: () => void;
  claude: ClaudeLink;
  onAlwaysReconnect: () => void;
}) {
  const content: Record<ConnectionStatus, { title: string; body: React.ReactNode }> = {
    idle: {
      title: 'Open the page you’re presenting',
      body: (
        <>
          Then press <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>P</kbd> there, or click pagecue in Chrome’s toolbar (pin it
          from the puzzle-piece menu so it’s always there).
        </>
      ),
    },
    connecting: { title: 'Connecting', body: 'Waiting for the page to finish loading.' },
    connected: frameAccess
      ? {
          title: 'This page shows its content in a frame',
          body: (
            <>
              The page you see comes from <b dir="ltr">{frameAccess.site}</b>. Let pagecue read it there too, so your
              cues can follow it. Chrome asks you once.
              <span className="empty-actions">
                <button type="button" className="empty-action" onClick={onAllowFrame}>
                  Allow on {frameAccess.site}
                </button>
              </span>
            </>
          ),
        }
      : {
          title: 'No cues yet',
          body: (
            <>
              Paste this into Claude Code.
              {pageUrl && <AgentPrompt url={pageUrl} />}
              <ClaudeStatus link={claude} />
              {onAddCue && (
                <button type="button" className="empty-own" onClick={onAddCue}>
                  Or write one yourself <kbd>N</kbd>
                </button>
              )}
            </>
          ),
        },
    'needs-access': {
      title: 'The page reloaded',
      body: (
        <>
          Click pagecue in Chrome’s toolbar to reconnect.
          <span className="empty-actions">
            <button type="button" className="quiet-button" onClick={onRetry}>
              Try again
            </button>
            {canRemember && host && (
              <button type="button" className="empty-action" onClick={onAlwaysReconnect}>
                Always reconnect on {host}
              </button>
            )}
          </span>
        </>
      ),
    },
    restricted: {
      title: 'pagecue can’t run here',
      body: 'Chrome doesn’t let extensions run on its own pages. Open the page you’re presenting and click pagecue there.',
    },
    closed: { title: 'The page was closed', body: 'Open it again, or click the page title to choose another page.' },
  };
  const { title, body } = content[status];
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      <HelpLinks />
    </div>
  );
}
