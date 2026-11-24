import { test, expect, type Page } from '@playwright/test';

async function centered(page: Page, anchor = '.detail-region') {
  await expect(page.locator('.toast')).toHaveClass(/visible/);
  await expect.poll(async () => {
    const bubble = (await page.locator('.toast').boundingBox())!;
    const area = anchor ? (await page.locator(anchor).boundingBox())! : { x: 0, width: page.viewportSize()!.width };
    return Math.abs(bubble.x + bubble.width / 2 - area.x - area.width / 2);
  }).toBeLessThan(1);
}
test.beforeEach(async ({ context }) => { await context.grantPermissions(['clipboard-read', 'clipboard-write']); });
test('消息对齐正文栏，分栏调整与全屏后跟随，离开正文回退窗口中心', async ({ page }) => {
  await page.goto('snippet/python/files/read-json');
  const copy = page.getByRole('button', { name: '复制当前代码', exact: true });
  await copy.click(); await centered(page);
  await page.getByRole('separator', { name: '调整片段列表宽度', exact: true }).press('ArrowRight');
  await centered(page);
  await expect(page.locator('.toast')).toHaveCSS('bottom', '28px');
  await page.getByRole('button', { name: '展开代码', exact: true }).click();
  await copy.click(); await centered(page);
  await page.getByRole('button', { name: '首页', exact: true }).click();
  await centered(page, '');
});
test('窄屏详情与手机安全区保持居中，长文案限制在正文范围内', async ({ page }) => {
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('snippet/python/files/read-json');
    await page.getByRole('button', { name: '复制当前代码', exact: true }).click();
    await centered(page);
    await page.locator('.toast > span').evaluate(node => { node.textContent = '这是很长的消息文案'.repeat(20); });
    const bubble = (await page.locator('.toast').boundingBox())!;
    const detail = (await page.locator('.detail-region').boundingBox())!;
    expect(bubble.x).toBeGreaterThanOrEqual(detail.x + 15);
    expect(bubble.x + bubble.width).toBeLessThanOrEqual(detail.x + detail.width - 15);
    await expect(page.locator('.toast')).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('.toast')).toHaveAttribute('aria-live', 'polite');
  }
});
