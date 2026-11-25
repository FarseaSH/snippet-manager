import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__markdown-selection-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
const route = `snippet/${name}`;
const snippet = (markdown: string) => '---\nsnippet_name: Markdown Selection\nsnippet_tags: []\n---\n\n````md\n' + markdown + '\n````';
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));
const hints = '.preview-whitespace-layer > span';
const backgrounds = '.preview-selection-layer > span';

async function select(code: Locator, from = 0, to?: number) {
  await code.evaluate((node, positions) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const points: { node: Node; start: number; end: number }[] = [];
    let offset = 0;
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      points.push({ node: text, start: offset, end: offset + text.textContent!.length }); offset += text.textContent!.length;
    }
    function point(at: number): [Node, number] {
      const part = points.find(part => part.end >= at)!;
      return [part.node, at - part.start];
    }
    const range = document.createRange();
    range.setStart(...point(positions.from)); range.setEnd(...point(positions.to ?? offset));
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  }, { from, to });
}

test.beforeEach(async ({ context }) => {
  test.skip(process.env.APP_TEST_MODE === 'production');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('跨行选区贴合字符，保留语法颜色，空白标记不进入原生复制内容', async ({ page }) => {
  const source = 'const 中 = "x";\n \t  \n\nconsole.log(中);';
  await fs.writeFile(file, snippet('```js\n' + source + '\n```'));
  await page.goto(route);
  const pre = page.locator('.markdown-preview pre').first(), code = pre.locator('code');
  await expect(pre).toHaveClass(/preview-selection-ready/);
  await expect(pre.locator(hints)).toHaveCount(0);
  await select(code);
  await expect(pre.locator(hints)).toHaveCount(10);
  expect(await pre.locator(hints).evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.symbol)))
    .toEqual(['·', '·', '·', '↵', '·', '⇥', '·', '·', '↵', '↵']);
  await expect(pre.locator(backgrounds)).toHaveCount(6);
  await expect(pre.locator(backgrounds).first()).toHaveCSS('background-color', 'rgb(251, 232, 222)');
  await expect(pre.locator('.preview-whitespace-layer')).toHaveAttribute('aria-hidden', 'true');
  await expect(pre.locator(hints).first()).toHaveCSS('opacity', '0.6');
  const space = (await pre.locator(hints).nth(4).boundingBox())!;
  const tab = (await pre.locator(hints).nth(5).boundingBox())!;
  expect(tab.width).toBeCloseTo(space.width * 3, 0); // One space, then Tab advances to column four.
  const colors = await code.locator('span[style]').evaluateAll(nodes => nodes.map(node => ({
    original: getComputedStyle(node).color, selected: getComputedStyle(node, '::selection').color,
  })));
  expect(new Set(colors.map(color => color.original)).size).toBeGreaterThan(2);
  expect(colors.every(color => color.original === color.selected)).toBe(true);
  const token = code.locator('span[style]').first();
  const color = await token.evaluate(node => getComputedStyle(node).color);
  expect(await token.evaluate(node => getComputedStyle(node, '::selection').color)).toBe(color);
  expect(await token.evaluate(node => getComputedStyle(node, '::selection').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  const geometry = await pre.evaluate(node => ({
    right: node.getBoundingClientRect().right,
    boxes: Array.from(node.querySelectorAll('.preview-selection-layer > span'), box => ({ right: box.getBoundingClientRect().right, width: box.getBoundingClientRect().width })),
  }));
  expect(geometry.boxes.every(box => box.right < geometry.right - 50)).toBe(true);
  expect(geometry.boxes[4].width).toBeLessThan(15); // Empty line gets only a newline cell.
  await page.keyboard.press('Control+c');
  await expect.poll(() => clipboard(page)).toBe(source);
  expect(await code.textContent()).toBe(source);
  await page.screenshot({ path: 'test-results/markdown-selection.png' });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(pre.locator(backgrounds).first()).toHaveCSS('background-color', 'rgb(236, 236, 236)');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await select(code, 0, source.indexOf('\n'));
  await expect(pre.locator('[data-symbol="↵"]')).toHaveCount(0);
  await select(code, source.indexOf('\n') + 1, source.indexOf('\n') + 6);
  await expect(pre.locator(hints)).toHaveCount(5);
  await page.evaluate(() => window.getSelection()!.removeAllRanges());
  await expect(pre.locator(hints)).toHaveCount(0);
  await expect(pre.locator(backgrounds)).toHaveCount(0);
});

test('真实拖选与水平、垂直滚动保持对齐，长代码只绘制可见选区', async ({ page }) => {
  const source = Array.from({ length: 100 }, (_, index) => `line${index} \t ${'value '.repeat(80)}`).join('\n');
  await fs.writeFile(file, snippet('```text\n' + source + '\n```'));
  await page.goto(route);
  const pre = page.locator('.markdown-preview pre').first(), code = pre.locator('code');
  await expect(pre).toHaveClass(/preview-selection-ready/);
  const start = await code.evaluate(node => {
    const firstText = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(firstText, 0); range.setEnd(firstText, 5);
    const rect = range.getBoundingClientRect(); return { x: rect.left, y: rect.top + rect.height / 2, right: rect.right };
  });
  await page.mouse.move(start.x + .5, start.y); await page.mouse.down();
  await page.mouse.move(start.right + .5, start.y, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()!.toString())).toBe('line0');
  await expect(pre.locator(backgrounds)).toHaveCount(1);
  await expect(pre.locator(backgrounds).first()).toHaveCSS('background-color', 'rgb(251, 232, 222)');
  await select(code);
  const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
  await preview.evaluate(node => { node.scrollTop = 600; });
  await pre.evaluate(node => { node.scrollLeft = 350; });
  await expect.poll(async () => {
    const clip = (await preview.boundingBox())!;
    const boxes = await pre.locator(backgrounds).evaluateAll(nodes => nodes.map(node => ({ top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom })));
    return boxes.length > 0 && boxes.length < 60 && boxes.every(box => box.bottom > clip.y && box.top < clip.y + clip.height);
  }).toBe(true);
  await page.keyboard.press('Control+c');
  await expect.poll(() => clipboard(page)).toBe(source);
});

test('跨多个代码块与正文选择、HTML 源码切换均保留原生选区', async ({ page }) => {
  const html = '<p>hello world</p>\n\t<p>next</p>';
  await fs.writeFile(file, snippet('```js\nconst x = 1;\n```\n\nBetween blocks.\n\n```text\nlast line\n```\n\n```html\n' + html + '\n```'));
  await page.goto(route);
  const pres = page.locator('.markdown-preview pre');
  await expect(pres.first()).toHaveClass(/preview-selection-ready/);
  await pres.first().evaluate(node => {
    const other = document.querySelectorAll('.markdown-preview pre')[1];
    const range = document.createRange(); range.setStart(node.querySelector('code')!, 0); range.setEndAfter(other.querySelector('code')!);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  });
  await expect(pres.nth(0).locator(hints)).toHaveCount(3);
  await expect(pres.nth(1).locator(hints)).toHaveCount(1);
  await page.keyboard.press('Control+c');
  const copied = await clipboard(page);
  expect(copied).toContain('const x = 1;'); expect(copied).toContain('Between blocks.'); expect(copied).toContain('last line');
  expect(copied).not.toMatch(/[·⇥↵]/);
  const block = page.locator('.preview-code-block').last();
  await expect(block.locator('.preview-selection-ready')).toHaveCount(0);
  await block.getByRole('button', { name: '预览', exact: true }).click();
  const source = block.locator('pre');
  await expect(source).toHaveClass(/preview-selection-ready/);
  await select(source.locator('code'));
  await expect(source.locator(hints)).toHaveCount(3);
  await page.keyboard.press('Control+c'); await expect.poll(() => clipboard(page)).toBe(html);
  await block.getByRole('button', { name: '预览', exact: true }).click();
  await expect(block.locator('.preview-selection-ready')).toHaveCount(0);
});

test('转换 Markdown 更新与全屏、源码切换时，选区正确重测和清理', async ({ page }) => {
  await fs.writeFile(file, '---\nsnippet_name: Selection Transform\nsnippet_tags: []\nsnippet_type: transform\n---\n\n```js\nexport default input => ({ ok: true, language: "markdown", output: "```js\\n" + input + "\\n```" });\n```');
  await page.goto(route);
  const input = page.getByRole('textbox', { name: '转换输入', exact: true });
  const output = page.getByRole('region', { name: '输出区', exact: true });
  // Fullscreen hides the enclosing region while making its output body visible.
  const pre = page.locator('#transform-output .markdown-preview pre');
  await input.fill('const x = 1;');
  await expect(pre).toHaveClass(/preview-selection-ready/);
  await select(pre.locator('code'));
  await expect(pre.locator(hints)).toHaveCount(3);
  await output.getByRole('button', { name: '全屏输出', exact: true }).click();
  await expect(pre.locator(hints)).toHaveCount(3);
  await expect.poll(async () => {
    const cell = (await pre.locator(hints).first().boundingBox())!;
    const area = (await pre.boundingBox())!;
    return cell.x >= area.x && cell.y >= area.y && cell.y + cell.height <= area.y + area.height;
  }).toBe(true);
  await page.keyboard.press('Control+c'); await expect.poll(() => clipboard(page)).toBe('const x = 1;');
  await page.keyboard.press('Escape');
  await input.fill('const updated = 2;\n\nend');
  await expect(pre.locator('code')).toHaveText('const updated = 2;\n\nend');
  await expect(pre.locator(hints)).toHaveCount(0);
  await select(pre.locator('code'));
  await expect(pre.locator(hints)).toHaveCount(5);
  await output.getByRole('button', { name: '查看源代码', exact: true }).click();
  await expect(output.locator('.preview-selection-ready')).toHaveCount(0);
  await output.getByRole('button', { name: '切换到预览', exact: true }).click();
  await expect(pre).toHaveClass(/preview-selection-ready/);
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await expect(output.locator('.preview-selection-layer')).toHaveCount(0);
});

test('窄屏代码选择不撑宽页面，取消选择后恢复普通展示', async ({ page }) => {
  await fs.writeFile(file, snippet('```js\nconst 中文 = "mixed text";\n\tconsole.log(中文);\n```'));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(route);
  const pre = page.locator('.markdown-preview pre').first();
  await expect(pre).toHaveClass(/preview-selection-ready/);
  await page.locator('.detail-drawer').evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished)); });
  await select(pre.locator('code'));
  await expect(pre.locator(hints)).not.toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/markdown-selection-mobile.png' });
  await page.evaluate(() => window.getSelection()!.removeAllRanges());
  await expect(pre.locator(backgrounds)).toHaveCount(0);
  await expect(pre.locator(hints)).toHaveCount(0);
});
