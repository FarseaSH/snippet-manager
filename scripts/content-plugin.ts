import path from 'node:path';
import fs from 'node:fs/promises';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { generateSW } from 'workbox-build';
import { readLibrary, type ContentBuild } from './content/library.ts';
import { folderPath, pagePath } from '../src/core/paths.ts';

const mime = (name: string) => ({ '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' }[path.extname(name)] ?? 'application/octet-stream');
const manifest = (base: string) => JSON.stringify({ id: base, name: 'Snippet Manager', short_name: 'Snippets', description: '查找、阅读、复制你的代码片段，支持离线使用。', lang: 'zh-CN', start_url: base, scope: base, display: 'standalone', theme_color: '#253031', background_color: '#ffffff', icons: [{ src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: `${base}icons/icon-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }, null, 2);

export function contentPlugin(): Plugin {
  let config: ResolvedConfig;
  let content: ContentBuild;
  let server: ViteDevServer;
  let processing: Promise<void> | undefined;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const log = () => {
    for (const diagnostic of content.diagnostics) config.logger.warn(`[content ${diagnostic.level}] ${diagnostic.path}: ${diagnostic.message}`);
    config.logger.info(`[content] ${content.library.snippets.length} 个有效片段，${content.diagnostics.filter(item => item.level === 'error').length} 个文件已跳过`);
  };
  async function refresh() {
    if (processing) return processing;
    processing = (async () => {
      let processed;
      do {
        processed = revision;
        content = await readLibrary(path.join(config.root, 'snippets'), config.base);
      } while (processed !== revision);
      log();
    })().finally(() => { processing = undefined; });
    return processing;
  }
  return {
    name: 'snippet-content',
    configResolved(resolved) { config = resolved; },
    async configureServer(devServer) {
      server = devServer;
      await refresh();
      const contentRoot = path.join(config.root, 'snippets');
      server.watcher.add(contentRoot);
      const onChange = (file: string) => {
        if (file !== contentRoot && !file.startsWith(contentRoot + path.sep)) return;
        revision++;
        clearTimeout(timer);
        timer = setTimeout(() => {
          refresh().then(() => server.ws.send({ type: 'custom', event: 'content:updated', data: { version: content.library.version } })).catch(error => config.logger.error(String(error)));
        }, 100);
      };
      for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir']) server.watcher.on(event, onChange);
      server.httpServer?.on('close', () => {
        clearTimeout(timer);
        for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir']) server.watcher.off(event, onChange);
      });
      server.middlewares.use(async (req, res, next) => {
        let pathname;
        try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); } catch { res.statusCode = 400; res.end('Invalid URL'); return; }
        if (!pathname.startsWith(config.base)) return next();
        const relative = pathname.slice(config.base.length);
        if (relative === 'manifest.webmanifest') { res.setHeader('Content-Type', 'application/manifest+json'); res.end(manifest(config.base)); return; }
        const allowed = ['__content/library.json', '__content/search.json', '__content/diagnostics.json', 'version.json'];
        if (!allowed.includes(relative) && !relative.startsWith('raw/') && !relative.startsWith('content-assets/')) return next();
        try {
          if (processing) await processing;
          res.setHeader('Cache-Control', 'no-store');
          if (allowed.includes(relative)) {
            const data = relative === '__content/library.json' ? content.library : relative === '__content/search.json' ? content.search : relative === '__content/diagnostics.json' ? content.diagnostics : { version: content.library.version, library: '__content/library.json', search: '__content/search.json' };
            res.setHeader('Content-Type', mime('data.json')); res.end(JSON.stringify(data)); return;
          }
          if (relative.startsWith('raw/')) {
            const snippet = content.library.snippets.find(item => item.path === relative.slice(4));
            if (snippet) { res.setHeader('Content-Type', mime('.md')); res.end(snippet.raw); return; }
          } else {
            const asset = content.assets.get(relative);
            if (asset) { res.setHeader('Content-Type', mime(relative)); res.end(asset); return; }
          }
          res.statusCode = 404; res.end('Not found');
        } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); }
      });
    },
    configurePreviewServer(previewServer) {
      previewServer.middlewares.use(async (req, res, next) => {
        try {
          const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
          const relative = pathname.startsWith(config.base) ? pathname.slice(config.base.length) : '';
          if (/^(raw|data|content-assets|assets)\//.test(relative)) {
            const absolute = path.resolve(config.root, config.build.outDir, relative);
            const out = path.resolve(config.root, config.build.outDir) + path.sep;
            if (!absolute.startsWith(out)) { res.statusCode = 404; res.end('Not found'); return; }
            try { await fs.access(absolute); } catch { res.statusCode = 404; res.end('Not found'); return; }
          }
          next();
        } catch { res.statusCode = 400; res.end('Invalid URL'); }
      });
    },
    async buildStart() {
      if (config.command !== 'build') return;
      await refresh();
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest(config.base) });
      this.emitFile({ type: 'asset', fileName: `data/${content.library.version}/library.json`, source: JSON.stringify(content.library) });
      this.emitFile({ type: 'asset', fileName: `data/${content.library.version}/search.json`, source: JSON.stringify(content.search) });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: content.library.version, library: `data/${content.library.version}/library.json`, search: `data/${content.library.version}/search.json` }) });
      for (const snippet of content.library.snippets) this.emitFile({ type: 'asset', fileName: `raw/${snippet.path}`, source: snippet.raw });
      for (const [fileName, bytes] of content.assets) this.emitFile({ type: 'asset', fileName, source: bytes });
    },
    async closeBundle() {
      if (config.command !== 'build' || !content) return;
      const out = path.resolve(config.root, config.build.outDir);
      const shell = await fs.readFile(path.join(out, 'index.html'));
      const routes = content.library.snippets.map(snippet => pagePath(snippet.path));
      const visit = (folder: ContentBuild['library']['folders']) => { routes.push(folderPath(folder.path)); folder.children.forEach(visit); };
      visit(content.library.folders);
      for (const route of routes) {
        const destination = path.join(out, decodeURIComponent(route), 'index.html');
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, shell);
      }
      await fs.writeFile(path.join(out, '404.html'), '<!doctype html><meta charset="utf-8"><title>Not found</title><h1>404 · 文件不存在</h1>');
      const base = config.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const result = await generateSW({
        globDirectory: out, globPatterns: ['**/*'],
        globIgnores: ['sw.js', 'workbox-*.js', '404.html'], swDest: path.join(out, 'sw.js'),
        maximumFileSizeToCacheInBytes: Number.MAX_SAFE_INTEGER,
        modifyURLPrefix: { '': config.base }, navigateFallback: `${config.base}index.html`,
        navigateFallbackAllowlist: [new RegExp(`^${base}(?:$|(?:snippet|folder)(?:/|$))`)],
        clientsClaim: true, skipWaiting: false, cleanupOutdatedCaches: true, mode: 'production',
      });
      result.warnings.forEach(warning => config.logger.warn(warning));
      config.logger.info(`[pwa] ${result.count} 个资源进入完整离线版本`);
    },
  };
}
