import { useEffect, useRef, useState } from 'react';

/** The local pagecue bridge (the Claude Code plugin's server). */
const BRIDGE = __PAGECUE_BRIDGE__;
/** How often the prompter reports while the bridge answers; slower while it does not. */
const POLL_MS = 700;
const POLL_AFTER_COMMAND_MS = 200;
const POLL_OFFLINE_MS = 5000;
const HEADERS = { 'content-type': 'application/json', 'x-pagecue': '1' };

/** Whether the bridge answers, and its version (the plugin's), for the prompter to show. */
export interface BridgeStatus {
  online: boolean;
  version?: string;
}

export interface BridgeCommand {
  id: string;
  command: string;
  args: Record<string, unknown>;
}

/**
 * The live link with an agent (Claude Code, through the pagecue plugin). While the prompter is open
 * it reports what it shows (page, cues, current cue, view) to the bridge on this computer, and
 * carries out the commands the agent queued there, answering each with its result. Without a
 * bridge running it just retries now and then; nothing leaves the computer.
 */
export function useBridge(state: unknown, run: (command: BridgeCommand) => Promise<unknown>): BridgeStatus {
  const [status, setStatus] = useState<BridgeStatus>({ online: false });
  const stateRef = useRef(state);
  const runRef = useRef(run);
  useEffect(() => {
    stateRef.current = state;
    runRef.current = run;
  });

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const tick = async (): Promise<void> => {
      let delay = POLL_MS;
      try {
        const response = await fetch(`${BRIDGE}/v1/state`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(stateRef.current),
          signal: AbortSignal.timeout(1500),
        });
        const { commands = [], version } = (await response.json()) as { commands?: BridgeCommand[]; version?: string };
        setStatus((current) =>
          current.online && current.version === version ? current : { online: true, ...(version ? { version } : {}) },
        );
        for (const command of commands) {
          let reply: { id: string; ok: boolean; result?: unknown; error?: string };
          try {
            reply = { id: command.id, ok: true, result: await runRef.current(command) };
          } catch (error) {
            reply = { id: command.id, ok: false, error: error instanceof Error ? error.message : String(error) };
          }
          await fetch(`${BRIDGE}/v1/results`, { method: 'POST', headers: HEADERS, body: JSON.stringify(reply) }).catch(
            () => undefined,
          );
        }
        // Report the result of a command (new cues, a new page) soon after carrying it out.
        if (commands.length) delay = POLL_AFTER_COMMAND_MS;
      } catch {
        delay = POLL_OFFLINE_MS;
        setStatus((current) => (current.online ? { online: false } : current));
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), delay);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  return status;
}
