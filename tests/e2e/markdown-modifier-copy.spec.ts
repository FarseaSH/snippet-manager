import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__markdown-copy-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
const route = `snippet/${name}`;
const snippet = (code: string) => '---\nsnippet_name: Markdown Copy\nsnippet_tags: []\n---\n\n````md\n' + code + '\n````';
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));
test.beforeEach(async ({ context }) => {
  test.skip(process.env.APP_TEST_MODE === 'production');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('多代码块复制保留原文、按钮反馈和 DOM，修饰键拖动不复制，失败可以重试', async ({ page }) => {
  const first = 'alpha\n\t beta  \n\nend';
  await fs.writeFile(file, snippet('Inline `value`.\n\n```unknown\n' + first + '\n```\n\n> ```\n> nested\n> ```'));
  await page.goto(route);
  const blocks = page.locator('.markdown-preview .preview-code-block');
  await expect(blocks).toHaveCount(2);
  await blocks.first().locator('pre').evaluate(node => node.setAttribute('data-identity', 'keep'));
  await page.keyboard.down('Control');
  const overlay = blocks.first().locator('.markdown-code-copy');
  await expect(overlay).toBeVisible();
  const header = (await blocks.first().locator('.preview-code-header').boundingBox())!;
  const box = (await overlay.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  await overlay.click();
  await expect.poll(() => clipboard(page)).toBe(first);
  await expect(overlay).toContainText('已复制代码');
  await expect(blocks.first().locator('.preview-copy')).toHaveClass(/copied/);
  await blocks.nth(1).locator('.markdown-code-copy').click();
  await expect.poll(() => clipboard(page)).toBe('nested');
  await expect(blocks.first().locator('pre')).toHaveAttribute('data-identity', 'keep');
  await page.evaluate(() => navigator.clipboard.writeText('sentinel'));
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + 45, box.y + 15, { steps: 5 }); await page.mouse.up();
  expect(await clipboard(page)).toBe('sentinel');
  await page.keyboard.down('Shift');
  await expect(page.locator('.markdown-code-copy.is-active')).toHaveCount(0);
  await page.keyboard.up('Shift');
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('denied'); } });
    document.execCommand = () => false;
  });
  await overlay.click();
  await expect(overlay).toContainText('复制失败，请重试');
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (text: string) => { document.documentElement.dataset.copied = text; } }); });
  await overlay.click();
  await expect(overlay).toContainText('已复制代码');
  await page.keyboard.up('Control');
  await expect(overlay).toBeHidden();
});

test('长代码滚动时提示位于可见区域，水平滚动和全文复制正常', async ({ page }) => {
  const code = Array.from({ length: 120 }, (_, i) => `line ${i} ${'x'.repeat(200)}`).join('\n');
  await fs.writeFile(file, snippet('```text\n' + code + '\n```'));
  await page.goto(route);
  const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
  await expect(preview).toBeVisible();
  await page.keyboard.down('Control');
  await preview.evaluate(node => { node.scrollTop = 500; });
  const overlay = preview.locator('.markdown-code-copy');
  await expect(overlay).toBeVisible();
  await expect.poll(async () => {
    const visible = (await preview.boundingBox())!, area = (await overlay.boundingBox())!;
    return area.y >= visible.y - 1 && area.y + area.height <= visible.y + visible.height + 1;
  }).toBe(true);
  const before = (await overlay.boundingBox())!;
  await preview.locator('pre').evaluate(node => { node.scrollLeft = 300; });
  await expect.poll(async () => (await overlay.boundingBox())!.x).toBeCloseTo(before.x, 0);
  await overlay.click();
  await expect.poll(() => clipboard(page)).toBe(code);
  expect(await preview.evaluate(node => node.scrollTop)).toBe(500);
  await page.keyboard.up('Control');
});

test('Mac 使用 ⌘，HTML 仅源码出现遮罩，预览按钮仍可操作', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { value: 'MacIntel' }));
  const code = '<button onclick="this.textContent=\'clicked\'">click</button>';
  await fs.writeFile(file, snippet('```html\n' + code + '\n```'));
  await page.goto(route);
  const block = page.locator('[data-preview-html]');
  await page.keyboard.down('Meta');
  await expect(block.locator('.markdown-code-copy')).toHaveCount(0);
  const button = block.frameLocator('iframe').getByRole('button');
  await button.click(); await expect(button).toHaveText('clicked');
  await page.keyboard.up('Meta');
  await block.getByRole('button', { name: '预览', exact: true }).click();
  await page.keyboard.down('Control');
  await expect(block.locator('.markdown-code-copy')).toBeHidden();
  await page.keyboard.up('Control');
  await page.keyboard.down('Meta');
  await expect(block.locator('.markdown-code-copy')).toContainText('⌘ + 单击复制代码');
  await block.locator('.markdown-code-copy').click();
  await expect.poll(() => clipboard(page)).toBe(code);
  await page.keyboard.up('Meta');
  await block.getByRole('button', { name: '预览', exact: true }).click();
  await expect(button).toHaveText('clicked');
});

test('后台更新期间复制当前可见版本，更新后复制新版本并清除旧反馈', async ({ page }) => {
  await fs.writeFile(file, snippet('```text\n@name::Old@\n```'));
  await page.goto(route);
  const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
  await expect(preview.locator('pre')).toHaveText('Old');
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await page.keyboard.down('Control');
  await page.getByRole('textbox', { name: 'name', exact: true }).fill('New');
  await preview.locator('.markdown-code-copy').click();
  expect(await clipboard(page)).toBe('Old');
  await page.clock.runFor(250);
  await expect(preview.locator('pre')).toHaveText('New');
  await expect(preview.locator('.markdown-code-copy')).toContainText('Ctrl + 单击复制代码');
  await preview.locator('.markdown-code-copy').click();
  expect(await clipboard(page)).toBe('New');
  await page.keyboard.up('Control');
});

test('窗口未收到按键事件时，带修饰键的首次指针单击也能复制', async ({ page }) => {
  await fs.writeFile(file, snippet('```text\nfirst click\n```'));
  await page.goto(route);
  await page.locator('.markdown-preview pre').evaluate(async node => {
    const rect = node.getBoundingClientRect();
    const init = { bubbles: true, ctrlKey: true, button: 0, clientX: rect.left + 10, clientY: rect.top + 10 };
    node.dispatchEvent(new PointerEvent('pointerdown', init));
    await new Promise(resolve => requestAnimationFrame(resolve));
    node.dispatchEvent(new MouseEvent('click', init));
  });
  await expect.poll(() => clipboard(page)).toBe('first click');
});
