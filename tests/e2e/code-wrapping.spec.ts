import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__wrapping-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
const route = `snippet/${name}`;
const front = '---\nsnippet_name: Wrapping\nsnippet_tags: []\n---\n\n';
const long = 'const 中文 = "' + 'some_long_value_'.repeat(20) + '";';
const source = long + '\n\n\tconsole.log(中文);';
const markdown = (body: string) => front + '````md\n' + body + '\n````';
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));
async function select(code: Locator) { await code.evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); }); }
test.beforeEach(async ({ context }) => { test.skip(process.env.APP_TEST_MODE === 'production'); await context.grantPermissions(['clipboard-read', 'clipboard-write']); });
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('CodeMirror 开关保留实例、原始行号、选区与 Tab 状态，关闭灰色、开启橙色', async ({ page }) => {
  await fs.writeFile(file, front + '# First\n\n```js\n' + source + '\n```\n\n# Other\n\n```text\nother\n```');
  await page.goto(route);
  const panel = page.locator('#code-panel'), input = panel.locator('.cm-content');
  await expect(panel.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  await input.evaluate(node => node.setAttribute('data-instance', 'keep'));
  const button = panel.locator('.code-wrap-button');
  await expect(button).toHaveCSS('color', 'rgb(156, 163, 175)');
  await button.click(); await page.mouse.move(0, 0);
  await expect(button).toHaveCSS('color', 'rgb(194, 65, 12)');
  await expect(input).toHaveClass(/cm-lineWrapping/);
  await expect(input).toHaveAttribute('data-instance', 'keep');
  expect((await panel.locator('.cm-lineNumbers .cm-gutterElement').allTextContents()).slice(1)).toEqual(['1', '2', '3']);
  expect((await panel.locator('.cm-line').first().boundingBox())!.height).toBeGreaterThan(44);
  await input.focus(); await page.keyboard.press('Control+a');
  await expect(panel.locator('.cm-selectedWhitespace').filter({ hasText: '↵' })).toHaveCount(2);
  const heights = await panel.locator('.cm-characterSelectionBackground').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(heights.every(height => height <= 23)).toBe(true);
  await page.keyboard.press('Control+c'); await expect.poll(() => clipboard(page)).toBe(source);
  await page.getByRole('tab', { name: 'Other', exact: true }).click();
  await expect(panel.getByRole('button', { name: '关闭自动换行', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: '关闭自动换行', exact: true }).click();
  await page.getByRole('tab', { name: 'First', exact: true }).click();
  await expect(panel.getByRole('button', { name: '开启自动换行', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await panel.getByRole('button', { name: '开启自动换行', exact: true }).click();
  await expect(panel.getByRole('button', { name: '关闭自动换行', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+Shift+f');
  await expect(panel.getByRole('button', { name: '关闭自动换行', exact: true })).toBeVisible();
});

test('Markdown 换行后行号、逐段选区、真实换行与复制保持正确，调整宽度后同步', async ({ page }) => {
  await fs.writeFile(file, markdown('```js\n' + source + '\n```\n\n```text\nother\n```'));
  await page.goto(route);
  const block = page.locator('.preview-code-block').first(), pre = block.locator('pre');
  const button = block.getByRole('button', { name: '开启自动换行', exact: true });
  await expect(button).toBeVisible();
  expect((await button.boundingBox())!.x).toBeLessThan((await block.getByRole('button', { name: '复制代码块 1' }).boundingBox())!.x);
  await button.click();
  await expect(block.locator('.preview-code-body')).toHaveClass(/is-code-wrapped/);
  await expect(block.locator('.code-wrap-button')).toHaveCSS('color', 'rgb(194, 65, 12)');
  await expect(pre.locator('code')).toHaveCSS('white-space', 'pre-wrap');
  await expect.poll(async () => (await block.locator('.preview-line-numbers > span').first().boundingBox())!.height).toBeGreaterThan(42);
  const layout = await block.evaluate(node => ({
    gutter: Array.from(node.querySelectorAll('.preview-line-numbers > span'), line => line.getBoundingClientRect().top),
    code: Array.from(node.querySelectorAll('code > .line'), line => line.getBoundingClientRect().top),
  }));
  expect(layout.gutter).toHaveLength(3);
  for (let index = 1; index < 3; index++) expect(layout.gutter[index] - layout.gutter[0]).toBeCloseTo(layout.code[index] - layout.code[0], 0);
  expect(await pre.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await select(pre.locator('code'));
  await expect(pre.locator('[data-symbol="↵"]')).toHaveCount(2);
  const heights = await pre.locator('.preview-selection-layer > span').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(4); expect(heights.every(height => height < 23)).toBe(true);
  await page.keyboard.press('Control+c'); await expect.poll(() => clipboard(page)).toBe(source);
  await page.setViewportSize({ width: 1050, height: 900 });
  await select(pre.locator('code'));
  await expect(pre.locator('[data-symbol="↵"]')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/markdown-wrapping.png' });
  await block.getByRole('button', { name: '复制代码块 1' }).click(); await expect.poll(() => clipboard(page)).toBe(source);
  await expect(page.locator('.preview-code-block').nth(1).getByRole('button', { name: '关闭自动换行' })).toHaveAttribute('aria-pressed', 'true');
});

test('转换输入、输出、转换源码与动态 Markdown 代码块共享全局换行状态', async ({ page }) => {
  await fs.writeFile(file, '---\nsnippet_name: Wrap Transform\nsnippet_tags: []\nsnippet_type: transform\n---\n\n```js\nexport default input => ({ ok: true, output: input, language: "markdown" });\n```');
  await page.goto(route);
  const inputArea = page.locator('[data-transform-pane="input"]');
  await inputArea.getByRole('button', { name: '开启自动换行' }).click();
  const input = page.getByRole('textbox', { name: '转换输入', exact: true });
  await input.fill('```text\n' + long + '\n```');
  const output = page.locator('#transform-output');
  await expect(output.locator('.preview-code-block')).toHaveCount(1);
  await expect(output.locator('.preview-code-block').getByRole('button', { name: '关闭自动换行', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await input.fill('```text\nnew block\n```\n\n```text\n' + long + '\n```');
  await expect(output.locator('.preview-code-block')).toHaveCount(2);
  await expect(output.locator('.preview-code-block').first().getByRole('button', { name: '关闭自动换行' })).toBeVisible();
  await expect(output.locator('.preview-code-block').nth(1).getByRole('button', { name: '关闭自动换行' })).toBeVisible();
  await expect(inputArea.getByRole('button', { name: '关闭自动换行' })).toBeVisible();
  await output.getByRole('button', { name: '查看源代码', exact: true }).click();
  await expect(output.getByRole('button', { name: '关闭自动换行', exact: true })).toBeVisible();
  await expect(output.locator('.cm-content')).toHaveClass(/cm-lineWrapping/);
  await output.getByRole('button', { name: '关闭自动换行', exact: true }).click();
  await expect(inputArea.getByRole('button', { name: '开启自动换行' })).toHaveAttribute('aria-pressed', 'false');
  await expect(input).not.toHaveClass(/cm-lineWrapping/);
  await page.getByRole('tab', { name: '转换代码', exact: true }).click();
  const sourcePanel = page.locator('#panel-transform-code');
  await sourcePanel.getByRole('button', { name: '开启自动换行', exact: true }).click();
  await expect(sourcePanel.locator('.cm-content')).toHaveClass(/cm-lineWrapping/);
  await page.getByRole('tab', { name: '转换', exact: true }).click();
  await expect(inputArea.getByRole('button', { name: '关闭自动换行' })).toBeVisible();
  await expect(output.getByRole('button', { name: '关闭自动换行', exact: true })).toBeVisible();
});

test('窄屏静态代码行号与 HTML 源码换行正确，实际 HTML 预览不显示开关', async ({ page }) => {
  await fs.writeFile(file, front + '# Code\n\n```js\n' + source + '\n```\n\n# Markdown\n\n````md\n```html\n<p>' + 'hello '.repeat(50) + '</p>\n```\n````');
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto(route);
  await page.locator('#code-panel').getByRole('button', { name: '开启自动换行' }).click();
  const fallback = page.locator('.code-fallback');
  await expect(fallback).toHaveClass(/is-code-wrapped/);
  await expect.poll(async () => (await fallback.locator('.line-numbers > span').first().boundingBox())!.height).toBeGreaterThan(40);
  expect(await fallback.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
  const html = page.locator('[data-preview-html]');
  await expect(html.locator('.code-wrap-button')).toHaveCount(0);
  await html.getByRole('button', { name: '预览', exact: true }).click();
  await expect(html.getByRole('button', { name: '关闭自动换行' })).toHaveAttribute('aria-pressed', 'true');
  await expect(html.locator('.code-wrap-button')).toHaveCSS('color', 'rgb(194, 65, 12)');
  await expect(html.locator('.html-block-source')).toHaveClass(/is-code-wrapped/);
  expect(await html.locator('pre').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-code-wrapping.png' });
  await html.getByRole('button', { name: '关闭自动换行' }).click();
  await html.getByRole('button', { name: '预览', exact: true }).click();
  await expect(html.locator('.code-wrap-button')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(page.locator('#code-panel').getByRole('button', { name: '开启自动换行' })).toHaveAttribute('aria-pressed', 'false');
});

test('编辑换行不改变转换输入、撤销记录和降级 textarea 原文', async ({ page }) => {
  await fs.writeFile(file, '---\nsnippet_name: Wrap Editable\nsnippet_tags: []\nsnippet_type: transform\n---\n\n```js\nexport default input => ({ ok: true, output: input });\n```');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(route);
    const area = page.locator('[data-transform-pane="input"]');
    const input = page.getByRole('textbox', { name: '转换输入', exact: true });
    await input.fill(long);
    await input.evaluate(node => node.setAttribute('data-instance', 'same'));
    const button = area.locator('.code-wrap-button');
    await button.hover(); await expect(button).toHaveCSS('background-color', 'rgb(241, 243, 245)');
    await expect(button).toHaveCSS('color', 'rgb(113, 113, 122)');
    await button.click(); await page.mouse.move(0, 0);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(input).toHaveAttribute('data-instance', 'same');
    if (width === 390) {
      await expect(input).toHaveAttribute('wrap', 'soft'); await expect(input).toHaveValue(long);
      expect(await input.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    } else {
      await input.focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' // edit');
      await page.keyboard.press('Control+z'); await expect(input).toHaveText(long);
    }
    await area.getByRole('button', { name: '全屏输入', exact: true }).click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(input).toBeFocused();
    await area.getByRole('button', { name: '恢复正文', exact: true }).click();
  }
});

test('长 Markdown 在滚动位置切换换行时保留当前原始行，代码按钮不被复制遮罩覆盖', async ({ page }) => {
  await fs.writeFile(file, markdown('```text\n' + Array.from({ length: 80 }, (_, index) => `row ${index}: ${long}`).join('\n') + '\n```'));
  await page.goto(route);
  const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
  const block = preview.locator('.preview-code-block');
  await expect(block.locator('.code-wrap-button')).toBeVisible();
  await preview.evaluate(node => { node.scrollTop = 600; });
  const before = await preview.evaluate(node => {
    const top = node.getBoundingClientRect().top;
    return Array.from(node.querySelectorAll('code > .line')).findIndex(line => line.getBoundingClientRect().bottom >= top);
  });
  await block.locator('.code-wrap-button').evaluate((node: HTMLButtonElement) => node.click());
  await expect.poll(() => preview.evaluate(node => {
    const top = node.getBoundingClientRect().top;
    return Array.from(node.querySelectorAll('code > .line')).findIndex(line => line.getBoundingClientRect().bottom >= top);
  })).toBe(before);
  await preview.evaluate(node => { node.scrollTop = 0; });
  await page.keyboard.down('Control');
  await block.getByRole('button', { name: '关闭自动换行', exact: true }).click();
  await expect(block.getByRole('button', { name: '开启自动换行', exact: true })).toBeVisible();
  await page.keyboard.up('Control');
});

test('切换 snippet 和浏览器历史保留全局状态，刷新后恢复关闭', async ({ page }) => {
  await fs.writeFile(file, front + '```js\n' + source + '\n```');
  await page.goto(route);
  await page.locator('#code-panel').getByRole('button', { name: '开启自动换行' }).click();
  await page.locator('.snippet-item').filter({ has: page.locator('.snippet-item-title strong', { hasText: 'Format JSON' }) }).click();
  await expect(page).toHaveURL(/snippet\/python\/files\/json\/format$/);
  await expect(page.locator('#code-panel .code-wrap-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#code-panel .cm-content')).toHaveClass(/cm-lineWrapping/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`snippet/${name}$`));
  await expect(page.locator('#code-panel .code-wrap-button')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#code-panel .code-wrap-button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#code-panel .code-editor')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#code-panel .cm-content')).not.toHaveClass(/cm-lineWrapping/);
});

test('多个 Markdown 代码块同时换行仍保留当前阅读位置', async ({ page }) => {
  const block = '```text\n' + Array.from({ length: 12 }, (_, index) => `row ${index}: ${long}`).join('\n') + '\n```';
  await fs.writeFile(file, markdown([block, block, block].join('\n\n')));
  await page.goto(route);
  const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
  await expect(preview.locator('.preview-code-block')).toHaveCount(3);
  expect(await preview.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await preview.locator('.code-wrap-button').first().click();
  await expect(preview.locator('.is-code-wrapped')).toHaveCount(3);
  await expect.poll(() => preview.evaluate(node => node.scrollTop)).toBe(0);
  await expect(preview.locator('.preview-code-block').first().getByRole('button', { name: '关闭自动换行' })).toBeInViewport();
});
