import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__markdown-refresh-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
const route = `snippet/${name}`;
const front = '---\nsnippet_name: Markdown Refresh\nsnippet_tags: []\n---\n\n';
const markdown = '# @title::Original@\n\n```text\nblock:@title::Original@\n```\n\n' + Array.from({ length: 100 }, (_, index) => `Paragraph ${index}.\n\n`).join('');
const snippet = (source = markdown) => front + '# First\n\n````markdown\n' + source + '\n````\n\n# Second\n\n```md\n# Second page\n```';
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));

test.beforeEach(async ({ context }) => {
  test.skip(process.env.APP_TEST_MODE === 'production', '使用临时片段检查 Markdown 后台渲染');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('连续输入保留预览节点和滚动位置，250ms 合并更新，内嵌复制与可见版本保持一致', async ({ page }) => {
  await fs.writeFile(file, snippet());
  await page.goto(route);
  const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await expect(preview.locator('h1')).toHaveText('Original');
  await preview.evaluate(node => {
    node.setAttribute('data-identity', 'original');
    node.scrollTop = 550;
    node.dispatchEvent(new Event('scroll'));
    document.documentElement.dataset.previewFlashed = 'false';
    new MutationObserver(() => {
      if (document.querySelector('.code-card')?.textContent?.includes('正在更新预览…')) document.documentElement.dataset.previewFlashed = 'true';
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  const scroll = await preview.evaluate(node => node.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await title.fill('First edit');
  await expect(preview.locator('h1')).toHaveText('Original');
  await page.clock.runFor(249);
  await expect(preview.locator('h1')).toHaveText('Original');
  await title.fill('Latest');
  await page.clock.runFor(249);
  await expect(preview.locator('h1')).toHaveText('Original');
  await page.locator('.copy-code').click();
  expect(await clipboard(page)).toContain('# Latest');
  await page.clock.runFor(1);
  await expect(preview.locator('h1')).toHaveText('Latest');
  await expect(preview).toHaveAttribute('data-identity', 'original');
  expect(await preview.evaluate(node => node.scrollTop)).toBeCloseTo(scroll, 0);
  await preview.evaluate(node => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  await title.fill('Pending');
  await preview.getByRole('button', { name: '复制代码块 1', exact: true }).click();
  expect(await clipboard(page)).toBe('block:Latest');
  await page.locator('.copy-code').click();
  expect(await clipboard(page)).toContain('# Pending');
  await page.clock.runFor(250);
  await expect(preview.locator('h1')).toHaveText('Pending');
  await preview.getByRole('button', { name: '复制代码块 1', exact: true }).click();
  expect(await clipboard(page)).toBe('block:Pending');
  expect(await page.locator('html').getAttribute('data-preview-flashed')).toBe('false');
});

test('切换 Tab 不显示其他页面预览，返回及重置后继续保留当前可见版本', async ({ page }) => {
  await fs.writeFile(file, snippet());
  await page.goto(route);
  const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await title.fill('Saved edit');
  await expect(preview.locator('h1')).toHaveText('Saved edit');
  await page.getByRole('tab', { name: 'Second', exact: true }).click();
  await expect(preview.locator('h1')).toHaveText('Second page');
  await page.getByRole('tab', { name: 'First', exact: true }).click();
  await expect(preview.locator('h1')).toHaveText('Saved edit');
  await page.getByRole('button', { name: '重置参数', exact: true }).click();
  await expect(preview.locator('h1')).toHaveText('Original');
  await title.fill('After reset');
  await expect(preview.locator('h1')).toHaveText('Original');
  await expect(preview.locator('h1')).toHaveText('After reset');
});

test('渲染失败保留旧预览且能复制最新源码，恢复后更新，异步旧结果不会覆盖新结果', async ({ page }) => {
  await page.route('**/src/core/code-rendering.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function highlightedCode() { return ''; }
    export async function renderMarkdownPreview(code) {
      const title = code.match(/^# (.*)/)[1];
      if (title === 'FAIL') throw new Error('render failed');
      if (title === 'Slow') await new Promise(resolve => setTimeout(resolve, 1000));
      return { html: '<h1>' + title + '</h1>', codeBlocks: [] };
    }
  ` }));
  await fs.writeFile(file, snippet('# @title::Original@'));
  await page.goto(route);
  const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await preview.evaluate(node => node.setAttribute('data-identity', 'retained'));
  await title.fill('FAIL');
  await expect(page.getByRole('alert')).toContainText('已保留上次内容');
  await expect(preview.locator('h1')).toHaveText('Original');
  await expect(preview).toHaveAttribute('data-identity', 'retained');
  await page.locator('.copy-code').click();
  expect(await clipboard(page)).toBe('# FAIL');
  await title.fill('Recovered');
  await expect(preview.locator('h1')).toHaveText('Recovered');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await title.fill('Slow');
  await page.waitForTimeout(350);
  await title.fill('Newest');
  await expect(preview.locator('h1')).toHaveText('Newest');
  await page.waitForTimeout(1000);
  await expect(preview.locator('h1')).toHaveText('Newest');
});

test('转换 Markdown 等待时保留成功预览，复制仍对应可见代码块，校验失败和清空仍清除结果', async ({ page }) => {
  await fs.writeFile(file, '---\nsnippet_name: Markdown Transform\nsnippet_tags: []\nsnippet_type: transform\n---\n\n```js\nexport default async input => { if (input === "bad") return { ok: false, error: { message: "Invalid input" } }; await new Promise(resolve => setTimeout(resolve, 100)); return { ok: true, language: "markdown", output: "# " + input + "\\n\\n```text\\n" + input + "\\n```" }; };\n```');
  await page.goto(route);
  const input = page.getByRole('textbox', { name: '转换输入', exact: true });
  const output = page.getByRole('region', { name: '输出区', exact: true });
  const preview = output.getByRole('region', { name: 'Markdown 预览', exact: true });
  await input.fill('First');
  await expect(preview.locator('h1')).toHaveText('First');
  await preview.evaluate(node => node.setAttribute('data-identity', 'retained'));
  await input.fill('Second');
  await expect(preview.locator('h1')).toHaveText('First');
  await expect(output.getByRole('button', { name: '复制 Markdown', exact: true })).toBeDisabled();
  await preview.getByRole('button', { name: '复制代码块 1', exact: true }).click();
  expect(await clipboard(page)).toBe('First');
  await expect(preview.locator('h1')).toHaveText('Second');
  await expect(preview).toHaveAttribute('data-identity', 'retained');
  await input.fill('bad');
  await expect(page.locator('#transform-input-error')).toHaveText('Invalid input');
  await expect(preview).toHaveCount(0);
  await input.fill('Fresh');
  await expect(preview.locator('h1')).toHaveText('Fresh');
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(output.getByRole('button', { name: '复制 Markdown', exact: true })).toBeDisabled();
});

test('首次没有预览时延迟 300ms 才显示加载提示，完成后显示正文', async ({ page }) => {
  let release!: () => void;
  const loading = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/src/core/code-rendering.ts*', async route => { await loading; await route.continue(); });
  await fs.writeFile(file, '---\nsnippet_name: Initial Preview\nsnippet_tags: []\nsnippet_type: transform\n---\n\n```js\nexport default input => ({ ok: true, language: "markdown", output: "# " + input });\n```');
  try {
    await page.goto(route);
    const input = page.getByRole('textbox', { name: '转换输入', exact: true });
    await expect(input).toBeVisible();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await input.fill('Ready');
    await page.clock.runFor(500);
    await expect(page.locator('.transform-status-row [role="status"]')).toHaveText('转换成功');
    const output = page.getByRole('region', { name: '输出区', exact: true });
    const message = output.getByText('正在更新预览…', { exact: true });
    await expect(message).toHaveCount(0);
    await page.clock.runFor(299);
    await expect(message).toHaveCount(0);
    await page.clock.runFor(1);
    await expect(message).toBeVisible();
    release();
    await expect(output.getByRole('heading', { name: 'Ready', exact: true })).toBeVisible();
    await expect(message).toHaveCount(0);
  } finally { release(); }
});
