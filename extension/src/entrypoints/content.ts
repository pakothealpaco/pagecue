import { PageController } from '../content/page';

/**
 * Injected on demand, never declared for all sites: when the presenter clicks the toolbar button
 * (temporary `activeTab` access), and on every page of the sites they chose to remember
 * (registered at runtime, see `lib/access.ts`).
 */
export default defineContentScript({
  registration: 'runtime',
  main() {
    const flag = '__pagecueLoaded';
    const scope = window as Window & { [flag]?: boolean };
    if (scope[flag]) return;
    scope[flag] = true;
    void new PageController().start();
  },
});
