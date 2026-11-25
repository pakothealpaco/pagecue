import { useCallback, useEffect, useRef, useState } from 'react';
import { browser, type Browser } from 'wxt/browser';
import { injectInto } from '../lib/access';
import type { PageMessage, PingReply, PrompterMessage } from '../lib/protocol';
import { PORT_NAME } from '../lib/protocol';
import type { CueChange } from '../lib/cueChange';
import { SESSION_MAIN_FRAMES, type MainFrames } from '../lib/session';
import type { Cue, CuePosition } from '../lib/types';

export type ConnectionStatus =
  /** No tab chosen yet. */
  | 'idle'
  | 'connecting'
  | 'connected'
  /** The tab is open but pagecue has no access to it (it reloaded and the site is not remembered). */
  | 'needs-access'
  /** The toolbar button was clicked on a page Chrome does not let extensions run on. */
  | 'restricted'
  /** The tab was closed. */
  | 'closed';

type PageState = Extract<PageMessage, { type: 'state' }>;

export interface PageConnection {
  status: ConnectionStatus;
  page: PageState | null;
  send: (message: PrompterMessage) => void;
  /** Try again, injecting the content script when pagecue has access. */
  reconnect: () => void;
}

async function ping(tabId: number, frameId: number): Promise<PingReply | null> {
  try {
    const reply = (await browser.tabs.sendMessage(tabId, { type: 'ping' }, { frameId })) as PingReply | undefined;
    return reply?.pagecue ? reply : null;
  } catch {
    return null;
  }
}

/** The frame that shows the tab's page: the top frame unless its content lives in a frame. */
async function mainFrame(tabId: number): Promise<number> {
  const stored = await browser.storage.session.get(SESSION_MAIN_FRAMES);
  return (stored[SESSION_MAIN_FRAMES] as MainFrames | undefined)?.[tabId] ?? 0;
}

/** The frame to talk to, if pagecue runs there; falls back to the top frame after a reload. */
async function reachableFrame(tabId: number): Promise<number | null> {
  const frameId = await mainFrame(tabId);
  if (await ping(tabId, frameId)) return frameId;
  if (frameId !== 0 && (await ping(tabId, 0))) return 0;
  return null;
}

/**
 * Keeps a port open to the content script of one tab and survives reloads and navigation:
 * when the page goes away it waits for the tab to finish loading, then reconnects.
 *
 * `tabId` null with `restricted` means the presenter clicked pagecue on a browser page.
 * `nonce` changes on every toolbar click, so clicking again on the same tab reconnects.
 */
export function usePageConnection(
  target: { tabId: number | null; restricted: boolean; nonce: number },
  handlers: {
    onPosition: (position: CuePosition) => void;
    onCueAdded: (cue: Cue | null) => void;
    onAgentChange: (text: string, undo: CueChange) => void;
    onApiResult: (id: string, ok: boolean, result: unknown, error?: string) => void;
  },
): PageConnection {
  const { tabId, restricted, nonce } = target;
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [page, setPage] = useState<PageState | null>(null);
  const portRef = useRef<Browser.runtime.Port | null>(null);
  /** The frame the port is open to. */
  const frameRef = useRef(0);
  /** Each connection attempt takes a number; an attempt that is no longer the latest gives up. */
  const attemptRef = useRef(0);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const disconnect = useCallback(() => {
    const port = portRef.current;
    portRef.current = null;
    port?.disconnect();
  }, []);

  const connect = useCallback(
    async (id: number) => {
      const attempt = ++attemptRef.current;
      const current = (): boolean => attempt === attemptRef.current;
      disconnect();
      setStatus('connecting');

      try {
        await browser.tabs.get(id);
      } catch {
        if (current()) setStatus('closed');
        return;
      }
      let frameId = await reachableFrame(id);
      if (frameId === null && current()) {
        await injectInto(id).catch(() => undefined);
        frameId = await reachableFrame(id);
      }
      if (!current()) return;
      if (frameId === null) {
        setStatus('needs-access');
        return;
      }

      const port = browser.tabs.connect(id, { name: PORT_NAME, frameId });
      portRef.current = port;
      frameRef.current = frameId;
      port.onMessage.addListener((message: PageMessage) => {
        if (portRef.current !== port) return;
        switch (message.type) {
          case 'state':
            setPage(message);
            break;
          case 'position':
            handlersRef.current.onPosition(message.position);
            break;
          case 'cue-added':
            handlersRef.current.onCueAdded(message.cue);
            break;
          case 'api-result':
            handlersRef.current.onApiResult(message.id, message.ok, message.result, message.error);
            break;
          case 'agent-change':
            handlersRef.current.onAgentChange(message.text, message.undo);
            break;
          case 'add-failed':
            handlersRef.current.onCueAdded(null);
            break;
        }
      });
      port.onDisconnect.addListener(() => {
        if (portRef.current !== port) return;
        portRef.current = null;
        // The page reloaded or navigated; `tabs.onUpdated` reconnects once it has loaded. A page
        // that handed itself to a frame (see `content/frames.ts`) does not reload: retry soon.
        setStatus('connecting');
        window.setTimeout(() => {
          if (portRef.current || !current()) return;
          void browser.tabs
            .get(id)
            .then((tab) => {
              if (tab.status === 'complete' && !portRef.current && current()) void connect(id);
            })
            .catch(() => undefined);
        }, 500);
      });
      port.postMessage({ type: 'sync-request' } satisfies PrompterMessage);
      setStatus('connected');
    },
    [disconnect],
  );

  useEffect(() => {
    setPage(null);
    if (tabId === null) {
      attemptRef.current += 1;
      disconnect();
      setStatus(restricted ? 'restricted' : 'idle');
      return;
    }
    void connect(tabId);

    const handleUpdated = (id: number, info: Browser.tabs.OnUpdatedInfo): void => {
      if (id === tabId && info.status === 'complete' && !portRef.current) void connect(tabId);
    };
    const handleRemoved = (id: number): void => {
      if (id !== tabId) return;
      attemptRef.current += 1;
      disconnect();
      setStatus('closed');
    };
    // The page handed itself to a frame inside it, or took itself back: follow it there.
    const handleFrames = (changes: Record<string, Browser.storage.StorageChange>, area: string): void => {
      if (area !== 'session' || !(SESSION_MAIN_FRAMES in changes)) return;
      const frameId = (changes[SESSION_MAIN_FRAMES]!.newValue as MainFrames | undefined)?.[tabId] ?? 0;
      if (frameId !== frameRef.current) void connect(tabId);
    };
    browser.tabs.onUpdated.addListener(handleUpdated);
    browser.tabs.onRemoved.addListener(handleRemoved);
    browser.storage.onChanged.addListener(handleFrames);
    return () => {
      browser.tabs.onUpdated.removeListener(handleUpdated);
      browser.tabs.onRemoved.removeListener(handleRemoved);
      browser.storage.onChanged.removeListener(handleFrames);
      attemptRef.current += 1;
      disconnect();
    };
  }, [tabId, restricted, nonce, connect, disconnect]);

  const send = useCallback((message: PrompterMessage) => {
    portRef.current?.postMessage(message);
  }, []);

  const reconnect = useCallback(() => {
    if (tabId !== null) void connect(tabId);
  }, [tabId, connect]);

  return { status, page, send, reconnect };
}
