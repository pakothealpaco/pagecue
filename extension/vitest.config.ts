import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  // Tests also load the Claude Code plugin's bridge, which lives outside this package.
  server: { fs: { allow: [resolve(__dirname, '..')] } },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
