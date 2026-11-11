import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const contentRoot = process.env.SNIPPETS_DIR || path.resolve('snippets');
const name = `__placeholder-${process.pid}`;
const file = path.resolve(contentRoot, `${name}.md`);
const route = `snippet/${name}`;
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));

test.beforeEach(async ({ context }) => {
  test.skip(process.env.APP_TEST_MODE === 'production', '使用专门的临时占位符用例');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fs.copyFile(path.resolve('docs/examples/placeholders.md'), file);
});
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('占位符参数实时替换、校验、重置和 Tab 独立保存，原始 Markdown 不变', async ({ page, request }) => {
  const raw = await fs.readFile(file, 'utf8');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(route);
    const form = page.getByRole('region', { name: '代码参数', exact: true });
    await expect(form).toBeVisible();
    await expect(form.locator('.placeholder-hint')).toHaveCount(0);
    await expect(form.locator('.placeholder-rule').first()).toHaveText('/^[0-9]{1,5}$/');
    await expect(form.getByLabel('name', { exact: true })).toHaveCount(1);
    await expect(form.getByLabel('host', { exact: true })).toHaveValue('localhost');
    await expect(form.getByLabel('host', { exact: true }).locator('..').locator('.placeholder-default')).toHaveText('localhost');
    await expect(form.getByLabel('host', { exact: true }).locator('..').locator('.placeholder-default')).toHaveCSS('color', 'rgb(161, 161, 170)');
    await expect(form.getByLabel('optional', { exact: true })).toHaveCSS('border-top-color', 'rgb(220, 38, 38)');
    await expect(form.getByLabel('optional', { exact: true })).toHaveCSS('background-color', 'rgb(254, 242, 242)');
    await form.getByLabel('name', { exact: true }).fill('alice');
    await form.getByLabel('host', { exact: true }).fill('example.com');
    await expect(form.getByLabel('host', { exact: true }).locator('..').locator('.placeholder-default')).toHaveCount(0);
    await form.getByLabel('port', { exact: true }).fill('9000');
    await form.getByLabel('optional', { exact: true }).fill('$& @another@');
    await page.locator('.copy-code').click();
    let code = await clipboard(page);
    expect(code).toContain('http://example.com:9000/users/alice');
    expect(code).toContain('用户：alice');
    expect(code).toContain('备注：$& @another@');
    await form.getByLabel('port', { exact: true }).fill('abcdef');
    await expect(form.getByLabel('port', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(form.locator('.placeholder-hint')).toHaveText('请输入有效数字，支持负数和小数');
    await page.locator('.copy-code').click();
    expect(await clipboard(page)).toContain('@port:number/^[0-9]{1,5}$/:8080@');
    await form.getByLabel('port', { exact: true }).fill('');
    await expect(form.locator('.placeholder-hint')).toHaveCount(0);
    await form.getByLabel('port', { exact: true }).fill('9000');
    await page.getByRole('tab', { name: '独立参数', exact: true }).click();
    await expect(form.getByLabel('name', { exact: true })).toHaveValue('独立值');
    await form.getByLabel('name', { exact: true }).fill('other-tab');
    await page.getByRole('tab', { name: '文本与数字', exact: true }).click();
    await expect(form.getByLabel('name', { exact: true })).toHaveValue('alice');
    await form.getByRole('button', { name: '重置参数', exact: true }).click();
    await expect(form.getByLabel('name', { exact: true })).toHaveValue('demo');
    await expect(form.getByLabel('name', { exact: true }).locator('..').locator('.placeholder-default')).toHaveText('demo');
    await page.getByRole('tab', { name: '独立参数', exact: true }).click();
    await expect(form.getByLabel('name', { exact: true })).toHaveValue('other-tab');
    await page.getByRole('button', { name: '复制 Markdown', exact: true }).click();
    expect(await clipboard(page)).toBe(raw.replace(/\r\n/g, '\n'));
    await page.goto('snippet/git/branch');
    await expect(page.getByRole('region', { name: '代码参数', exact: true })).toHaveCount(0);
    await page.goto(route);
    await expect(form.getByLabel('name', { exact: true })).toHaveValue('demo');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/placeholders-${viewport.width}.png`, fullPage: true });
    if (viewport.width <= 700) {
      await expect.poll(() => page.locator('.code-fallback .code-source').textContent()).toContain('localhost:8080');
    }
  }
  const response = await request.get(`raw/${name}.md`);
  expect(await response.text()).toBe(raw);
  expect(errors).toEqual([]);
});

test('日期时间共用输入和选择弹层，支持秒、仅日期和仅时间并同步替换', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(route);
    await page.getByRole('tab', { name: '日期与时间', exact: true }).click();
    const form = page.getByRole('region', { name: '代码参数', exact: true });
    await expect(form.locator('.placeholder-hint')).toHaveCount(0);
    await expect(form.locator('.placeholder-rule')).toHaveCount(0);
    await expect(form.locator('input')).toHaveCount(3);
    const start = form.getByLabel('start 日期和时间', { exact: true });
    const day = form.getByLabel('day 日期', { exact: true });
    const clock = form.getByLabel('clock 时间', { exact: true });
    await expect(start).toHaveValue('2026-11-10 14:30:25');
    await start.fill('2027-01-02 03:04:05');
    await page.locator('.copy-code').click();
    const code = await clipboard(page);
    expect(code).toContain('report_20270102_030405.csv');
    expect(code).toContain('2027年1月2日 03:04:05');
    expect(code).toContain('短日期：27/1/2');
    expect(code).toContain('仅日期：2026/11/10');
    await start.click();
    const calendar = page.locator('.parameter-calendar');
    await expect(calendar).toBeVisible();
    await calendar.locator('.react-datepicker__day--003:not(.react-datepicker__day--outside-month)').click();
    await calendar.getByLabel('start 时', { exact: true }).selectOption('04');
    await calendar.getByLabel('start 分', { exact: true }).selectOption('06');
    await calendar.getByLabel('start 秒', { exact: true }).selectOption('07');
    await expect(start).toHaveValue('2027-01-03 04:06:07');
    const bounds = await calendar.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: `test-results/placeholder-calendar-${viewport.width}.png`, fullPage: true });
    await calendar.getByRole('button', { name: '完成', exact: true }).click();
    await expect(calendar).toHaveCount(0);
    await page.locator('.copy-code').click();
    expect(await clipboard(page)).toContain('report_20270103_040607.csv');
    await clock.click();
    await expect(calendar.locator('.react-datepicker__month-container')).toHaveCount(0);
    await expect(calendar.getByLabel('clock 秒', { exact: true })).toHaveCount(0);
    await calendar.getByLabel('clock 时', { exact: true }).selectOption('11');
    await calendar.getByLabel('clock 分', { exact: true }).selectOption('12');
    await expect(clock).toHaveValue('11:12');
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
    await day.click();
    await expect(calendar.getByRole('group')).toHaveCount(0);
    await calendar.locator('.react-datepicker__day--011:not(.react-datepicker__day--outside-month)').click();
    await expect(day).toHaveValue('2026-11-11');
    await expect(calendar).toHaveCount(0);
    await start.fill('2027-02-30 03:04:05');
    await expect(start).toHaveAttribute('aria-invalid', 'true');
    await expect(form.locator('.placeholder-hint')).toHaveText('请选择有效日期');
    await page.locator('.copy-code').click();
    expect(await clipboard(page)).toContain('@start:date(YYYYMMDD_HHmmss):2026-11-10T14:30:25@');
    await start.fill('');
    await expect(start).toHaveAttribute('aria-invalid', 'true');
    await expect(start).toHaveCSS('background-color', 'rgb(254, 242, 242)');
    await expect(form.locator('.placeholder-hint')).toHaveCount(0);
    await start.fill('2027-01-02');
    await expect(form.locator('.placeholder-hint')).toHaveCount(0);
    await page.locator('.copy-code').click();
    expect(await clipboard(page)).toContain('@start:date(YYYYMMDD_HHmmss):2026-11-10T14:30:25@');
    await form.getByRole('button', { name: '重置参数', exact: true }).click();
    await expect(start).toHaveValue('2026-11-10 14:30:25');
    await start.click();
    await calendar.getByRole('button', { name: '清空', exact: true }).click();
    await expect(start).toHaveValue('');
    await expect(form.locator('.placeholder-hint')).toHaveCount(0);
    await start.click();
    await calendar.getByLabel('start 时', { exact: true }).selectOption('03');
    await calendar.getByLabel('start 分', { exact: true }).selectOption('04');
    await calendar.getByLabel('start 秒', { exact: true }).selectOption('05');
    await expect(start).toHaveValue(' 03:04:05');
    await page.locator('.copy-code').click();
    expect(await clipboard(page)).toContain('@start:date(YYYYMMDD_HHmmss):2026-11-10T14:30:25@');
    await start.click();
    for (const unit of ['时', '分', '秒']) await calendar.getByLabel(`start ${unit}`, { exact: true }).selectOption('');
    await expect(start).toHaveValue('');
    await expect(form.locator('.placeholder-hint')).toHaveCount(0);
    await calendar.getByRole('button', { name: '完成', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/placeholder-dates-${viewport.width}.png`, fullPage: true });
  }
});

test('替换更新 Monaco 原模型，保留折叠和编辑器滚动位置', async ({ page }) => {
  const source = 'def example():\n    print("@name::original@")\n    return 1\n\n' + Array.from({ length: 160 }, (_, i) => `print("line-${i}")`).join('\n');
  await fs.writeFile(file, '---\nsnippet_name: Model Parameters\nsnippet_tags: []\n---\n\n# Long\n\n```python\n' + source + '\n```');
  await page.goto(route);
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  await page.locator('.codicon-folding-expanded').first().click();
  const state = () => page.evaluate(async () => {
    const url = '/src/features/snippets/monaco-runtime.ts';
    const { monaco } = await import(url);
    const editor = monaco.editor.getEditors()[0];
    const folding = editor.saveViewState().contributionsState['editor.contrib.folding'];
    return { id: editor.getModel().id, top: editor.getScrollTop(), models: monaco.editor.getModels().length, folding: folding.collapsedRegions.map((region: { startLineNumber: number; endLineNumber: number; isCollapsed: boolean }) => ({ start: region.startLineNumber, end: region.endLineNumber, collapsed: region.isCollapsed })) };
  });
  await page.evaluate(async () => {
    const url = '/src/features/snippets/monaco-runtime.ts';
    const { monaco } = await import(url);
    monaco.editor.getEditors()[0].setScrollTop(1200);
  });
  const before = await state();
  await page.getByLabel('name', { exact: true }).fill('updated');
  await page.locator('.copy-code').click();
  expect(await clipboard(page)).toContain('print("updated")');
  const after = await state();
  expect(after.id).toBe(before.id);
  expect(after.models).toBe(1);
  expect(after.folding).toEqual(before.folding);
  expect(after.top).toBe(before.top);
});

test('Markdown 预览、源码和内嵌代码块复制同步替换，并安全显示输入', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await page.getByRole('tab', { name: 'Markdown 预览', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
    await page.getByLabel('title', { exact: true }).fill('新的报告');
    await expect(preview.getByRole('heading', { name: '新的报告', exact: true })).toBeVisible();
    await preview.getByRole('button', { name: '复制代码块 1', exact: true }).click();
    expect(await clipboard(page)).toBe('报告名称：新的报告');
    await page.locator('.copy-code').click();
    expect(await clipboard(page)).toContain('## 新的报告');
    await page.getByRole('button', { name: '查看源代码', exact: true }).click();
    await expect(page.locator('.code-editor, .code-fallback')).toBeVisible();
    await page.getByRole('button', { name: '切换到预览', exact: true }).click();
    await page.getByLabel('title', { exact: true }).fill('<script>alert("input")</script>');
    await expect(preview).toContainText('<script>alert("input")</script>');
    await expect(preview.locator('script')).toHaveCount(0);
    await expect(page.locator('.placeholder-render-error')).toHaveCount(0);
    await page.screenshot({ path: `test-results/placeholder-markdown-${width}.png`, fullPage: true });
  }
});
