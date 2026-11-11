import { describe, expect, it } from 'vitest';
import { parseSnippet } from '../scripts/content/parse';
import { interpretTransformResult } from '../src/core/transform';
import type { Diagnostic } from '../src/core/types';
import tomorrowTheme from '../src/core/tomorrow.json' with { type: 'json' };
import { highlightedCode, renderMarkdownPreview } from '../src/core/code-rendering';

const originalTheme = structuredClone(tomorrowTheme);

const front = '---\nsnippet_name: Transform\nsnippet_tags: [转换]\nsnippet_type: transform\n';
const code = 'export default function transform(input) { return { ok: true, output: input }; }';
const snippet = (config = '', body = '# 转换代码\n\n```js\n' + code + '\n```') => front + config + '---\n\n' + body;

describe('转换 Snippet 格式', () => {
  it('生成单一源码与配置，保留原文，不执行函数或替换代码占位符', async () => {
    const raw = snippet('transform:\n  input_language: json\n  output_language: json\n  example: "{\\"x\\":1}"\n', '在 `:@转换` 中运行，或查看 `:@转换代码`。\n\n# 转换代码\n\n```javascript\nthrow new Error("must not execute @x@");\n' + code + '\n```');
    const diagnostics: Diagnostic[] = [];
    const result = await parseSnippet(raw, 'tools/json.md', diagnostics);
    expect(result.type).toBe('transform');
    expect(result.transform).toEqual({ inputLanguage: 'json', outputLanguage: 'json', example: '{"x":1}' });
    expect(result.subSnippets).toHaveLength(1);
    expect(result.subSnippets[0]).toMatchObject({ id: 'transform-code', title: '转换代码', language: 'javascript' });
    expect(result.subSnippets[0].code).toContain('throw new Error');
    expect(result.subSnippets[0].code).toContain('@x@');
    expect(result.descriptionHtml).toContain('data-tab-id="transform"');
    expect(result.descriptionHtml).toContain('data-tab-id="transform-code"');
    expect(result.raw).toBe(raw);
    expect(diagnostics).toEqual([]);
  });
  it('可省略转换配置，未知高亮语言仍按文本展示', async () => {
    expect((await parseSnippet(snippet(), 'a.md')).transform).toEqual({ inputLanguage: 'text', outputLanguage: 'text' });
    expect((await parseSnippet(snippet('transform:\n  input_language: custom\n'), 'a.md')).transform?.inputLanguage).toBe('custom');
  });
  it('兼容未声明类型和显式 code 类型的普通片段', async () => {
    const ordinary = '---\nsnippet_name: Code\nsnippet_tags: []\n---\n\n```text\nhello\n```';
    for (const raw of [ordinary, ordinary.replace('snippet_tags: []', 'snippet_tags: []\nsnippet_type: code')]) {
      const result = await parseSnippet(raw, 'a.md');
      expect(result.transform).toBeUndefined();
      expect(result.subSnippets[0].code).toBe('hello');
    }
  });
  it('拒绝错误类型、配置、多个代码块和非 JS 代码块', async () => {
    for (const raw of [snippet().replace('snippet_type: transform', 'snippet_type: other'), snippet().replace('snippet_type: transform', 'snippet_type: null'), snippet('transform: null\n'), snippet('transform: []\n'), snippet('transform:\n  example: 42\n'), snippet('', '```python\nprint(1)\n```'), snippet('', '没有代码'), snippet('', '```js\n' + code + '\n```\n\n```js\n' + code + '\n```')]) await expect(parseSnippet(raw, 'bad.md')).rejects.toThrow();
  });
});

describe('转换函数返回约定', () => {
  it('动态输出高亮不修改供桌面编辑器使用的共享主题', async () => {
    await highlightedCode('{"result":true}', 'json');
    await renderMarkdownPreview('```js\nconsole.log("hello")\n```');
    expect(tomorrowTheme).toEqual(originalTheme);
  });
  it('接受纯文本结果，包括空字符串和类似 HTML 的文本', () => {
    for (const output of ['', 'hello', '<script>alert(1)</script>']) expect(interpretTransformResult({ ok: true, output })).toEqual({ status: 'success', output });
  });
  it('区分输入校验失败与非法返回值', () => {
    expect(interpretTransformResult({ ok: false, error: { message: '无效输入' } })).toEqual({ status: 'invalid', message: '无效输入' });
    for (const value of [null, 12, 'text', { ok: true, output: 1 }, { ok: false, error: 'bad' }, { ok: false, error: { message: '' } }]) expect(interpretTransformResult(value).status).toBe('error');
  });
});
