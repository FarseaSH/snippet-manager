import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__folder-scroll-${process.pid}`;
const library = path.resolve(process.env.SNIPPETS_DIR || 'snippets');
const fixture = path.resolve(library, name);
function verifyFixture() {
  const generated = path.relative(path.resolve('.generated'), library);
  if (generated.startsWith('..') || path.isAbsolute(generated) || path.dirname(fixture) !== library) throw new Error('目录滚动测试仅允许使用 .generated 内的独立片段库');
}
test.beforeAll(async () => {
  test.skip(process.env.APP_TEST_MODE === 'production');
  verifyFixture();
  await Promise.all(Array.from({ length: 36 }, async (_, index) => {
    const directory = path.join(fixture, `folder-${String(index).padStart(2, '0')}`);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'sample.md'), `---\nsnippet_name: Scroll ${index}\nsnippet_tags: []\n---\n\n\`\`\`text\nvalue\n\`\`\``);
  }));
});
test.afterAll(async () => { if (process.env.APP_TEST_MODE !== 'production') { verifyFixture(); await fs.rm(fixture, { recursive: true, force: true }); } });

for (const width of [1440, 390]) test(`侧边栏 ${width}px 固定头部，仅文件夹列表滚动，键盘定位与批量折叠正常`, async ({ page }) => {
  await page.setViewportSize({ width, height: 640 });
  await page.goto('/folder');
  const tree = page.getByRole('navigation', { name: '文件夹导航', exact: true });
  const scroller = tree.locator('.folder-tree-scroll');
  await expect(scroller).toHaveCSS('--list-scrollbar-thumb', 'rgba(0, 0, 0, 0)');
  expect(await scroller.evaluate(node => getComputedStyle(node, '::-webkit-scrollbar').width)).toBe('4px');
  const fixed = tree.locator('.folder-tree-fixed');
  const brand = page.locator('.sidebar-brand');
  await tree.getByRole('button', { name: '全部展开', exact: true }).click();
  await expect(tree.locator(`[data-folder-path="${name}/folder-35"]`)).toBeAttached();
  const initialFixed = (await fixed.boundingBox())!, initialBrand = (await brand.boundingBox())!;
  const viewport = (await scroller.boundingBox())!;
  expect(viewport.y).toBeGreaterThanOrEqual(initialFixed.y + initialFixed.height - 1);
  expect(await scroller.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await expect(scroller).toHaveClass(/is-scrolling/);
  await expect(scroller).toHaveCSS('--list-scrollbar-thumb', 'rgb(196, 196, 204)');
  await expect(scroller).not.toHaveClass(/is-scrolling/, { timeout: 2500 });
  await expect(scroller).toHaveCSS('transition-duration', '0.35s');
  await expect(scroller).toHaveCSS('--list-scrollbar-thumb', 'rgba(0, 0, 0, 0)');
  expect((await fixed.boundingBox())!.y).toBe(initialFixed.y);
  expect((await brand.boundingBox())!.y).toBe(initialBrand.y);
  expect(await tree.evaluate(node => node.scrollTop)).toBe(0);
  await expect(tree.getByRole('button', { name: '全部折叠', exact: true })).toBeInViewport();
  await scroller.evaluate(node => { node.scrollTop = 0; });
  const target = tree.locator(`[data-folder-path="${name}/folder-35"] > .folder-select`);
  await target.focus();
  await expect(target).toBeInViewport();
  expect(await scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect((await fixed.boundingBox())!.y).toBe(initialFixed.y);
  await page.keyboard.press('Tab');
  expect((await fixed.boundingBox())!.y).toBe(initialFixed.y);
  await page.screenshot({ path: `test-results/folder-scroll-${width}.png` });
  await tree.getByRole('button', { name: '全部折叠', exact: true }).click();
  await expect(tree.getByRole('button', { name: '全部展开', exact: true })).toBeInViewport();
  expect((await fixed.boundingBox())!.y).toBe(initialFixed.y);
  expect(await tree.evaluate(node => node.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
