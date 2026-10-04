export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function pagePath(path: string): string {
  return `/snippet/${encodePath(path.replace(/\.md$/i, ''))}`;
}

export function folderPath(path: string): string {
  return path ? `/folder/${encodePath(path)}` : '/folder';
}

export function titleCase(name: string): string {
  const acronyms: Record<string, string> = { http: 'HTTP', json: 'JSON', csv: 'CSV', ssh: 'SSH', api: 'API', sql: 'SQL', css: 'CSS' };
  return name.split(/[-_]/).map(part => acronyms[part.toLowerCase()] ?? (part.charAt(0).toUpperCase() + part.slice(1))).join(' ');
}

export function folderLabel(path: string): string {
  return path ? path.split('/').map(titleCase).join(' / ') : '内容库根目录';
}

export function belongsTo(path: string, folder: string): boolean {
  return !folder || path.startsWith(`${folder}/`);
}

export function compareNames(a: { name: string; path: string }, b: { name: string; path: string }): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'zh-CN') || a.path.localeCompare(b.path);
}
