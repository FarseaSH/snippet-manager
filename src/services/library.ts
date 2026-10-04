import type { Library, SearchEntry, VersionManifest } from '../core/types';

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: import.meta.env.DEV ? 'no-store' : 'default' });
  if (!response.ok) throw new Error(`加载失败 (${response.status})`);
  return response.json();
}

export async function loadLibrary(signal?: AbortSignal): Promise<{ library: Library; search: SearchEntry[] }> {
  const base = import.meta.env.BASE_URL;
  const manifest = await readJson<VersionManifest>(`${base}version.json`, signal);
  const [library, search] = await Promise.all([
    readJson<Library>(base + manifest.library, signal), readJson<SearchEntry[]>(base + manifest.search, signal),
  ]);
  if (library.version !== manifest.version) throw new Error('内容版本正在更新，请重试');
  return { library, search };
}
