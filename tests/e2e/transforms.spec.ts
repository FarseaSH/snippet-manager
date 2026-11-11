import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__transform-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
const route = `snippet/${name}`;
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));
async function input(page: Page, value: string) {
  const native = page.locator('.transform-textarea');
  if (await native.count()) { await native.fill(value); return; }
  await expect(page.locator('.transform-editor').first().locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  await page.evaluate(async value => {
    const moduleUrl = '/src/features/snippets/monaco-runtime.ts';
    const { monaco } = await import(moduleUrl);
    monaco.editor.getEditors().find((editor: { getRawOptions(): { ariaLabel?: string } }) => editor.getRawOptions().ariaLabel === '转换输入').setValue(value);
  }, value);
}
async function writeCode(code: string) {
  await fs.writeFile(file, '---\nsnippet_name: Transform Runtime\nsnippet_tags: [transform]\nsnippet_type: transform\n---\n\n# 转换代码\n\n```js\n' + code + '\n```');
}
test.beforeEach(async ({ context }) => {
  test.skip(process.env.APP_TEST_MODE === 'production', '使用临时转换片段验证实时内容');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fs.copyFile('docs/examples/transform-json.md', file);
});
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('转换类型默认实时执行，校验、源码切换、复制及手机布局正常', async ({ page, request }) => {
  const raw = await fs.readFile(file, 'utf8');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(route);
    await expect(page.getByRole('tab')).toHaveCount(2);
    await expect(page.getByRole('tab', { name: '转换', exact: true })).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('tabpanel', { name: '转换', exact: true });
    const copy = panel.getByRole('button', { name: '复制结果', exact: true });
    await expect(copy).toBeDisabled();
    await expect(page.locator('iframe[title="转换执行环境"]')).toHaveCount(0);
    await panel.getByRole('button', { name: '填入示例' }).click();
    await expect(copy).toBeEnabled();
    await copy.click();
    expect(JSON.parse(await clipboard(page))).toEqual({ name: 'demo', enabled: true, items: [1, 2, 3] });
    if (width > 700) {
      await page.evaluate(() => navigator.clipboard.writeText('{"pasted":true}'));
      await page.getByRole('textbox', { name: '转换输入', exact: true }).focus();
      const modifier = await page.evaluate(() => navigator.platform.includes('Mac') ? 'Meta' : 'Control');
      await page.keyboard.press(`${modifier}+A`);
      await page.keyboard.press(`${modifier}+V`);
      await expect(copy).toBeEnabled(); await copy.click();
      expect(JSON.parse(await clipboard(page))).toEqual({ pasted: true });
    }
    await input(page, '{bad}');
    await expect(panel.getByRole('alert')).toHaveText('请输入有效的 JSON 文本');
    await expect(copy).toBeDisabled();
    await input(page, '{"fresh":true}');
    await expect(copy).toBeEnabled();
    await copy.click();
    expect(await clipboard(page)).toBe('{\n  "fresh": true\n}');
    await page.getByRole('tab', { name: '转换代码', exact: true }).click();
    const codePanel = page.getByRole('tabpanel', { name: '转换代码', exact: true });
    await expect(codePanel).toBeVisible();
    await codePanel.getByRole('button', { name: '复制当前代码' }).click();
    expect(await clipboard(page)).toContain('export default function transform(input)');
    await page.getByRole('tab', { name: '转换', exact: true }).click();
    await expect(copy).toBeEnabled();
    await page.getByRole('button', { name: '复制 Markdown', exact: true }).click();
    expect(await clipboard(page)).toBe(raw.replace(/\r\n/g, '\n'));
    await page.screenshot({ path: `test-results/transform-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await panel.getByRole('button', { name: '清空', exact: true }).click();
    await expect(panel.getByRole('status')).toHaveText('待输入');
    await expect(copy).toBeDisabled();
    await expect(panel.getByRole('alert')).toBeEmpty();
    await expect(page.locator('iframe[title="转换执行环境"]')).toHaveCount(0);
  }
  expect(await (await request.get(`raw/${name}.md`)).text()).toBe(raw);
  expect(errors).toEqual([]);
});

test('异步转换取消过期结果，输入恢复旧内容仍重新执行，切换片段重置状态', async ({ page }) => {
  await writeCode('export default async function transform(input) { await new Promise(resolve => setTimeout(resolve, input === "slow" ? 1400 : 20)); return { ok: true, output: input }; }');
  await page.goto(route);
  const panel = page.getByRole('tabpanel', { name: '转换', exact: true });
  const copy = panel.getByRole('button', { name: '复制结果' });
  await input(page, 'slow');
  await expect(panel.getByRole('status')).toHaveText('正在转换…');
  await input(page, 'fast');
  await expect(copy).toBeEnabled(); await copy.click();
  expect(await clipboard(page)).toBe('fast');
  await page.waitForTimeout(1500);
  await copy.click(); expect(await clipboard(page)).toBe('fast');
  await input(page, 'next'); await input(page, 'fast');
  await expect(copy).toBeDisabled();
  await expect(copy).toBeEnabled();
  await page.goto('snippet/git/branch');
  await page.goto(route);
  await expect(copy).toBeDisabled();
  await expect(panel.getByRole('status')).toHaveText('待输入');
});

test('运行异常、非法返回值和无限循环均不阻塞页面，恢复后空输出可复制', async ({ page }) => {
  await writeCode('export default function transform(input) { if (input === "loop") while (true) {} if (input === "throw") throw new Error("测试异常"); if (input === "wrong") return 123; return { ok: true, output: "" }; }');
  await page.goto(route);
  const panel = page.getByRole('tabpanel', { name: '转换', exact: true });
  await input(page, 'throw');
  await expect(panel.getByRole('alert').last()).toContainText('测试异常');
  await input(page, 'wrong');
  await expect(panel.getByRole('alert').last()).toContainText('返回格式无效');
  await input(page, 'loop');
  await expect(panel.getByRole('alert').last()).toContainText('转换超时');
  await expect(page.locator('iframe[title="转换执行环境"]')).toHaveCount(0);
  await input(page, 'empty');
  const copy = panel.getByRole('button', { name: '复制结果' });
  await expect(copy).toBeEnabled();
  await copy.click(); expect(await clipboard(page)).toBe('');
});

test('隔离执行无法访问页面、站点存储或网络，输出按文本显示', async ({ page }) => {
  await writeCode('export default async function transform(input) { let storage = false, network = false; try { indexedDB.open("should-not-open"); } catch { storage = true; } try { await fetch("https://example.invalid/transform-probe"); } catch { network = true; } return { ok: true, output: JSON.stringify({ dom: typeof document, storage, network, text: input }) }; }');
  await page.goto(route);
  await input(page, '<script>alert(1)</script>');
  const copy = page.getByRole('button', { name: '复制结果' });
  await expect(copy).toBeEnabled(); await copy.click();
  expect(JSON.parse(await clipboard(page))).toEqual({ dom: 'undefined', storage: true, network: true, text: '<script>alert(1)</script>' });
  await expect(page.getByRole('region', { name: '输出区' }).locator('script')).toHaveCount(0);
});
