import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__codemirror-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
test.beforeEach(async ({ context }) => {
  test.skip(process.env.APP_TEST_MODE === 'production', '使用临时片段检查语言和输入');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('按需切换语言及别名，缩进参考线、原生和兼容模式折叠、括号匹配均可用', async ({ page }) => {
  const cases = [
    ['Python', 'py', 'def example():\n    if True:\n        return 1'],
    ['JavaScript', 'js', 'function example() {\n    return true;\n}'],
    ['TypeScript', 'ts', 'function example(value: number): number {\n    return value;\n}'],
    ['JSON', 'json', '{\n    "items": [1, 2]\n}'],
    ['YAML', 'yml', 'app:\n    name: demo\n    enabled: true'],
    ['Shell', 'sh', 'if true; then\n    echo "hello"\nfi'],
    ['SQL', 'sql', 'SELECT name FROM users WHERE enabled = true;'],
    ['Unknown', 'made-up-language', 'root\n    child\n        grandchild'],
  ];
  await fs.writeFile(file, '---\nsnippet_name: Languages\nsnippet_tags: []\n---\n\n' + cases.map(([title, language, code]) => `# ${title}\n\n\`\`\`${language}\n${code}\n\`\`\``).join('\n\n'));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`snippet/${name}`);
  for (const [title, , code] of cases) {
    await page.getByRole('tab', { name: title, exact: true }).click();
    await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
    const editor = page.getByRole('textbox', { name: `${title}，只读代码编辑器`, exact: true });
    await editor.focus();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+C`);
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(code);
    if (['Python', 'JavaScript', 'YAML', 'Shell', 'Unknown'].includes(title)) {
      await expect(page.locator('.cm-indent-markers')).not.toHaveCount(0);
      await page.locator('.editor-fold-toggle[data-fold="open"]').first().click();
      await expect(page.locator('.editor-fold-toggle[data-fold="closed"]:visible')).not.toHaveCount(0);
    }
    if (title === 'JSON') {
      await page.keyboard.press(`${modifier}+Home`);
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.cm-matchingBracket')).toHaveCount(2);
    }
  }
  expect(errors).toEqual([]);
});

test('转换输入支持粘贴、撤销重做和中文组合输入，外部示例填充不触发旧值回写', async ({ page }) => {
  await fs.writeFile(file, '---\nsnippet_name: Editable\nsnippet_tags: []\nsnippet_type: transform\ntransform:\n  example: "  first\\nsecond  "\n---\n\n```js\nexport default function transform(input) { return { ok: true, output: input }; }\n```');
  await page.goto(`snippet/${name}`);
  const input = page.getByRole('textbox', { name: '转换输入', exact: true });
  const copy = page.getByRole('region', { name: '输出区', exact: true }).getByRole('button', { name: '复制结果', exact: true });
  await page.getByRole('button', { name: '填入示例', exact: true }).click();
  await expect(copy).toBeEnabled();
  await copy.click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe('  first\nsecond  ');
  await input.focus();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+End`);
  await page.keyboard.type('x');
  await expect(input).toContainText('second  x');
  await page.keyboard.press(`${modifier}+z`);
  await expect(input).not.toContainText('second  x');
  await page.keyboard.press(`${modifier}+Shift+z`);
  await expect(input).toContainText('second  x');
  const session = await page.context().newCDPSession(page);
  await session.send('Input.imeSetComposition', { text: '中文', selectionStart: 2, selectionEnd: 2 });
  await session.send('Input.insertText', { text: '中文' });
  await session.detach();
  await expect(copy).toBeEnabled();
  await copy.click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe('  first\nsecond  x中文');
});

test('编辑器加载失败时仍可查看和复制代码，转换输入降级后仍能执行', async ({ page }) => {
  await page.route('**/codemirror-runtime.ts*', route => route.abort());
  await fs.writeFile(file, '---\nsnippet_name: Fallback\nsnippet_tags: []\n---\n\n```python\nprint("fallback")\n```');
  await page.goto(`snippet/${name}`);
  await expect(page.locator('.code-fallback')).toBeVisible();
  await page.getByRole('button', { name: '复制当前代码', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('print("fallback")');
  await fs.writeFile(file, '---\nsnippet_name: Fallback Input\nsnippet_tags: []\nsnippet_type: transform\n---\n\n```js\nexport default input => ({ ok: true, output: input });\n```');
  await page.reload();
  await page.getByRole('textbox', { name: '转换输入', exact: true }).fill('降级输入');
  const copy = page.getByRole('region', { name: '输出区', exact: true }).getByRole('button', { name: '复制结果' });
  await expect(copy).toBeEnabled();
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('降级输入');
});

test('一万六千行代码按视口展示，滚动到末尾后仍可完整复制', async ({ page }) => {
  test.setTimeout(60_000);
  const source = Array.from({ length: 16_000 }, (_, index) => `print("line-${index}-${'x'.repeat(50)}")`).join('\n');
  await fs.writeFile(file, '---\nsnippet_name: Large Code\nsnippet_tags: []\n---\n\n```python\n' + source + '\n```');
  await page.goto(`snippet/${name}`);
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  expect(await page.locator('.cm-line').count()).toBeLessThan(1000);
  const input = page.getByRole('textbox', { name: 'Untitled，只读代码编辑器', exact: true });
  await input.focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await expect(input).toContainText('line-15999-');
  await page.getByRole('button', { name: '复制当前代码', exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(source);
});

test('隐藏源码时缩短占位符内容，返回源码仍可恢复有效选区', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await fs.writeFile(file, '---\nsnippet_name: Markdown Selection\nsnippet_tags: []\n---\n\n````markdown\n# Report\n\n@content::' + 'long text '.repeat(100) + '@\n````');
  await page.goto(`snippet/${name}`);
  await page.getByRole('button', { name: '查看源代码', exact: true }).click();
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  await page.locator('.cm-content').focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await page.getByRole('button', { name: '切换到预览', exact: true }).click();
  await page.getByRole('textbox', { name: 'content', exact: true }).fill('short');
  await expect(page.getByRole('region', { name: 'Markdown 预览' })).toContainText('short');
  await page.getByRole('button', { name: '查看源代码', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('short');
  await page.getByRole('button', { name: '复制 Markdown', exact: true }).last().click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe('# Report\n\nshort');
  expect(errors).toEqual([]);
});
