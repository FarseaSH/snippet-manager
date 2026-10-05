import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { parseSnippet, validateMetadata } from './parse.ts';
import { pagePath, compareNames } from '../../src/core/paths.ts';
import { getLanguageIcon } from '../../src/core/language-icons.ts';
import type { Diagnostic, Folder, Library, SearchEntry, Snippet } from '../../src/core/types.ts';

export interface ContentBuild { library: Library; search: SearchEntry[]; diagnostics: Diagnostic[]; assets: Map<string, Buffer> }
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex').slice(0, 16);

export async function readLibrary(root: string, base = '/'): Promise<ContentBuild> {
  const diagnostics: Diagnostic[] = [];
  const files = new Map<string, Buffer>();
  const directories = [''];
  async function scan(relative: string) {
    let entries;
    try { entries = await fs.readdir(path.join(root, relative), { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !relative) return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { directories.push(child); await scan(child); }
      else if (entry.isFile()) {
        try { files.set(child, await fs.readFile(path.join(root, child))); }
        catch (error) { diagnostics.push({ level: 'error', path: child, message: `无法读取文件：${(error as Error).message}` }); }
      }
    }
  }
  await scan('');
  const snippets: Snippet[] = [];
  const validPaths = new Set<string>();
  for (const [file, bytes] of files) {
    if (!/\.md$/i.test(file)) continue;
    try {
      validateMetadata(bytes.toString('utf8'));
      validPaths.add(file);
    } catch (error) { diagnostics.push({ level: 'error', path: file, message: (error as Error).message }); }
  }
  const assets = new Map<string, Buffer>();
  const snippetLinks: { file: string; target: string; url: string }[] = [];
  const seenWarnings = new Set<string>();
  const warn = (file: string, message: string) => {
    const key = `${file}:${message}`;
    if (!seenWarnings.has(key)) { seenWarnings.add(key); diagnostics.push({ level: 'warning', path: file, message }); }
  };
  for (const file of validPaths) {
    const resolve = (url: string, kind: 'link' | 'image') => {
      if (!url || /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('#')) return url;
      const suffixAt = url.search(/[?#]/);
      const pathname = suffixAt < 0 ? url : url.slice(0, suffixAt);
      const suffix = suffixAt < 0 ? '' : url.slice(suffixAt);
      let decoded;
      try { decoded = decodeURIComponent(pathname); } catch { warn(file, `链接编码无效：${url}`); return url; }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), decoded));
      if (target === '..' || target.startsWith('../')) { warn(file, `本地目标超出 snippets/：${url}`); return url; }
      if (kind === 'link' && /\.md$/i.test(target)) {
        snippetLinks.push({ file, target, url });
        return base + pagePath(target).slice(1) + suffix;
      }
      const bytes = files.get(target);
      if (!bytes) { warn(file, `本地资源不存在：${url}`); return url; }
      const destination = `content-assets/${hash(bytes)}${path.posix.extname(target).toLowerCase()}`;
      assets.set(destination, bytes);
      return base + destination + suffix;
    };
    try { snippets.push(await parseSnippet(files.get(file)!.toString('utf8'), file, diagnostics, resolve)); }
    catch (error) { diagnostics.push({ level: 'error', path: file, message: (error as Error).message }); }
  }
  const actualPaths = new Set(snippets.map(snippet => snippet.path));
  for (const { file, target, url } of snippetLinks) if (!actualPaths.has(target)) warn(file, `Snippet 链接目标不存在或已跳过：${url}`);
  snippets.sort(compareNames);
  const folderMap = new Map<string, Folder>(directories.map(directory => [directory, { path: directory, name: directory ? path.posix.basename(directory) : '全部片段', children: [], snippets: [], count: 0 }]));
  for (const [directory, folder] of folderMap) if (directory) folderMap.get(path.posix.dirname(directory) === '.' ? '' : path.posix.dirname(directory))!.children.push(folder);
  for (const snippet of snippets) folderMap.get(snippet.folder)!.snippets.push(snippet.path);
  let config: unknown[] = [];
  const folderIcons = new Map<string, string>();
  if (files.has('_folders.yml')) {
    try {
      const value = parseYaml(files.get('_folders.yml')!.toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置必须是对象');
      if (value.folders !== undefined) {
        if (Array.isArray(value.folders)) config = value.folders;
        else warn('_folders.yml', 'folders 必须是数组，回退名称排序');
      }
    } catch (error) { warn('_folders.yml', `配置无效，回退名称排序：${(error as Error).message.split('\n')[0]}`); }
  }
  function sort(folder: Folder, rules: unknown[]) {
    const priority = new Map<string, number>();
    const childRules = new Map<string, unknown[]>();
    for (const rule of rules) {
      const entries: [string, unknown][] = typeof rule === 'string' ? [[rule, []]] : rule && typeof rule === 'object' && !Array.isArray(rule) ? Object.entries(rule) : [];
      if (!entries.length) warn('_folders.yml', `忽略无效排序项：${JSON.stringify(rule)}`);
      for (const [label, children] of entries) {
        const match = /^(.*)\[([^\[\]]*)\]$/.exec(label);
        const name = match ? match[1] : label;
        const child = folder.children.find(child => path.posix.basename(child.path) === name);
        if (!child) { warn('_folders.yml', `目录不存在：${folder.path ? folder.path + '/' : ''}${name}`); continue; }
        if (match) {
          const icon = match[2].trim().toLowerCase();
          if (getLanguageIcon(icon)) folderIcons.set(child.path, icon);
          else warn('_folders.yml', `目录 ${child.path} 的图标标记无效：${JSON.stringify(match[2])}`);
        }
        if (!priority.has(name)) priority.set(name, priority.size);
        if (Array.isArray(children)) childRules.set(name, children);
        else if (children === null) childRules.set(name, []);
        else warn('_folders.yml', `${name} 的子目录排序必须是数组`);
      }
    }
    folder.children.sort((a, b) => (priority.get(path.posix.basename(a.path)) ?? Infinity) - (priority.get(path.posix.basename(b.path)) ?? Infinity) || a.name.localeCompare(b.name, 'zh-CN'));
    for (const child of folder.children) sort(child, childRules.get(path.posix.basename(child.path)) ?? []);
    folder.count = folder.snippets.length + folder.children.reduce((total, child) => total + child.count, 0);
  }
  sort(folderMap.get('')!, config);
  function assignIcons(folder: Folder, inherited?: string) {
    const icon = folderIcons.get(folder.path) ?? inherited;
    if (icon) folder.icon = icon;
    folder.children.forEach(child => assignIcons(child, icon));
  }
  assignIcons(folderMap.get('')!);
  const library: Library = { version: '', folders: folderMap.get('')!, snippets };
  library.version = hash(JSON.stringify(library) + [...assets.keys()].join(','));
  const search: SearchEntry[] = snippets.map(snippet => ({ path: snippet.path, name: snippet.name, tags: snippet.tags, folder: snippet.folder.split('/').join(' / '), description: snippet.descriptionText, parts: snippet.subSnippets.map(sub => ({ id: sub.id, title: sub.title, description: sub.sourceDescription, code: sub.code })) }));
  return { library, search, diagnostics, assets };
}
