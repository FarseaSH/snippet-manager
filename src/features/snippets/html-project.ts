import { parse as parseModules } from 'es-module-lexer/js';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

export interface PreviewFile { id: string; title: string; language: string; code: string }
export interface PreviewResource { code: string; mime: string; kind: 'css' | 'js' | 'asset' }
export interface HtmlProject { html: string; base: string; resources: Record<string, PreviewResource> }
export const previewOrigin = 'https://snippet-preview.invalid/';
const external = (url: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url);

export function resolvePreviewPath(reference: string, importer: string): { path: string; suffix: string } {
  const at = reference.search(/[?#]/);
  const pathname = at < 0 ? reference : reference.slice(0, at);
  const suffix = at < 0 ? '' : reference.slice(at);
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { throw new Error(`资源路径编码无效：${reference}`); }
  if (decoded.includes('\\') || /[\u0000-\u001f]/.test(decoded)) throw new Error(`资源路径无效：${reference}`);
  const parts = pathname.startsWith('/') ? [] : importer.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error(`资源路径超出当前片段组：${reference}`);
      parts.pop();
    } else parts.push(part);
  }
  if (!parts.length) throw new Error(`资源路径没有文件名：${reference}`);
  return { path: parts.join('/'), suffix };
}

const virtualUrl = (path: string) => previewOrigin + path.split('/').map(encodeURIComponent).join('/');
function kindOf(file: PreviewFile): PreviewResource['kind'] {
  const language = file.language.trim().toLowerCase();
  if (language === 'css') return 'css';
  if (['js', 'javascript', 'mjs', 'cjs'].includes(language)) return 'js';
  return 'asset';
}
function mimeOf(file: PreviewFile) {
  if (kindOf(file) === 'css') return 'text/css';
  if (kindOf(file) === 'js') return 'text/javascript';
  if (/\.svg$/i.test(file.title)) return 'image/svg+xml';
  if (/\.json$/i.test(file.title)) return 'application/json';
  return 'text/plain';
}

export async function createProjectCompiler(files: PreviewFile[]) {
  const byPath = new Map<string, PreviewFile[]>();
  for (const file of files) {
    // Descriptive titles remain valid; only referenced files need a filename.
    let path: string;
    try { path = resolvePreviewPath(file.title, '').path; } catch { continue; }
    byPath.set(path, [...(byPath.get(path) ?? []), file]);
  }
  const resources: HtmlProject['resources'] = {};
  const cssStack = new Set<string>();
  async function reference(url: string, importer: string, expected?: 'css' | 'js'): Promise<string> {
    if (!url || external(url)) return url;
    const { path, suffix } = resolvePreviewPath(url, importer);
    const matches = byPath.get(path) ?? [];
    if (matches.length !== 1) throw new Error(matches.length ? `文件名重复：${path}` : `找不到同组文件：${path}（引用自 ${importer}）`);
    const file = matches[0];
    const kind = kindOf(file);
    if (expected && kind !== expected) throw new Error(`${path} 需要使用 ${expected === 'css' ? 'css' : 'javascript'} 代码块`);
    const hashAt = suffix.indexOf('#');
    const query = hashAt < 0 ? suffix : suffix.slice(0, hashAt);
    const fragment = hashAt < 0 ? '' : suffix.slice(hashAt);
    const id = virtualUrl(path) + query;
    if (cssStack.has(id)) throw new Error(`CSS 存在循环引用：${path}`);
    if (!resources[id]) {
      resources[id] = { kind, mime: mimeOf(file), code: file.code };
      if (kind === 'css') {
        cssStack.add(id);
        resources[id].code = await css(file.code, path);
        cssStack.delete(id);
      } else if (kind === 'js') resources[id].code = await javascript(file.code, path);
    }
    // Module identity includes fragments; register an exact import-map entry too.
    if (kind === 'js' && fragment) resources[id + fragment] = resources[id];
    return id + fragment;
  }
  async function javascript(code: string, importer: string): Promise<string> {
    const [imports] = parseModules(code, importer);
    const changes: { from: number; to: number; text: string }[] = [];
    for (const item of imports) {
      if (item.d === -2) continue; // import.meta is not an import specifier.
      if (item.n === undefined) throw new Error(`${importer}：动态 import 请使用固定字符串路径`);
      // Bare imports can be resolved by a standard import map in the HTML.
      if (external(item.n) || !/^(?:\.{1,2}\/|\/)/.test(item.n)) continue;
      const target = await reference(item.n, importer);
      changes.push({ from: item.d >= 0 ? item.s : item.s - 1, to: item.d >= 0 ? item.e : item.e + 1, text: JSON.stringify(target) });
    }
    for (const change of changes.sort((a, b) => b.from - a.from)) code = code.slice(0, change.from) + change.text + code.slice(change.to);
    return code;
  }
  async function css(code: string, importer: string): Promise<string> {
    const root = postcss.parse(code, { from: importer });
    const work: (() => Promise<void>)[] = [];
    root.walkAtRules('import', rule => {
      const value = valueParser(rule.params);
      const first = value.nodes.find(node => node.type !== 'space' && node.type !== 'comment');
      const target = first?.type === 'function' && first.value.toLowerCase() === 'url' ? first.nodes[0] : first;
      if (target && ['word', 'string'].includes(target.type)) work.push(async () => { target.value = await reference(target.value, importer, 'css'); rule.params = value.toString(); });
    });
    root.walkDecls(decl => {
      const value = valueParser(decl.value);
      const urls: (() => Promise<void>)[] = [];
      value.walk(node => {
        if (node.type === 'function' && node.value.toLowerCase() === 'url') {
          const target = node.nodes[0];
          if (target && ['word', 'string'].includes(target.type)) urls.push(async () => { target.value = await reference(target.value, importer); });
          return false;
        }
      });
      if (urls.length) work.push(async () => { for (const resolve of urls) await resolve(); decl.value = value.toString(); });
    });
    // Sequential resolution distinguishes repeated imports from real CSS cycles.
    for (const resolve of work) await resolve();
    return root.toString();
  }
  return { reference, javascript, css, resources };
}

export async function buildHtmlProject(entry: PreviewFile, files: PreviewFile[]): Promise<HtmlProject> {
  const compiler = await createProjectCompiler(files);
  const path = /\.html?$/i.test(entry.title) ? resolvePreviewPath(entry.title, '').path : 'index.html';
  if (/\.html?$/i.test(entry.title) && files.filter(file => {
    try { return resolvePreviewPath(file.title, '').path === path; } catch { return false; }
  }).length > 1) throw new Error(`文件名重复：${path}`);
  const document = new DOMParser().parseFromString(entry.code, 'text/html');
  // A supplied base must not redirect references outside this virtual project.
  document.querySelectorAll('base').forEach(base => base.remove());
  for (const element of document.querySelectorAll('script[src],link[href],img[src],source[src],video[src],audio[src],video[poster]')) {
    if (element.tagName === 'LINK' && !['stylesheet', 'preload', 'modulepreload', 'icon'].includes(element.getAttribute('rel')?.toLowerCase() ?? '')) continue;
    const expected = element.tagName === 'SCRIPT' ? 'js' : element.tagName === 'LINK' && element.getAttribute('rel')?.toLowerCase() === 'stylesheet' ? 'css' : undefined;
    for (const attribute of element.tagName === 'LINK' ? ['href'] : ['src', 'poster']) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, await compiler.reference(element.getAttribute(attribute)!, path, attribute === 'poster' ? undefined : expected));
    }
  }
  for (const style of document.querySelectorAll('style')) style.textContent = await compiler.css(style.textContent ?? '', path);
  for (const element of document.querySelectorAll<HTMLElement>('[style]')) {
    const wrapped = await compiler.css(`x{${element.getAttribute('style')}}`, path);
    element.setAttribute('style', wrapped.slice(wrapped.indexOf('{') + 1, wrapped.lastIndexOf('}')));
  }
  for (const script of document.querySelectorAll('script:not([src])')) {
    if (script.getAttribute('type')?.toLowerCase() === 'module') script.textContent = await compiler.javascript(script.textContent ?? '', path);
    else if (script.getAttribute('type')?.toLowerCase() === 'importmap') {
      const map = JSON.parse(script.textContent ?? '{}');
      if (Object.keys(map.scopes ?? {}).length) throw new Error('当前预览的 import map 支持精确映射，暂不支持 scopes');
      for (const values of [map.imports, ...Object.values(map.scopes ?? {})] as Record<string, string>[]) {
        for (const key of Object.keys(values ?? {})) {
          if (key.endsWith('/')) throw new Error('当前预览的 import map 暂不支持目录前缀映射');
          values[key] = await compiler.reference(values[key], path);
        }
      }
      script.textContent = JSON.stringify(map).replace(/</g, '\\u003c');
    }
  }
  return { html: '<!doctype html>\n' + document.documentElement.outerHTML, base: virtualUrl(path), resources: compiler.resources };
}
