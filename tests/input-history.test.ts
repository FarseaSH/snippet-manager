import { describe, expect, it } from 'vitest';
import { parameterHistoryGroups } from '../src/core/input-history';
import type { SubSnippet } from '../src/core/types';

const part = (id: string, title: string, code: string, language = 'text'): SubSnippet => ({ id, title, code, language, sourceOrder: 0, sourceDescription: '', descriptionHtml: '', codeHtml: '' });

describe('输入历史的 Tab 识别', () => {
  it('唯一命名 Tab 重排、修改默认值和约束后仍恢复同一字段，删除及新增字段按当前模板识别', () => {
    const before = parameterHistoryGroups([part('block-1', 'One', '@name:text[旧提示]:demo@ @removed@'), part('block-2', 'Two', '@name::other@')]);
    const after = parameterHistoryGroups([part('block-1', 'Two', '@name::other@'), part('block-2', 'One', '@name:number/^[0-9]+$/[新提示]:1@ @new@')]);
    expect(before.get('block-1')!.key).toBe(after.get('block-2')!.key);
    expect(before.get('block-2')!.key).toBe(after.get('block-1')!.key);
    expect(after.get('block-2')!.fields).toEqual(['name', 'new']);
  });
  it('未命名及重名 Tab 按模板区分，插入代码块不会串值，模板改变则不恢复', () => {
    const before = parameterHistoryGroups([part('block-1', 'Untitled', '@x::one@'), part('block-2', 'Untitled 2', '@x::two@')]);
    const after = parameterHistoryGroups([part('block-1', 'Untitled', '@x::new@'), part('block-2', 'Untitled 2', '@x::one@'), part('block-3', 'Untitled 3', '@x::two@')]);
    expect(before.get('block-1')!.key).toBe(after.get('block-2')!.key);
    expect(before.get('block-2')!.key).toBe(after.get('block-3')!.key);
    expect(before.get('block-1')!.key).not.toBe(after.get('block-1')!.key);
    const duplicates = parameterHistoryGroups([part('a', 'Same', '@x::a@'), part('b', 'Same', '@x::b@')]);
    expect(duplicates.get('a')!.key).not.toBe(duplicates.get('b')!.key);
    expect([...duplicates.values()].every(group => group.persistent)).toBe(true);
  });
  it('完全相同的重名模板无法确认归属，只保留独立的本次页面状态', () => {
    const groups = parameterHistoryGroups([part('a', 'Same', '@x@'), part('b', 'Same', '@x@')]);
    expect([...groups.values()].every(group => !group.persistent)).toBe(true);
    expect(groups.get('a')!.key).not.toBe(groups.get('b')!.key);
  });
});
