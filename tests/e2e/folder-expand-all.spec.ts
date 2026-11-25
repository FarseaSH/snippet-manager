import { test, expect } from '@playwright/test';

test('文件夹标题右侧批量展开和折叠所有层级，不改变选择；手动收起根目录后恢复展开入口', async ({ page }) => {
  await page.goto('/folder');
  const tree = page.getByRole('navigation', { name: '文件夹导航', exact: true });
  const selected = () => tree.locator('[aria-current="page"]').getAttribute('class');
  const before = await selected();
  const expand = tree.getByRole('button', { name: '全部展开', exact: true });
  await expect(expand).toBeVisible();
  await expect(expand).toHaveText('');
  await expect(expand).toHaveAttribute('title', '全部展开');
  const heading = (await tree.locator('.folder-tree-heading').boundingBox())!, button = (await expand.boundingBox())!;
  expect(button.x + button.width).toBeCloseTo(heading.x + heading.width, 0);
  await expand.click();
  await expect(tree.locator('[data-folder-path="python/files/json"]')).toBeVisible();
  expect(await selected()).toBe(before);
  expect(await tree.locator('.tree-toggle').evaluateAll(nodes => nodes.every(node => node.getAttribute('aria-expanded') === 'true'))).toBe(true);
  const collapse = tree.getByRole('button', { name: '全部折叠', exact: true });
  await expect(collapse).toHaveText('');
  await expect(collapse).toHaveAttribute('title', '全部折叠');
  await collapse.click();
  await expect(tree.locator('[data-folder-path="python/files/json"]')).toHaveCount(0);
  await expect(tree.getByRole('button', { name: '全部展开', exact: true })).toBeVisible();
  expect(await selected()).toBe(before);
  await expand.click();
  await tree.locator('[data-folder-path="python"] > .tree-toggle').click();
  // Other fixture roots can also have children. Close only currently visible roots.
  for (const toggle of await tree.locator('.folder-tree-scroll > ul > li > .folder-row > .tree-toggle[aria-expanded="true"]').all()) await toggle.click();
  await expect(expand).toBeVisible();
  await expand.click();
  await expect(tree.locator('[data-folder-path="python/files/json"]')).toBeVisible();
  await page.screenshot({ path: 'test-results/folder-expand-all.png' });
});
