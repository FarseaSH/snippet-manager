import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('首次进入和重新打开片段即显示首个 Tab 轮廓，顶部加粗仅延伸至圆弧中段', async ({ page }) => {
  test.skip(process.env.APP_TEST_MODE === 'production', '使用临时片段验证首次挂载');
  const name = `__tab-outline-${process.pid}`;
  const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
  const title = `Tab Outline ${process.pid}`;
  await fs.writeFile(file, `---\nsnippet_name: ${title}\nsnippet_tags: []\n---\n\n` + ['第一个 Tab', 'Second Tab', '最后一个 Tab'].map((label, index) => `# ${label}\n\n\`\`\`text\nTab ${index + 1}\n\`\`\``).join('\n\n'));
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`snippet/${name}`);
      const tabs = page.getByRole('tab');
      const outline = page.locator('.tab-outline');
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
      await expect(outline).toBeVisible();
      await expect.poll(() => outline.locator('.tab-outline-border').getAttribute('d')).toMatch(/^M0 /);
      const accent = outline.locator('.tab-outline-accent');
      const rounded = await accent.evaluate(element => {
        const line = element as SVGPathElement;
        return { height: line.getBBox().height, width: line.getBBox().width, length: line.getTotalLength() };
      });
      expect(rounded.height).toBeCloseTo(5 * (1 - Math.SQRT1_2), 2);
      expect(rounded.width).toBeGreaterThan(10);
      expect(rounded.length).toBeGreaterThan(rounded.width);
      await page.locator('.tabs').screenshot({ path: `test-results/tab-outline-initial-${width}.png` });
      const firstPath = await outline.locator('.tab-outline-border').getAttribute('d');
      await tabs.nth(1).click();
      await expect(outline.locator('.tab-outline-border')).not.toHaveAttribute('d', firstPath!);
      await tabs.last().click();
      await expect(outline).toBeVisible();
      await page.goto('folder');
      await page.getByLabel('搜索代码片段').fill(title);
      await page.locator('.snippet-item').click();
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
      await expect(outline).toBeVisible();
    }
  } finally { await fs.rm(file, { force: true }); }
});
