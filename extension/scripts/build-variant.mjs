/**
 * Builds a test variant of the extension: `node scripts/build-variant.mjs e2e` (or `qa`).
 * Sets PAGECUE_E2E=1 or PAGECUE_QA=1 for wxt.config.ts the same way on every system, since
 * Windows' command prompt cannot read `NAME=value command`.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const variants = { e2e: 'PAGECUE_E2E', qa: 'PAGECUE_QA' };
const name = variants[process.argv[2]];
if (!name) {
  console.error(`Usage: node scripts/build-variant.mjs ${Object.keys(variants).join('|')}`);
  process.exit(2);
}
const wxt = fileURLToPath(new URL('../node_modules/wxt/bin/wxt.mjs', import.meta.url));
const result = spawnSync(process.execPath, [wxt, 'build'], { stdio: 'inherit', env: { ...process.env, [name]: '1' } });
process.exit(result.status ?? 1);
