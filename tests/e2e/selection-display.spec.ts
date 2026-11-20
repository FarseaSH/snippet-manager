import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__selection-display-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const source = 'a \t  \n\nb c';
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));
const selected = '.cm-characterSelectionBackground';
const hints = '.cm-selectedWhitespace';

test.beforeEach(async ({ context }) => {
  test.skip(process.env.APP_TEST_MODE === 'production', '使用临时片段检查选区');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('跨行选区贴合字符，空行和换行只占一格，空格与 Tab 标记不改变复制内容', async ({ page }) => {
  await fs.writeFile(file, `---\nsnippet_name: Selection\nsnippet_tags: []\n---\n\n\`\`\`text\n${source}\n\`\`\``);
  await page.goto(`snippet/${name}`);
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  const editor = page.locator('.cm-editor');
  const input = editor.locator('.cm-content');
  await input.focus();
  await expect(editor.locator(hints)).toHaveCount(0);
  await page.keyboard.press(`${modifier}+a`);
  await expect(editor.locator(hints)).toHaveText(['·', '⇥', '·', '·', '↵', '↵', '·']);
  await expect(editor.locator(selected)).toHaveCount(4);
  await expect(editor.locator('.cm-selectionLayer .cm-selectionBackground').first()).toBeHidden();
  await expect(editor.locator(selected).first()).toHaveCSS('background-color', 'rgb(251, 232, 222)');
  await expect(editor.locator(hints).first()).toHaveCSS('opacity', '0.6');
  await expect(editor.locator('.cm-selectedWhitespaceLayer')).toHaveAttribute('aria-hidden', 'true');

  // Compare backgrounds and tab hints with actual DOM character boxes.
  const geometry = await editor.evaluate(node => {
    const lines = node.querySelectorAll('.cm-line');
    const range = document.createRange();
    range.selectNodeContents(lines[0]);
    const text = range.getBoundingClientRect();
    const boxes = Array.from(node.querySelectorAll('.cm-characterSelectionBackground'), element => {
      const { x, y, width, right } = element.getBoundingClientRect();
      return { x, y, width, right };
    });
    const glyphs = Array.from(node.querySelectorAll('.cm-selectedWhitespace'), element => ({
      symbol: element.textContent, width: element.getBoundingClientRect().width,
    }));
    return { boxes, glyphs, text: { x: text.x, width: text.width }, right: node.getBoundingClientRect().right };
  });
  const cell = geometry.glyphs.find(item => item.symbol === '·')!.width;
  expect(geometry.boxes[0].x).toBeCloseTo(geometry.text.x, 0);
  expect(geometry.boxes[0].width).toBeCloseTo(geometry.text.width, 0);
  expect(geometry.boxes[1].width).toBeCloseTo(cell, 0);
  expect(geometry.boxes[2].width).toBeCloseTo(cell, 0);
  expect(geometry.glyphs.find(item => item.symbol === '⇥')!.width).toBeCloseTo(cell * 2, 0);
  for (const box of geometry.boxes) expect(box.right).toBeLessThan(geometry.right - 100);
  await page.keyboard.press(`${modifier}+c`);
  await expect.poll(() => clipboard(page)).toBe(source);
  await page.screenshot({ path: 'test-results/selection-display.png' });

  await page.keyboard.press(`${modifier}+Home`);
  await expect(editor.locator(hints)).toHaveCount(0);
  for (let index = 0; index < 2; index++) await page.keyboard.press('Shift+ArrowRight');
  await expect(editor.locator(hints)).toHaveText(['·']);
  for (let index = 0; index < 4; index++) await page.keyboard.press('Shift+ArrowRight');
  // Ending exactly at the next line's start does not select its newline.
  await expect(editor.locator(hints)).toHaveText(['·', '⇥', '·', '·', '↵']);
  await page.keyboard.press(`${modifier}+c`);
  await expect.poll(() => clipboard(page)).toBe(source.slice(0, 6));
  await page.getByRole('heading', { name: 'Selection', exact: true }).click();
  await expect(editor.locator(selected).first()).toHaveCSS('background-color', 'rgb(236, 236, 236)');
});

test('转换输入和输出使用相同标记，编辑、撤销、末尾换行和原文复制正常', async ({ page }) => {
  await fs.writeFile(file, '---\nsnippet_name: Editable Selection\nsnippet_tags: []\nsnippet_type: transform\n---\n\n```js\nexport default input => ({ ok: true, output: input });\n```');
  await page.goto(`snippet/${name}`);
  const input = page.getByRole('textbox', { name: '转换输入', exact: true });
  await input.fill(source + '\n');
  await page.keyboard.press(`${modifier}+a`);
  const inputEditor = page.locator('.cm-editor').filter({ has: input });
  await expect(inputEditor.locator(hints)).toHaveText(['·', '⇥', '·', '·', '↵', '↵', '·', '↵']);
  await page.keyboard.press(`${modifier}+c`);
  await expect.poll(() => clipboard(page)).toBe(source + '\n');
  await page.keyboard.type('replacement');
  await expect(inputEditor.locator(hints)).toHaveCount(0);
  await page.keyboard.press(`${modifier}+z`);
  await expect(input).toContainText('b c');
  const output = page.getByRole('region', { name: '输出区', exact: true });
  await expect(output.getByRole('button', { name: '复制结果', exact: true })).toBeEnabled();
  await output.locator('.cm-content').focus();
  await page.keyboard.press(`${modifier}+a`);
  await expect(output.locator(hints)).toHaveText(['·', '⇥', '·', '·', '↵', '↵', '·', '↵']);
  await page.keyboard.press(`${modifier}+c`);
  await expect.poll(() => clipboard(page)).toBe(source + '\n');
});

test('大量选区只绘制视口内标记，折叠和滚动后仍贴合可见代码', async ({ page }) => {
  const code = 'function example() {\n  return 1;\n}\n' + Array.from({ length: 16_000 }, (_, index) => `  line ${index}`).join('\n');
  await fs.writeFile(file, `---\nsnippet_name: Large Selection\nsnippet_tags: []\n---\n\n\`\`\`js\n${code}\n\`\`\``);
  await page.goto(`snippet/${name}`);
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  const input = page.locator('.cm-content');
  await page.locator('.editor-fold-toggle[data-fold="open"]').first().click();
  await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
  await input.focus();
  await page.keyboard.press(`${modifier}+a`);
  await expect.poll(() => page.locator(hints).count()).toBeGreaterThan(5);
  expect(await page.locator(hints).count()).toBeLessThan(500);
  await page.locator('.cm-scroller').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(input).toContainText('line 15999');
  await expect.poll(() => page.locator(hints).count()).toBeGreaterThan(5);
  expect(await page.locator(hints).count()).toBeLessThan(500);
  const scroller = (await page.locator('.cm-scroller').boundingBox())!;
  const background = (await page.locator(selected).last().boundingBox())!;
  expect(background.x + background.width).toBeLessThan(scroller.x + scroller.width - 100);
  await page.keyboard.press(`${modifier}+c`);
  await expect.poll(() => clipboard(page)).toBe(code);
});
