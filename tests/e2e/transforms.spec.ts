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
  await page.getByRole('textbox', { name: '转换输入', exact: true }).fill(value);
}
async function writeCode(code: string, config = '') {
  await fs.writeFile(file, '---\nsnippet_name: Transform Runtime\nsnippet_tags: [transform]\nsnippet_type: transform\n' + config + '---\n\n# 转换代码\n\n```js\n' + code + '\n```');
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

test('Markdown 输出默认预览，代码块、行内代码及原文可复制，实时更新保留源码选择', async ({ page }) => {
  test.setTimeout(60_000);
  await fs.copyFile('docs/examples/transform-json-to-markdown.md', file);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(route);
    const output = page.getByRole('region', { name: '输出区', exact: true });
    await page.getByRole('button', { name: '填入示例', exact: true }).click();
    await expect(output.getByRole('heading', { name: 'JSON 转换报告' })).toBeVisible();
    await output.getByRole('button', { name: '复制代码块 1' }).click();
    expect(JSON.parse(await clipboard(page))).toEqual({ name: 'demo', enabled: true, items: [1, 2, 3] });
    await output.locator('li code').first().click({ modifiers: ['ControlOrMeta'] });
    await expect.poll(() => clipboard(page)).toBe('object');
    await output.getByRole('button', { name: '复制 Markdown', exact: true }).click();
    const markdown = await clipboard(page);
    expect(markdown).toContain('# JSON 转换报告');
    expect(markdown).toContain('```json');
    await output.getByRole('button', { name: '查看源代码' }).click();
    await expect(output.getByRole('region', { name: 'Markdown 预览' })).toBeHidden();
    await input(page, '{"updated":true}');
    await expect(page.locator('.transform-status-row [role="status"]')).toHaveText('转换成功');
    await expect(output.getByRole('button', { name: '切换到预览' })).toBeVisible();
    await output.getByRole('button', { name: '复制 Markdown', exact: true }).click();
    expect(await clipboard(page)).toContain('"updated": true');
    await output.getByRole('button', { name: '切换到预览' }).click();
    await expect(output.getByRole('heading', { name: 'JSON 转换报告' })).toBeVisible();
    await output.getByRole('button', { name: '复制代码块 1' }).click();
    expect(JSON.parse(await clipboard(page))).toEqual({ updated: true });
    await page.screenshot({ path: `test-results/transform-markdown-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('动态语言覆盖默认配置，别名可用，重新进入 Markdown 时恢复默认预览', async ({ page }) => {
  await fs.copyFile('docs/examples/transform-dynamic-language.md', file);
  await page.goto(route);
  const output = page.getByRole('region', { name: '输出区', exact: true });
  const language = output.locator('.language');
  await input(page, ' MD \n# first');
  await expect(output.getByRole('heading', { name: 'first' })).toBeVisible();
  await output.getByRole('button', { name: '查看源代码' }).click();
  await input(page, 'md\n# second');
  await expect(page.locator('.transform-status-row [role="status"]')).toHaveText('转换成功');
  await expect(output.getByRole('button', { name: '切换到预览' })).toBeVisible();
  await input(page, 'json\n{"fresh":true}');
  await expect(language).toHaveText('json');
  await expect(output.getByRole('button', { name: '切换到预览' })).toHaveCount(0);
  await output.getByRole('button', { name: '复制结果' }).click();
  expect(await clipboard(page)).toBe('{"fresh":true}');
  await input(page, 'py\nprint("hello")');
  await expect(language).toHaveText('python');
  await input(page, 'custom\nplain output');
  await expect(language).toHaveText('custom');
  await input(page, '\nusing fallback');
  await expect(language).toHaveText('Plain Text');
  await input(page, 'markdown\n# back');
  await expect(output.getByRole('heading', { name: 'back' })).toBeVisible();
  await input(page, 'md\n<script>alert(1)</script>');
  await expect(output.locator('.markdown-preview-content')).toContainText('<script>alert(1)</script>');
  await expect(output.locator('script')).toHaveCount(0);
});

test('返回 JSON 与 Python 示例可运行，配置 Markdown 兼容旧函数和空输出', async ({ page }) => {
  for (const [example, language, expected] of [
    ['transform-output-json', 'json', '"enabled": true'],
    ['transform-json-to-python', 'python', '"missing": None'],
  ]) {
    await fs.copyFile(`docs/examples/${example}.md`, file);
    await page.goto(route);
    await page.getByRole('button', { name: '填入示例', exact: true }).click();
    const output = page.getByRole('region', { name: '输出区', exact: true });
    await expect(output.locator('.language')).toHaveText(language);
    await output.getByRole('button', { name: '复制结果' }).click();
    expect(await clipboard(page)).toContain(expected);
  }
  await writeCode('export default function transform(input) { return { ok: true, output: input === "empty" ? "" : "# fallback", language: " " }; }', 'transform:\n  output_language: md\n');
  await page.goto(route);
  const output = page.getByRole('region', { name: '输出区', exact: true });
  await input(page, 'normal');
  await expect(output.getByRole('heading', { name: 'fallback' })).toBeVisible();
  await input(page, 'empty');
  const copy = output.getByRole('button', { name: '复制 Markdown', exact: true });
  await expect(copy).toBeEnabled();
  await expect(output.locator('.markdown-preview-content')).toHaveText('');
  await copy.click(); expect(await clipboard(page)).toBe('');
});

test('输出代码和 Markdown 可全屏，按钮与 Esc 恢复并保留结果和视图选择', async ({ page }) => {
  test.setTimeout(60_000);
  await fs.copyFile('docs/examples/transform-dynamic-language.md', file);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(route);
    await input(page, 'md\n# Fullscreen output\n\n```python\nprint("hello")\n```');
    const output = page.locator('.transform-output-body');
    const layout = page.locator('.snippet-detail-layout');
    await expect(output.getByRole('heading', { name: 'Fullscreen output' })).toBeVisible();
    const original = await output.boundingBox();
    await output.getByRole('button', { name: '全屏输出' }).click();
    await expect(layout).toHaveClass(/output-focused/);
    await expect(page.getByRole('button', { name: '恢复正文' })).toHaveAttribute('aria-pressed', 'true');
    const full = (await output.boundingBox())!;
    const bounds = (await layout.boundingBox())!;
    expect(full.height).toBeGreaterThan(original!.height);
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(full[key]).toBeCloseTo(bounds[key], 0);
    await expect(page.getByRole('textbox', { name: '转换输入', exact: true })).toBeHidden();
    await output.getByRole('button', { name: '复制代码块 1' }).click();
    expect(await clipboard(page)).toBe('print("hello")');
    await page.screenshot({ path: `test-results/transform-output-fullscreen-${width}.png`, fullPage: true });
    await output.getByRole('button', { name: '查看源代码' }).click();
    if (width > 700) await output.getByRole('textbox', { name: '转换输出', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(layout).not.toHaveClass(/output-focused/);
    await expect(output.getByRole('button', { name: '全屏输出' })).toBeFocused();
    await expect(output.getByRole('button', { name: '切换到预览' })).toBeVisible();
    await expect(output).toHaveCSS('position', 'relative');
    await input(page, 'json\n{"fullscreen":true}');
    await expect(output.locator('.language')).toHaveText('json');
    await output.getByRole('button', { name: '全屏输出' }).click();
    await output.getByRole('button', { name: '复制结果' }).click();
    expect(await clipboard(page)).toBe('{"fullscreen":true}');
    await output.getByRole('button', { name: '恢复正文' }).click();
    await expect(layout).not.toHaveClass(/output-focused/);
    await expect(output.getByRole('button', { name: '全屏输出' })).toBeFocused();
    await page.getByRole('tab', { name: '转换代码', exact: true }).click();
    await page.getByRole('button', { name: '展开代码', exact: true }).click();
    await expect(layout).toHaveClass(/code-focused/);
    await expect(output).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(layout).not.toHaveClass(/code-focused/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
