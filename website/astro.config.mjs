// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { rehypeTableWrapper } from './src/rehype-table-wrapper.mjs';

export default defineConfig({
  site: 'https://zenpix.tsukasa-art.com',
  markdown: {
    rehypePlugins: [rehypeTableWrapper],
  },
  integrations: [
    starlight({
      title: 'zenpix',
      logo: {
        src: './public/logo-icon.jpg',
        alt: 'zenpix',
      },
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ja: { label: '日本語', lang: 'ja' },
      },
      expressiveCode: {
        themes: ['tokyo-night'],
        styleOverrides: {
          frames: {
            frameBoxShadowCssValue: 'none',
          },
        },
      },
      customCss: ['./src/styles/starlight-theme.css'],
      components: {
        LanguageSelect: './src/components/LanguageToggle.astro',
      },
      sidebar: [
        { slug: 'index', label: 'Getting Started', translations: { ja: 'はじめに' } },
        { slug: 'cli', label: 'CLI Guide', translations: { ja: 'CLI ガイド' } },
        { slug: 'api', label: 'API Reference', translations: { ja: 'API リファレンス' } },
        { slug: 'benchmarks', label: 'Benchmarks', translations: { ja: 'ベンチマーク' } },
        { slug: 'environments', label: 'Environments & Troubleshooting', translations: { ja: '動作環境・トラブルシューティング' } },
      ],
      favicon: '/favicon.png',
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: 'https://fonts.googleapis.com',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: 'https://fonts.gstatic.com',
            crossorigin: '',
          },
        },
        {
          tag: 'link',
          attrs: {
            href: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Outfit:wght@400;600;700;900&display=swap',
            rel: 'stylesheet',
          },
        },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/tsukasa-art/zenpix' },
        { icon: 'npm', label: 'npm', href: 'https://www.npmjs.com/package/zenpix' },
      ],
    }),
  ],
});
