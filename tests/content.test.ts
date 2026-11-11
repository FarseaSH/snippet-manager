import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSnippet } from '../scripts/content/parse';
import { readLibrary } from '../scripts/content/library';
import { folderLabel } from '../src/core/paths';
import type { Diagnostic } from '../src/core/types';

const front = '---\nsnippet_name: Example\nsnippet_tags: []\n---\n\n';
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))); });
async function fixture(files: Record<string, string>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'snippet-test-'));
  directories.push(directory);
  for (const [file, body] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true }); await fs.writeFile(path.join(directory, file), body); }
  return directory;
}

describe('Markdown 产品规则', () => {
  it.each(['markdown', 'md', 'MD'])('为 %s 代码块生成安全预览，保留可复制代码原文', async language => {
    const code = '# Preview\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] Done\n\n> ```python\n> def hello():\n>     return "<safe>"\n> ```\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))';
    const result = await parseSnippet(front + '````' + language + '\n' + code + '\n````', 'preview.md');
    const sub = result.subSnippets[0];
    expect(sub.code).toBe(code);
    expect(sub.markdownPreview?.html).toContain('<h1>Preview</h1>');
    expect(sub.markdownPreview?.html).toContain('<table>');
    expect(sub.markdownPreview?.html).toContain('type="checkbox"');
    expect(sub.markdownPreview?.html).toContain('data-preview-copy="0"');
    expect(sub.markdownPreview?.html).toContain('data-language-icon="python" fill="#3776AB"');
    expect(sub.markdownPreview?.html).toContain('color:#8959A8');
    expect(sub.markdownPreview?.html).not.toContain('<script>');
    expect(sub.markdownPreview?.html).not.toContain('href="javascript:');
    expect(sub.markdownPreview?.codeBlocks).toEqual([{ code: 'def hello():\n    return "<safe>"', language: 'python' }]);
  });

  it('预览代码块显示语言和包含空行的行号，未知语言与无标记代码可阅读', async () => {
    const code = '```custom-lang\none\n\nthree\n```\n\n```\nplain\n```';
    const result = await parseSnippet(front + '````md\n' + code + '\n````', 'lines.md');
    const preview = result.subSnippets[0].markdownPreview!;
    expect(preview.html).toContain('class="preview-code-language">custom-lang</span>');
    expect(preview.html).toContain('class="preview-code-language">Plain Text</span>');
    expect(preview.html.match(/data-language-icon="fallback"/g)).toHaveLength(2);
    expect(preview.html).toContain('class="preview-line-numbers" aria-hidden="true"><span>1</span><span>2</span><span>3</span>');
    expect(preview.codeBlocks).toEqual([{ code: 'one\n\nthree', language: 'custom-lang' }, { code: 'plain', language: 'text' }]);
  });

  it('Tab 引用 Logo 跟随目标代码语言，支持别名与默认图标', async () => {
    const result = await parseSnippet(front + '`:@JavaScript`、`:@Python`、`:@Unknown`。\n\n# JavaScript\n\n```py\nprint(1)\n```\n\n# Python\n\n```js\nconsole.log(2)\n```\n\n# Unknown\n\n```custom\nthree\n```', 'logos.md');
    expect(result.descriptionHtml.match(/data-language-icon="([^"]+)"/g)).toEqual([
      'data-language-icon="python"', 'data-language-icon="javascript"', 'data-language-icon="fallback"',
    ]);
    expect(result.descriptionHtml).toContain('<span class="tab-reference-icon"');
  });
  it('总说明与子片段说明分别输出，不再自动生成子片段汇总', async () => {
    const raw = front + '主说明。\n\n# First\n\n简短说明。\n\n```text\none\n```\n\n# Second\n\n- 原有列表项\n\n```text\ntwo\n```';
    const result = await parseSnippet(raw, 'summary.md');
    expect(result.descriptionHtml).toBe('<p>主说明。</p>');
    expect(result.subSnippets[0].descriptionHtml).toBe('<p>简短说明。</p>');
    expect(result.subSnippets[1].descriptionHtml).toContain('<li>原有列表项</li>');
    expect(result.raw).toBe(raw);
  });
  it('列表说明保留全文供两行截断，并排除顶层和嵌套代码块', async () => {
    const description = '这一段是较长的说明内容。'.repeat(25);
    const result = await parseSnippet(front + description + '\n\n> ```js\n> hiddenNestedCode()\n> ```\n\n```js\nhiddenMainCode()\n```', 'preview.md');
    expect(result.summary).toBe(description);
    expect(result.descriptionHtml).toContain('hiddenNestedCode()');
    expect(result.subSnippets[0].code).toBe('hiddenMainCode()');
  });
  it('单个代码块保留前后子说明，不生成摘要列表', async () => {
    const result = await parseSnippet(front + '# SSH\n\n登录之前。\n\n```bash\nssh user@example.com\n```\n\n登录之后。', 'ssh.md');
    expect(result.subSnippets).toHaveLength(1);
    expect(result.subSnippets[0].title).toBe('SSH');
    expect(result.subSnippets[0].sourceDescription).toContain('登录之后');
    expect(result.descriptionHtml).toBe('');
    expect(result.subSnippets[0].descriptionHtml).toContain('登录之前');
    expect(result.subSnippets[0].descriptionHtml).toContain('登录之后');
  });
  it('标题只命名下一代码块；中间文字归前一个，第二块为 Untitled', async () => {
    const result = await parseSnippet(front + '# Named\n\n```js\nconst a = 1\n```\n\n第一段补充。\n\n```js\nconst b = 2\n```\n\n第二段补充。', 'two.md');
    expect(result.subSnippets.map(sub => sub.title)).toEqual(['Named', 'Untitled']);
    expect(result.subSnippets[0].sourceDescription).toBe('第一段补充。');
    expect(result.subSnippets[1].sourceDescription).toBe('第二段补充。');
    expect(result.subSnippets[0].descriptionHtml).toContain('第一段补充');
    expect(result.subSnippets[0].descriptionHtml).not.toContain('第二段补充');
    expect(result.subSnippets[1].descriptionHtml).toContain('第二段补充');
  });
  it('连续标题保留无代码标题，不跨标题命名；不会丢弃正文', async () => {
    const diagnostics: Diagnostic[] = [];
    const result = await parseSnippet(front + '# 前提\n\n配置密钥。\n\n# 登录\n\n```bash\nssh example.com\n```', 'ssh.md', diagnostics);
    expect(result.subSnippets[0].title).toBe('登录');
    expect(result.descriptionHtml).toContain('前提');
    expect(result.descriptionHtml).toContain('配置密钥');
    expect(diagnostics).toHaveLength(1);
  });
  it('没有代码块时正文完整保留，不报错或警告', async () => {
    const diagnostics: Diagnostic[] = [];
    const result = await parseSnippet(front + '# 说明\n\n只有说明。\n\n# 更多\n\n第二部分。', 'guide.md', diagnostics);
    expect(result.subSnippets).toEqual([]);
    expect(result.descriptionHtml).toContain('<h1>说明</h1>');
    expect(result.descriptionHtml).toContain('第二部分');
    expect(diagnostics).toEqual([]);
  });
  it('嵌套和缩进代码保留在说明内，不占用 Tab 或标题关联', async () => {
    const result = await parseSnippet(front + '# 示例\n\n> ```js\n> quoted()\n> ```\n\n- 子项\n\n  ```js\n  listed()\n  ```\n\n    indented()\n\n```js\nreal()\n```', 'nested.md');
    expect(result.subSnippets).toHaveLength(1);
    expect(result.subSnippets[0].title).toBe('示例');
    expect(result.subSnippets[0].code).toBe('real()');
    expect(result.subSnippets[0].descriptionHtml).toContain('quoted()');
    expect(result.subSnippets[0].descriptionHtml).toContain('listed()');
    expect(result.subSnippets[0].descriptionHtml).toContain('indented()');
  });
  it('第一个标题前的文本全归主说明，无标题代码自动编号', async () => {
    const result = await parseSnippet(front + '开始。\n\n```custom\nx()\n```\n\n中间。\n\n~~~text\ny()\n~~~\n\n结尾。', 'unnamed.md');
    expect(result.subSnippets.map(sub => sub.title)).toEqual(['Untitled', 'Untitled 2']);
    expect(result.mainDescription).toContain('中间');
    expect(result.descriptionHtml).toContain('结尾');
    expect(result.subSnippets[0].codeHtml).toContain('x()');
  });
  it('原始 Markdown 保持 CRLF 和 Front Matter，代码缩进和空行保留', async () => {
    const raw = (front + '```python\nif True:\n    print("hello")\n\n    print("world")\n```\n').replace(/\n/g, '\r\n');
    const result = await parseSnippet(raw, 'raw.md');
    expect(result.raw).toBe(raw);
    expect(result.subSnippets[0].code).toBe('if True:\r\n    print("hello")\r\n\r\n    print("world")');
  });
  it('原始 HTML 显示为文本，危险链接不执行', async () => {
    const result = await parseSnippet(front + '<script>alert("x")</script>\n\n[bad](javascript:alert%281%29)', 'html.md');
    expect(result.descriptionHtml).toMatch(/(?:&lt;|&#x3C;)script/);
    expect(result.descriptionHtml).not.toContain('<script>');
    expect(result.descriptionHtml).not.toContain('href="javascript:');
  });
  it('分段渲染保留全文的引用式链接定义', async () => {
    const result = await parseSnippet(front + '# First\n\n看 [文档][docs]。\n\n```text\none\n```\n\n# Second\n\n```text\ntwo\n```\n\n[docs]: https://example.com', 'references.md');
    expect(result.subSnippets[0].descriptionHtml).toContain('href="https://example.com"');
    expect(result.subSnippets).toHaveLength(2);
  });
  it('主说明和子说明支持向后引用、中文及带空格的 Tab 名称，原文保持不变', async () => {
    const raw = front + '使用 `:@ 数组去重 ` 或 `:@GET Request`。\n\n# 数组去重\n\n参考 `:@GET Request`。\n\n```js\nconst a = 1\n```\n\n# GET Request\n\n```python\nprint(1)\n```';
    const diagnostics: Diagnostic[] = [];
    const result = await parseSnippet(raw, 'references.md', diagnostics);
    expect(result.descriptionHtml).toContain('data-tab-id="block-1"');
    expect(result.descriptionHtml).toContain('data-tab-id="block-2"');
    expect(result.descriptionHtml).not.toContain(':@');
    expect(result.subSnippets[0].descriptionHtml).toContain('data-tab-id="block-2"');
    expect(result.subSnippets[1].descriptionHtml).toBe('');
    expect(result.raw).toBe(raw);
    expect(result.subSnippets[0].sourceDescription).toBe('参考 `:@GET Request`。');
    expect(diagnostics).toEqual([]);
  });
  it('空引用、找不到或重名的引用保留行内代码并诊断，匹配区分大小写', async () => {
    const diagnostics: Diagnostic[] = [];
    const result = await parseSnippet(front + '`:@` `:@Missing` `:@Same` `:@same` `:@Missing`\n\n# Same\n\n```text\none\n```\n\n# Same\n\n```text\ntwo\n```', 'invalid-refs.md', diagnostics);
    expect(result.descriptionHtml).not.toContain('data-tab-id');
    expect(result.descriptionHtml).toContain('<code>:@Missing</code>');
    expect(diagnostics).toHaveLength(4);
    expect(diagnostics.every(item => item.level === 'warning' && item.path === 'invalid-refs.md')).toBe(true);
    expect(diagnostics.some(item => item.message.includes('多个同名'))).toBe(true);
  });
  it('普通文本、链接、描述中的代码块及 Markdown 预览不转换 Tab 引用', async () => {
    const diagnostics: Diagnostic[] = [];
    const result = await parseSnippet(front + ':@Target [只有链接 `:@Target`](https://example.com)\n\n> ```text\n> :@Target\n> ```\n\n# Target\n\n````md\n`:@Target`\n````', 'literal-refs.md', diagnostics);
    expect(result.descriptionHtml).not.toContain('data-tab-id');
    expect(result.descriptionHtml).toContain('<code>:@Target</code></a>');
    expect(result.descriptionHtml).toContain('<pre><code class="language-text">:@Target');
    expect(result.subSnippets[0].code).toBe('`:@Target`');
    expect(result.subSnippets[0].markdownPreview?.html).toBe('<p><code>:@Target</code></p>');
    expect(diagnostics).toEqual([]);
  });
  it('Tab 引用名称以文本安全输出，不能插入 HTML', async () => {
    const title = '<img src=x onerror=alert(1)>';
    const result = await parseSnippet(front + '`:@' + title + '`\n\n# ' + title + '\n\n```text\none\n```', 'safe-ref.md');
    expect(result.descriptionHtml).toContain('data-tab-id="block-1"');
    expect(result.descriptionHtml).not.toContain('<img');
    expect(result.descriptionHtml).toContain('&#x3C;img');
  });
  it.each(['---\nsnippet_tags: []\n---\n', '---\nsnippet_name: " "\nsnippet_tags: []\n---\n', '---\nsnippet_name: A\nsnippet_tags: wrong\n---\n', 'no front matter', '---\nsnippet_name: [\nsnippet_tags: []\n---\n'])('无效元数据由调用方跳过', async raw => {
    await expect(parseSnippet(raw, 'invalid.md')).rejects.toThrow();
  });
});

describe('文件库生成', () => {
  it('目录名称、路径标签和搜索索引保留真实大小写与连接符', async () => {
    const root = await fixture({ 'my_Python/HTTP-api/jsonData/a.md': front });
    const result = await readLibrary(root);
    const parent = result.library.folders.children[0];
    expect(parent.name).toBe('my_Python');
    expect(parent.children[0].name).toBe('HTTP-api');
    expect(parent.children[0].children[0].name).toBe('jsonData');
    expect(result.search[0].folder).toBe('my_Python / HTTP-api / jsonData');
    expect(folderLabel('my_Python/HTTP-api/jsonData')).toBe('my_Python / HTTP-api / jsonData');
  });
  it('目录名后的中括号指定图标，继承父目录并允许子目录覆盖，不影响排序与分类', async () => {
    const root = await fixture({
      '_folders.yml': 'folders:\n  - git[unknown-icon]\n  - python[ PY ]:\n      - files:\n          - json[json]\n      - http[unknown-icon]\n  - missing[python]\n',
      'python/http/a.md': front, 'python/files/read.md': front, 'python/files/json/deep/a.md': front,
      'git/json/a.md': front,
    });
    const result = await readLibrary(root);
    expect(result.library.folders.children.map(folder => folder.path)).toEqual(['git', 'python']);
    const [git, python] = result.library.folders.children;
    expect(python.icon).toBe('py');
    expect(python.children.find(folder => folder.name === 'http')?.icon).toBe('py');
    const files = python.children.find(folder => folder.name === 'files')!;
    expect(files.icon).toBe('py');
    expect(files.children[0].icon).toBe('json');
    expect(files.children[0].children[0].icon).toBe('json');
    expect(git.icon).toBeUndefined();
    expect(git.children[0].icon).toBeUndefined();
    expect(result.library.folders.count).toBe(4);
    expect(result.diagnostics.map(item => item.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('图标标记无效'), expect.stringContaining('目录不存在：missing'),
    ]));
    expect(result.diagnostics.every(item => item.level === 'warning' && item.path === '_folders.yml')).toBe(true);
  });
  it('叶子目录支持中括号图标和空子目录，图标变动生成新内容版本，删除配置恢复默认', async () => {
    const root = await fixture({ '_folders.yml': 'folders:\n  - python[python]:\n', 'python/a.md': front });
    const first = await readLibrary(root);
    expect(first.library.folders.children[0].icon).toBe('python');
    expect(first.diagnostics).toEqual([]);
    expect((await readLibrary(root)).library.version).toBe(first.library.version);
    await fs.writeFile(path.join(root, '_folders.yml'), 'folders:\n  - python[js]\n');
    const changed = await readLibrary(root);
    expect(changed.library.version).not.toBe(first.library.version);
    expect(changed.library.folders.children[0].icon).toBe('js');
    await fs.rm(path.join(root, '_folders.yml'));
    const cleared = await readLibrary(root);
    expect(cleared.library.folders.children[0].icon).toBeUndefined();
    expect(cleared.library.snippets).toEqual(first.library.snippets);
  });
  it.each(['python[]', 'python[unknown-icon]', 'python[123]'])('无效图标配置仅警告，不影响有效内容和目录排序：%s', async label => {
    const root = await fixture({ '_folders.yml': `folders:\n  - ${label}\n  - git\n`, 'python/a.md': front, 'git/a.md': front });
    const result = await readLibrary(root);
    expect(result.library.folders.children.map(folder => folder.path)).toEqual(['python', 'git']);
    expect(result.library.folders.children.every(folder => folder.icon === undefined)).toBe(true);
    expect(result.library.snippets).toHaveLength(2);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].level).toBe('warning');
  });
  it('真实目录决定树，排序逐层生效，错误文件不进入任何有效列表', async () => {
    const root = await fixture({
      '_folders.yml': 'folders:\n  - python:\n      - web\n      - files\n  - missing\n',
      'git/a.md': front + 'git', 'python/files/a.md': front + 'file', 'python/web/b.md': front + 'web',
      'python/asyncio/c.md': front + 'async', 'python/web/invalid.md': 'invalid', 'python/web/.hidden.md': front,
    });
    const result = await readLibrary(root);
    expect(result.library.folders.children.map(folder => folder.path)).toEqual(['python', 'git']);
    expect(result.library.folders.children[0].children.map(folder => folder.name)).toEqual(['web', 'files', 'asyncio']);
    expect(result.library.folders.count).toBe(4);
    expect(result.library.folders.children[0].count).toBe(3);
    expect(result.search).toHaveLength(4);
    expect(result.diagnostics.some(d => d.level === 'error' && d.path.endsWith('invalid.md'))).toBe(true);
    expect(result.diagnostics.some(d => d.message.includes('missing'))).toBe(true);
    expect(result.library.snippets.some(s => s.path.includes('invalid'))).toBe(false);
  });
  it('相对 Markdown 链接映射到页面，本地图片使用版本化资源，缺失目标只警告', async () => {
    const root = await fixture({ 'guide/read.md': front + '[target](../a.md)\n\n![photo](image.svg)\n\n![missing](none.png)', 'a.md': front + 'target', 'guide/image.svg': '<svg xmlns="http://www.w3.org/2000/svg" />' });
    const result = await readLibrary(root, '/library/');
    const snippet = result.library.snippets.find(s => s.path === 'guide/read.md')!;
    expect(snippet.descriptionHtml).toContain('href="/library/snippet/a"');
    expect(snippet.descriptionHtml).toContain('src="/library/content-assets/');
    expect(result.assets.size).toBe(1);
    expect(result.diagnostics.some(d => d.message.includes('none.png'))).toBe(true);
  });
  it('空库、全部错误、错误 Folder 配置都不阻止输出', async () => {
    const root = await fixture({ '_folders.yml': 'broken: [', 'invalid.md': 'bad' });
    const result = await readLibrary(root);
    expect(result.library.snippets).toEqual([]);
    expect(result.library.folders.count).toBe(0);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.library.version).toHaveLength(16);
  });
  it('同一内容版本稳定，内容变动会生成新版本', async () => {
    const root = await fixture({ 'a.md': front + 'first' });
    const first = await readLibrary(root);
    expect((await readLibrary(root)).library.version).toBe(first.library.version);
    await fs.writeFile(path.join(root, 'a.md'), front + 'second');
    expect((await readLibrary(root)).library.version).not.toBe(first.library.version);
  });
});
