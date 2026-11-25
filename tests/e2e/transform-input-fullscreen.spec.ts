import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__input-fullscreen-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
const hotkey = 'Control+Shift+F';
test.beforeEach(async () => {
  test.skip(process.env.APP_TEST_MODE === 'production');
  await fs.copyFile('docs/examples/transform-json-to-markdown.md', file);
});
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('输入全屏保留同一编辑器、工具栏、撤销历史及状态，Esc 优先关闭查找', async ({ page }) => {
  await page.goto(`snippet/${name}`);
  const input = page.getByRole('textbox', { name: '转换输入', exact: true });
  const layout = page.locator('.snippet-detail-layout');
  await input.fill('{"hello":1}');
  const frame = page.locator('.transform-input-body');
  await expect(page.locator('.transform-input-editor > .transform-editor-heading .code-wrap-button')).toHaveCount(0);
  const bounds = (await frame.boundingBox())!;
  for (const button of [frame.locator('.code-wrap-button'), frame.getByRole('button', { name: '全屏输入', exact: true })]) {
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThan(bounds.x); expect(box.y).toBeGreaterThan(bounds.y);
    expect(box.x + box.width).toBeLessThan(bounds.x + bounds.width);
    expect(box.y + box.height).toBeLessThan(bounds.y + bounds.height);
  }
  await input.evaluate(node => node.setAttribute('data-instance', 'same'));
  await page.keyboard.press(hotkey);
  await expect(layout).toHaveClass(/input-focused/);
  await expect(input).toHaveAttribute('data-instance', 'same');
  await expect(page.getByRole('button', { name: '填入示例', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '清空', exact: true })).toBeVisible();
  await expect(page.locator('.transform-input-status')).toContainText('转换成功');
  await page.keyboard.press('Control+f');
  await expect(page.locator('.cm-search')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-search')).toHaveCount(0);
  await expect(layout).toHaveClass(/input-focused/);
  await page.keyboard.press('Escape');
  await expect(layout).not.toHaveClass(/input-focused/);
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('data-instance', 'same');
  await page.keyboard.press('Control+z');
  await expect(input).toHaveText('');
});

test('激活按实际点击与焦点选择，区域外点击回退输入，预览和工具栏归属输出', async ({ page }) => {
  await page.goto(`snippet/${name}`);
  const input = page.getByRole('textbox', { name: '转换输入', exact: true });
  const layout = page.locator('.snippet-detail-layout');
  await input.fill('{"hello":1}');
  const preview = page.locator('#transform-output .markdown-preview');
  await expect(preview.locator('h1')).toBeVisible();
  await preview.locator('h1').click();
  await page.keyboard.press(hotkey); await expect(layout).toHaveClass(/output-focused/);
  await page.keyboard.press(hotkey); await expect(layout).not.toHaveClass(/output-focused/);
  await page.locator('.snippet-heading h1').click();
  await preview.hover();
  await page.keyboard.press(hotkey); await expect(layout).toHaveClass(/input-focused/);
  await page.keyboard.press(hotkey); await expect(layout).not.toHaveClass(/input-focused/);
  await page.locator('#transform-output').getByRole('button', { name: '查看源代码', exact: true }).focus();
  await page.keyboard.press(hotkey); await expect(layout).toHaveClass(/output-focused/);
  await page.keyboard.press(hotkey);
});

test('窄屏输入放大支持 textarea、填入示例和校验错误，退出仍在详情', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`snippet/${name}`);
  const input = page.getByRole('textbox', { name: '转换输入', exact: true });
  await page.getByRole('button', { name: '全屏输入', exact: true }).click();
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/input-focused/);
  await expect(page.locator('.transform-input-body').getByRole('button', { name: '恢复正文', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '填入示例', exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).not.toHaveValue('');
  await input.fill('bad');
  await expect(page.locator('.transform-input-error')).toHaveText('请输入有效的 JSON 文本');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/transform-input-mobile.png' });
  await page.getByRole('button', { name: '恢复正文', exact: true }).click();
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/input-focused/);
  await expect(page.getByRole('dialog', { name: '片段详情', exact: true })).toBeVisible();
});
