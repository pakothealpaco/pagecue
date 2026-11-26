// usepagecue.com: the product page (src/pages/index.astro) and the user guide (Starlight, under /guide/).
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const repo = 'https://github.com/pakothealpaco/pagecue';

export default defineConfig({
  site: 'https://usepagecue.com',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'pagecue',
      description: 'Speaker notes for any web page, written with Claude.',
      logo: { src: './src/assets/mark.svg', alt: '' },
      favicon: '/favicon.svg',
      titleDelimiter: '·',
      social: [{ icon: 'github', label: 'pagecue on GitHub', href: repo }],
      editLink: { baseUrl: `${repo}/edit/main/site/` },
      lastUpdated: true,
      customCss: [
        '@fontsource/ibm-plex-sans/400.css',
        '@fontsource/ibm-plex-sans/500.css',
        '@fontsource/ibm-plex-sans/600.css',
        '@fontsource/ibm-plex-mono/400.css',
        './src/styles/theme.css',
      ],
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '48x48' } },
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon-96x96.png', type: 'image/png', sizes: '96x96' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        { tag: 'link', attrs: { rel: 'manifest', href: '/site.webmanifest' } },
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://usepagecue.com/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1280' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '640' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        // Visit counts without cookies or personal data (see the Privacy page).
        {
          tag: 'script',
          attrs: {
            'data-goatcounter': 'https://pakothealpaco.goatcounter.com/count',
            async: true,
            src: 'https://gc.zgo.at/count.js',
          },
        },
      ],
      components: {
        Footer: './src/components/DocsFooter.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
      },
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What is pagecue', slug: 'guide' },
            { label: 'Install', slug: 'guide/install' },
            { label: 'Your first presentation', slug: 'guide/quick-start' },
          ],
        },
        {
          label: 'Write cues with Claude',
          items: [
            { label: 'Add cues to a page', slug: 'guide/claude/add-cues' },
            { label: 'claude.ai and the Claude app', slug: 'guide/claude/apps' },
            { label: 'Change cues while you rehearse', slug: 'guide/claude/live' },
            { label: 'Prompts that work', slug: 'guide/claude/prompts' },
          ],
        },
        {
          label: 'Present',
          items: [
            { label: 'The prompter', slug: 'guide/prompter' },
            { label: 'Edit cues yourself', slug: 'guide/editing' },
            { label: 'Section lines', slug: 'guide/section-lines' },
            { label: 'Share your screen privately', slug: 'guide/sharing' },
            { label: 'Site access, frames and local files', slug: 'guide/sites' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Prompter controls', slug: 'guide/reference/controls' },
            { label: 'Keyboard shortcuts', slug: 'guide/reference/shortcuts' },
            { label: 'Claude tools', slug: 'guide/reference/claude-tools' },
            { label: 'Cue file format', slug: 'guide/reference/cue-file' },
            { label: 'Permissions', slug: 'guide/reference/permissions' },
          ],
        },
        {
          label: 'Help',
          items: [
            { label: 'Troubleshooting', slug: 'guide/troubleshooting' },
            { label: 'FAQ', slug: 'guide/faq' },
            { label: 'Privacy', slug: 'guide/privacy' },
          ],
        },
      ],
    }),
  ],
});
