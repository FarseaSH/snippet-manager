import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { contentPlugin } from './scripts/content-plugin.ts';

const rawBase = process.env.SITE_BASE || '/';
const base = '/' + rawBase.replace(/^\/+|\/+$/g, '') + '/';

export default defineConfig({
  base: base === '//' ? '/' : base,
  plugins: [react(), contentPlugin()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { sourcemap: false },
});
