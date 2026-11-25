import { useEffect, useRef, useState } from 'react';
import { rememberSite } from '../../lib/access';
import { openPage, showTab } from '../../lib/openPage';
import { originPattern } from '../../lib/siteKey';
import { deleteSite, requestRename, shortTitle, siteName } from '../../lib/store';
import type { SiteRecord } from '../../lib/types';
import { useLibrary } from '../useSite';

const host = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' ? 'Files on this computer' : parsed.host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** The page's path and query, readable (Hebrew and other letters decoded), for telling pages apart. */
const pathOf = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return decodeURI(parsed.pathname.split('/').pop() ?? '');
    const path = decodeURIComponent(parsed.pathname + parsed.search);
    return path === '/' ? '' : path;
  } catch {
    return '';
  }
};

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M11 2.5 13.5 5 6 12.5 3 13l.5-3z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface Props {
  /** Key of the site the prompter follows now, marked in the list. */
  currentKey: string | null;
  onChoose: (tabId: number) => void;
  onClose: () => void;
}

/** A site's name that turns into a text field for renaming. */
function NameField({ site, onDone }: { site: SiteRecord; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const save = (): void => {
    const value = ref.current?.value ?? '';
    if (value.trim() !== siteName(site)) void requestRename(site.key, value);
    onDone();
  };
  return (
    <input
      ref={ref}
      className="row-rename"
      dir="auto"
      defaultValue={siteName(site)}
      placeholder={shortTitle(site.title)}
      aria-label={`Name for ${site.title}`}
      onBlur={save}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') save();
        if (event.key === 'Escape') onDone();
      }}
    />
  );
}

/** Every site with cues: go to one, rename it or delete its cues. */
export function SitesSheet({ currentKey, onChoose, onClose }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const library = useLibrary();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chooseTab = (tabId: number): void => {
    onChoose(tabId);
    void showTab(tabId).catch(() => undefined);
  };

  /**
   * Goes to a site with cues: its tab if one is open, otherwise a new tab in the browser window.
   * Asking for the site's access here (a click, so Chrome allows the prompt) lets pagecue connect
   * by itself once the page loads; without it the presenter clicks pagecue's button there.
   */
  const openSite = (site: SiteRecord): void => {
    const pattern = originPattern(site.url);
    const access = pattern ? rememberSite(pattern).catch(() => false) : Promise.resolve(false);
    void (async () => {
      await access;
      chooseTab(await openPage(site.url));
    })();
  };

  // Pages with no cues left are noise; the one being presented stays so it can be renamed.
  const sites = library.filter((site) => site.cues.length > 0 || site.key === currentKey);
  const groups = new Map<string, SiteRecord[]>();
  for (const site of sites) groups.set(host(site.url), [...(groups.get(host(site.url)) ?? []), site]);

  return (
    <div className="sheet" role="dialog" aria-label="Sites">
      <header className="sheet-header">
        <h2>Sites</h2>
        <button type="button" className="quiet-button" onClick={onClose}>
          Done
        </button>
      </header>

      {sites.length === 0 ? (
        <p className="sheet-note">Pages with cues show up here.</p>
      ) : (
        [...groups].map(([name, pages]) => (
          <section key={name} className="site-group">
            <h3>{name}</h3>
            <ul className="rows">
              {pages.map((site) => (
                <li key={site.key} className="site-row">
                  {renaming === site.key ? (
                    <NameField site={site} onDone={() => setRenaming(null)} />
                  ) : (
                    <button
                      type="button"
                      className="row"
                      aria-current={site.key === currentKey ? 'true' : undefined}
                      title={site.url}
                      onClick={() => openSite(site)}
                      onDoubleClick={() => setRenaming(site.key)}
                    >
                      <span className="row-title" dir="auto">
                        {siteName(site)}
                      </span>
                      <span className="row-meta">
                        {site.key === currentKey && <span className="row-badge">Presenting</span>}
                        {site.cues.length} {site.cues.length === 1 ? 'cue' : 'cues'}
                        {pathOf(site.url) && (
                          <>
                            {' · '}
                            <span dir="auto">{pathOf(site.url)}</span>
                          </>
                        )}
                      </span>
                    </button>
                  )}
                  {renaming !== site.key && (
                    <span className="row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Rename ${siteName(site)}`}
                        title="Rename"
                        onClick={() => setRenaming(site.key)}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={`Delete the cues for ${siteName(site)}`}
                        title="Delete cues"
                        onClick={() => {
                          const count = `${site.cues.length} ${site.cues.length === 1 ? 'cue' : 'cues'}`;
                          if (confirm(`Delete ${count} for “${siteName(site)}”? This can’t be undone.`)) {
                            void deleteSite(site.key);
                          }
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
