import { defineConfig } from 'wxt';

/**
 * `PAGECUE_E2E=1` builds a test variant with access to the local fixture server, so the
 * end-to-end test can connect without Chrome's permission prompt. Never ship that build.
 */
const e2e = process.env.PAGECUE_E2E === '1';
/** `PAGECUE_QA=1`: the test variant with access to every site, for trying pagecue on real sites. */
const qa = process.env.PAGECUE_QA === '1';

export default defineConfig({
  srcDir: 'src',
  outDir: qa ? '.output-qa' : e2e ? '.output-e2e' : '.output',
  modules: ['@wxt-dev/module-react'],
  // The local bridge's port. The test build uses its own, so a bridge the developer runs for real
  // does not interfere with the end-to-end test.
  vite: () => ({
    define: {
      __PAGECUE_BRIDGE__: JSON.stringify(`http://127.0.0.1:${e2e || qa ? 47614 : 47613}`),
      // Test builds skip the welcome tab on install, so tests start from a clean window.
      __PAGECUE_TEST__: JSON.stringify(e2e || qa),
    },
  }),
  manifest: {
    name: 'pagecue',
    description:
      'Speaker notes for any web page, written with Claude, in a private window that follows the page as you scroll.',
    permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage'],
    optional_host_permissions: ['<all_urls>'],
    ...(e2e ? { host_permissions: ['http://127.0.0.1/*'] } : {}),
    ...(qa ? { host_permissions: ['<all_urls>'] } : {}),
    action: { default_title: 'Open pagecue for this tab' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+P' },
        description: 'Open pagecue for the current tab',
      },
      'next-cue': { suggested_key: { default: 'Alt+Shift+Down' }, description: 'Next cue' },
      'previous-cue': { suggested_key: { default: 'Alt+Shift+Up' }, description: 'Previous cue' },
    },
  },
});
