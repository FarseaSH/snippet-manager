import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSnippet } from '../scripts/content/parse';
import { readLibrary } from '../scripts/content/library';
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
  it('摘要 Logo 跟随代码块语言，支持别名，未知语言使用默认图标', async () => {
    const result = await parseSnippet(front + '# JavaScript\n\n```py\nprint(1)\n```\n\n# Python\n\n```js\nconsole.log(2)\n```\n\n# Unknown\n\n```custom\nthree\n```', 'logos.md');
    expect(result.descriptionHtml.match(/data-language-icon="([^"]+)"/g)).toEqual([
      'data-language-icon="python"', 'data-language-icon="javascript"', 'data-language-icon="fallback"',
    ]);
    expect(result.descriptionHtml).toContain('<span class="sub-summary-icon"');
  });
  it('子片段摘要使用代码图标，无自动分割线和列表标记，源说明列表保留', async () => {
    const raw = front + '主说明。\n\n# First\n\n简短说明。\n\n```text\none\n```\n\n# Second\n\n- 原有列表项\n\n```text\ntwo\n```';
    const result = await parseSnippet(raw, 'summary.md');
    expect(result.descriptionHtml.match(/class="sub-summary-icon"/g)).toHaveLength(2);
    expect(result.descriptionHtml).not.toContain('<hr');
    expect(result.descriptionHtml).not.toContain('<ul class="sub-summary"');
    expect(result.descriptionHtml).toContain('<div class="sub-summary-body">');
    expect(result.descriptionHtml).toContain('data-tab-id="block-2"');
    expect(result.descriptionHtml).toContain('<li>原有列表项</li>');
    expect(result.descriptionHtml.indexOf('First')).toBeLessThan(result.descriptionHtml.indexOf('Second'));
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
    expect(result.descriptionHtml).toContain('登录之前');
    expect(result.descriptionHtml).toContain('登录之后');
    expect(result.descriptionHtml).not.toContain('summary-tab');
  });
  it('标题只命名下一代码块；中间文字归前一个，第二块为 Untitled', async () => {
    const result = await parseSnippet(front + '# Named\n\n```js\nconst a = 1\n```\n\n第一段补充。\n\n```js\nconst b = 2\n```\n\n第二段补充。', 'two.md');
    expect(result.subSnippets.map(sub => sub.title)).toEqual(['Named', 'Untitled']);
    expect(result.subSnippets[0].sourceDescription).toBe('第一段补充。');
    expect(result.subSnippets[1].sourceDescription).toBe('第二段补充。');
    expect(result.descriptionHtml.indexOf('第一段补充')).toBeLessThan(result.descriptionHtml.indexOf('第二段补充'));
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
    expect(result.descriptionHtml).toContain('quoted()');
    expect(result.descriptionHtml).toContain('listed()');
    expect(result.descriptionHtml).toContain('indented()');
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
    expect(result.descriptionHtml).toContain('href="https://example.com"');
    expect(result.subSnippets).toHaveLength(2);
  });
  it.each(['---\nsnippet_tags: []\n---\n', '---\nsnippet_name: " "\nsnippet_tags: []\n---\n', '---\nsnippet_name: A\nsnippet_tags: wrong\n---\n', 'no front matter', '---\nsnippet_name: [\nsnippet_tags: []\n---\n'])('无效元数据由调用方跳过', async raw => {
    await expect(parseSnippet(raw, 'invalid.md')).rejects.toThrow();
  });
});

describe('文件库生成', () => {
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
    expect(python.children.find(folder => folder.name === 'HTTP')?.icon).toBe('py');
    const files = python.children.find(folder => folder.name === 'Files')!;
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
    expect(result.library.folders.children[0].children.map(folder => folder.name)).toEqual(['Web', 'Files', 'Asyncio']);
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
