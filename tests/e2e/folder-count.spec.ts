import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__folder-count-${process.pid}`;
const library = path.resolve(process.env.SNIPPETS_DIR || 'snippets');
const fixture = path.resolve(library, name);
function verifyFixture() {
  const relative = path.relative(path.resolve('.generated'), library);
  if (relative.startsWith('..') || path.isAbsolute(relative) || path.dirname(fixture) !== library) throw new Error('数量测试仅允许使用 .generated 内的独立片段库');
}

test.beforeAll(async () => {
  test.skip(process.env.APP_TEST_MODE === 'production');
  verifyFixture();
  await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    const folder = index < 2 ? fixture : index === 2 ? path.join(fixture, 'child') : path.join(fixture, 'child', 'nested');
    await fs.mkdir(folder, { recursive: true });
    // Multiple code Tabs still contribute only one snippet to the count.
    await fs.writeFile(path.join(folder, `sample-${index}.md`), `---\nsnippet_name: Count ${index}\nsnippet_tags: []\n---\n\n## First\n\n\`\`\`text\nfirst\n\`\`\`\n\n## Second\n\n\`\`\`text\nsecond\n\`\`\``);
  }));
});

test.afterAll(async () => {
  if (process.env.APP_TEST_MODE !== 'production') { verifyFixture(); await fs.rm(fixture, { recursive: true, force: true }); }
});

for (const width of [1440, 390]) test(`文件夹数量 ${width}px 在总数和直属数量间过渡，零值淡出，快速切换不排队`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/folder');
  const tree = page.getByRole('navigation', { name: '文件夹导航', exact: true });
  await expect(tree).toHaveClass(/is-ready/);
  const row = (folder: string) => tree.locator(`[data-folder-path="${folder}"]`);
  const parent = row(name);
  const badge = parent.locator('.folder-count');
  const current = badge.locator('.folder-count-current');
  const toggle = parent.locator('.tree-toggle');
  await expect(badge).toHaveAttribute('title', '包含子文件夹：12 个片段');
  await expect(current).toHaveText('12');
  const fullWidth = (await badge.boundingBox())!.width;
  const allCount = await tree.locator('.all-folder .folder-count').textContent();
  await toggle.click();
  await expect(badge).toHaveAttribute('title', '当前文件夹：2 个片段');
  await expect(current).toHaveText('2');
  const middle = await badge.evaluate(node => {
    const current = node.querySelector('.folder-count-current')!;
    const previous = node.querySelector('.folder-count-previous')!;
    const animations = [...current.getAnimations(), ...previous.getAnimations()];
    if (animations.length !== 2) throw new Error('缺少数字切换动画');
    animations.forEach(animation => { animation.pause(); animation.currentTime = 125; });
    const incoming = getComputedStyle(current), outgoing = getComputedStyle(previous);
    const result = { incomingOpacity: Number(incoming.opacity), outgoingOpacity: Number(outgoing.opacity), incomingY: new DOMMatrixReadOnly(incoming.transform).m42, outgoingY: new DOMMatrixReadOnly(outgoing.transform).m42 };
    animations.forEach(animation => animation.play());
    return result;
  });
  expect(middle.incomingOpacity).toBeGreaterThan(0);
  expect(middle.incomingOpacity).toBeLessThan(1);
  expect(middle.outgoingOpacity).toBeGreaterThan(0);
  expect(middle.outgoingOpacity).toBeLessThan(1);
  expect(middle.incomingY).toBeGreaterThan(0);
  expect(middle.outgoingY).toBeLessThan(0);
  await expect.poll(async () => (await badge.boundingBox())!.width).toBeLessThan(fullWidth);
  await expect(badge).toHaveCSS('opacity', '1');
  const child = row(`${name}/child`);
  await expect(child.locator('.folder-count-current')).toHaveText('10');
  await child.locator('.tree-toggle').click();
  await expect(child.locator('.folder-count-current')).toHaveText('1');
  await expect(child.locator('.folder-count')).toHaveAttribute('title', '当前文件夹：1 个片段');
  await expect(row(`${name}/child/nested`).locator('.folder-count-current')).toHaveText('9');
  await expect(tree.locator('.all-folder .folder-count')).toHaveText(allCount!);
  await toggle.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); button.click(); });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(current).toHaveText('12');
  await expect.poll(() => badge.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(badge.locator('.folder-count-previous')).toHaveCSS('opacity', '0');
  await expect.poll(async () => (await badge.boundingBox())!.width).toBeCloseTo(fullWidth, 0);
  const python = row('python');
  await python.locator('.tree-toggle').click();
  await expect(python.locator('.folder-count')).toBeHidden();
  await expect(python.locator('.folder-count')).toHaveAttribute('aria-hidden', 'true');
  await python.locator('.tree-toggle').click();
  await expect(python.locator('.folder-count')).toHaveCSS('opacity', '1');
  await expect(python.locator('.folder-count-current')).toHaveText('3');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await toggle.click();
  await expect(current).toHaveText('2');
  expect(await badge.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  await page.screenshot({ path: `test-results/folder-count-${width}.png` });
});
