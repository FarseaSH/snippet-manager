export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function pagePath(path: string): string {
  return `/snippet/${encodePath(path.replace(/\.md$/i, ''))}`;
}

export function folderPath(path: string): string {
  return path ? `/folder/${encodePath(path)}` : '/folder';
}

export function folderLabel(path: string): string {
  return path ? path.split('/').join(' / ') : '内容库根目录';
}

export function belongsTo(path: string, folder: string): boolean {
  return !folder || path.startsWith(`${folder}/`);
}

export function compareNames(a: { name: string; path: string }, b: { name: string; path: string }): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'zh-CN') || a.path.localeCompare(b.path);
}
