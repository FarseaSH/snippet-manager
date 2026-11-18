import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { contentPlugin } from './scripts/content-plugin.ts';

const rawBase = process.env.SITE_BASE || '/';
const base = '/' + rawBase.replace(/^\/+|\/+$/g, '') + '/';

export default defineConfig({
  base: base === '//' ? '/' : base,
  plugins: [react(), contentPlugin()],
  resolve: {
    alias: {
      'snippet-manager/icons/brands': fileURLToPath(new URL('./src/vendor/brand-icons.ts', import.meta.url)),
      'snippet-manager/icons/ui': fileURLToPath(new URL('./src/vendor/ui-icons.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    // Include lazy dependencies up front to avoid a second prebundle on first use.
    // The icon entries export only the icons used by this app.
    include: [
      'snippet-manager/icons/brands', 'snippet-manager/icons/ui',
      'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime',
      'react-router-dom', 'workbox-window', 'react-datepicker', 'date-fns/locale/zh-CN',
      '@codemirror/commands', '@codemirror/language', '@codemirror/language-data',
      '@codemirror/search', '@codemirror/state', '@codemirror/view', '@lezer/highlight',
      '@replit/codemirror-indentation-markers',
      'unified', 'remark-parse', 'remark-gfm', 'remark-rehype', 'rehype-sanitize', 'rehype-stringify',
      'shiki/core', 'shiki/engine/oniguruma', 'shiki/langs', 'shiki/wasm',
      'es-module-lexer/js', 'postcss', 'postcss-value-parser',
    ],
    holdUntilCrawlEnd: false,
    rolldownOptions: {
      plugins: [{
        name: 'omit-unused-brand-catalog-source',
        generateBundle(_options, bundle) {
          // Even after tree shaking, the brand map embeds the entire 5MB catalog.
          // Leave its immutable data source empty; keep other dependency maps intact.
          for (const file of Object.values(bundle)) {
            if (file.type !== 'asset' || !file.fileName.endsWith('.js.map')) continue;
            const source = String(file.source);
            if (!source.includes('simple-icons/index.mjs')) continue;
            const map = JSON.parse(source);
            map.sources.forEach((name: string, index: number) => {
              if (name.endsWith('simple-icons/index.mjs')) map.sourcesContent[index] = '';
            });
            file.source = JSON.stringify(map);
          }
        },
      }],
    },
  },
  server: {
    port: 5173,
    warmup: {
      clientFiles: ['./src/main.tsx', './src/app/App.tsx', './src/features/snippets/CodeEditor.tsx'],
    },
  },
  preview: { port: 4173 },
  build: { sourcemap: false },
});
