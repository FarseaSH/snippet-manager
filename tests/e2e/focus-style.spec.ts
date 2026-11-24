import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__focus-style-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
test.beforeEach(() => { test.skip(process.env.APP_TEST_MODE === 'production'); });
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('按钮、Tab 和描述框无焦点装饰，输入框鼠标与键盘聚焦保留橙框，错误优先', async ({ page }) => {
  await fs.writeFile(file, '---\nsnippet_name: Focus Style\nsnippet_tags: []\n---\n\n' + 'Long description.\n\n'.repeat(30) + '# First\n\n```text\n@a::value@ @b::other@ @empty@\n```\n\n# Second\n\n```text\nother\n```');
  await page.goto(`snippet/${name}`);
  await page.mouse.move(5, 5);
  const button = page.getByRole('button', { name: '复制 Markdown URL', exact: true });
  const color = await button.evaluate(node => getComputedStyle(node).color);
  await button.focus();
  await expect(button).toHaveCSS('outline-style', 'none');
  await expect(button).toHaveCSS('color', color);
  const first = page.getByRole('tab', { name: 'First', exact: true });
  await first.focus();
  await expect(first).toHaveCSS('outline-style', 'none');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await first.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Second', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: 'Second', exact: true }).press('ArrowLeft');
  const a = page.getByRole('textbox', { name: 'a', exact: true });
  const b = page.getByRole('textbox', { name: 'b', exact: true });
  await a.click();
  await expect(a).toHaveCSS('border-top-color', 'rgb(249, 115, 22)');
  await expect(a).toHaveCSS('border-top-width', '2px');
  await a.press('Tab');
  await expect(b).toBeFocused();
  await expect(b).toHaveCSS('border-top-color', 'rgb(249, 115, 22)');
  const empty = page.getByRole('textbox', { name: 'empty', exact: true });
  await empty.focus(); await expect(empty).toHaveCSS('border-top-color', 'rgb(220, 38, 38)');
  const description = page.getByRole('region', { name: '说明', exact: true });
  await page.locator('.description-disclosure').first().focus();
  await expect(page.locator('.description').first()).toHaveCSS('outline-style', 'none');
});

test('仅转换可编辑输入聚焦加粗，输出和内部按钮聚焦保持常态，手机输入同样有效', async ({ page }) => {
  await fs.writeFile(file, '---\nsnippet_name: Transform Focus\nsnippet_tags: []\nsnippet_type: transform\n---\n\n```js\nexport default input => input === "bad" ? ({ ok: false, error: { message: "Invalid" } }) : ({ ok: true, output: input });\n```');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`snippet/${name}`);
    const input = page.getByRole('textbox', { name: '转换输入', exact: true });
    const inputBody = page.locator('.transform-input-body');
    await input.click();
    await expect(inputBody).toHaveCSS('border-top-color', 'rgb(249, 115, 22)');
    await expect(inputBody).toHaveCSS('border-top-width', '2px');
    await input.fill('valid');
    const output = page.getByRole('region', { name: '输出区', exact: true });
    const copy = output.getByRole('button', { name: '复制结果', exact: true });
    await expect(copy).toBeEnabled();
    await copy.focus();
    await expect(copy).toHaveCSS('outline-style', 'none');
    await expect(output.locator('.transform-output-body')).toHaveCSS('border-top-color', 'rgb(111, 121, 135)');
    await expect(output.locator('.transform-output-body')).toHaveCSS('border-top-width', '1px');
    if (width > 700) {
      await output.locator('.cm-content').focus();
      await expect(output.locator('.transform-output-body')).toHaveCSS('border-top-width', '1px');
    }
    await input.fill('bad'); await expect(page.locator('#transform-input-error')).toHaveText('Invalid');
    await input.focus(); await expect(inputBody).toHaveCSS('border-top-color', 'rgb(220, 38, 38)');
  }
});
