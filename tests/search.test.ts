import { describe, expect, it } from 'vitest';
import { searchSnippets } from '../src/core/search';
import { belongsTo } from '../src/core/paths';
import type { SearchEntry } from '../src/core/types';

const entries: SearchEntry[] = [
  { path: 'linux/proxy.md', name: 'SSH Proxy', tags: ['network'], folder: 'Linux', description: '动态代理', parts: [{ id: 'block-1', title: 'Connect', description: '', code: 'ssh example' }, { id: 'block-2', title: 'Proxy', description: '代理设置', code: 'ssh -N -D 1080 foo.bar --force' }] },
  { path: 'git/a.md', name: 'Other', tags: ['ssh'], folder: 'Git', description: 'proxy instructions', parts: [] },
  { path: 'a.md', name: 'Plain', tags: [], folder: '', description: 'ssh alone', parts: [] },
];
describe('全库搜索', () => {
  it('多词 AND 可以跨字段命中，忽略大小写，Snippet 去重', () => {
    const results = searchSnippets(entries, 'SSH proxy');
    expect(results.map(item => item.path)).toEqual(['linux/proxy.md', 'git/a.md']);
    expect(new Set(results.map(item => item.path)).size).toBe(results.length);
  });
  it('代码符号保留，结果带相关 Tab 和摘要', () => {
    const [match] = searchSnippets(entries, '--force foo.bar');
    expect(match.path).toBe('linux/proxy.md');
    expect(match.tabId).toBe('block-2');
    expect(match.excerpt).toContain('--force');
  });
  it('中文连续匹配与空搜索', () => {
    expect(searchSnippets(entries, '代理设置')[0].tabId).toBe('block-2');
    expect(searchSnippets(entries, '不存在')).toEqual([]);
    expect(searchSnippets(entries, '  ')).toEqual([]);
  });
  it('递归 Folder 范围不会混入同名前缀目录', () => {
    expect(belongsTo('python/files/json/a.md', 'python')).toBe(true);
    expect(belongsTo('python-other/a.md', 'python')).toBe(false);
    expect(belongsTo('root.md', '')).toBe(true);
  });
});
