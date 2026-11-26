#!/usr/bin/env node
// Packs the pagecue bridge as a Claude desktop extension (pagecue.mcpb), installed with a double-click
// in the Claude app on macOS and Windows. The app ships its own Node.js, so users need nothing else.
//
//   node plugins/pagecue/scripts/pack-desktop-extension.mjs [output.mcpb]
//
// The bundle holds desktop/manifest.json, server/bridge.mjs and the icon; the bridge has no dependencies.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(plugin, '../..');
const output = resolve(process.argv[2] ?? join(root, 'release/pagecue.mcpb'));

const manifest = JSON.parse(readFileSync(join(plugin, 'desktop/manifest.json'), 'utf8'));
const { version } = JSON.parse(readFileSync(join(plugin, '.claude-plugin/plugin.json'), 'utf8'));
const bridgeVersion = /const VERSION = '([^']+)'/.exec(readFileSync(join(plugin, 'server/bridge.mjs'), 'utf8'))?.[1];
if (manifest.version !== version || bridgeVersion !== version) {
  throw new Error(`Versions differ: manifest ${manifest.version}, plugin ${version}, bridge ${bridgeVersion}.`);
}

const stage = mkdtempSync(join(tmpdir(), 'pagecue-mcpb-'));
try {
  mkdirSync(join(stage, 'server'));
  copyFileSync(join(plugin, 'desktop/manifest.json'), join(stage, 'manifest.json'));
  copyFileSync(join(plugin, 'server/bridge.mjs'), join(stage, 'server/bridge.mjs'));
  copyFileSync(join(plugin, 'desktop/icon.png'), join(stage, 'icon.png'));
  copyFileSync(join(root, 'LICENSE'), join(stage, 'LICENSE'));
  mkdirSync(dirname(output), { recursive: true });
  const mcpb = ['--yes', '@anthropic-ai/mcpb@2'];
  execFileSync('npx', [...mcpb, 'validate', join(stage, 'manifest.json')], { stdio: 'inherit' });
  execFileSync('npx', [...mcpb, 'pack', stage, output], { stdio: 'inherit' });
  console.log(`✓ ${output}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
