/**
 * Turns a URL into the key cues are stored under.
 *
 * - Keeps the origin (with port, so two local dev servers stay apart) and the path.
 * - Treats `/`, `/index.html` and a trailing slash as the same page.
 * - Drops tracking parameters and sorts the rest, so `?b=1&a=2` and `?a=2&b=1` match.
 * - Keeps hash routes (`#/settings`, `#!/x`) used by single-page apps, drops plain fragments.
 */
const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|ref|ref_src)$/i;

export function siteKey(input: string): string {
  const url = new URL(input);

  if (url.protocol === 'file:') {
    return `file://${decodeURI(url.pathname)}`;
  }

  let path = url.pathname.replace(/\/index\.html?$/i, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');

  const params = [...url.searchParams.entries()]
    .filter(([name]) => !TRACKING_PARAMS.test(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';

  const hash = /^#!?\//.test(url.hash) ? url.hash : '';

  return `${url.origin}${path}${query}${hash}`;
}

/** The match pattern that grants pagecue access to every page of a URL's origin. */
export function originPattern(input: string): string | null {
  const url = new URL(input);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return `${url.protocol}//${url.hostname}/*`;
}
