import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__fullscreen-shortcut-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
const route = `snippet/${name}`;
const front = '---\nsnippet_name: Fullscreen Shortcut\nsnippet_tags: []\n---\n\n';
const snippet = (parts: [string, string, string][]) => front + parts.map(([title, language, code]) => `# ${title}\n\n\`\`\`\`${language}\n${code}\n\`\`\`\``).join('\n\n');
const hotkey = 'Control+Shift+F';
test.beforeEach(() => { test.skip(process.env.APP_TEST_MODE === 'production', '使用临时片段验证全屏快捷键'); });
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('代码全屏可重复切换，长按只切换一次，保留折叠和 Ctrl+F 查找', async ({ page }) => {
  const code = 'function example() {\n  return "retained";\n}\n' + Array.from({ length: 100 }, (_, index) => `// line ${index}`).join('\n');
  await fs.writeFile(file, snippet([['Code', 'js', code]]));
  await page.goto(route);
  const editor = page.locator('.code-editor');
  await expect(editor).toHaveAttribute('data-state', 'ready');
  await editor.locator('.editor-fold-toggle[data-fold="open"]').first().click();
  await page.locator('.cm-content').focus();
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.down('F');
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
  await page.keyboard.down('F');
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
  await page.keyboard.up('F');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
  await expect(page.getByRole('button', { name: '展开代码', exact: true })).toBeFocused();
  await expect(editor.locator('.cm-foldPlaceholder')).toHaveCount(1);
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+f');
  const find = page.getByRole('textbox', { name: 'Find', exact: true });
  await expect(find).toBeVisible();
  await find.fill('line');
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
  await expect(find).toHaveValue('line');
  await page.keyboard.press('Escape');
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
});

test('Markdown 预览与源码都支持同键切换，全屏切换保留视图和参数', async ({ page }) => {
  await fs.writeFile(file, snippet([['Markdown', 'md', '# @name::Report@\n\n正文\n\n```js\nconsole.log(1)\n```']]));
  await page.goto(route);
  await page.getByRole('textbox', { name: 'name', exact: true }).fill('Changed');
  const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
  await expect(preview.getByRole('heading', { name: 'Changed' })).toBeVisible();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
  await expect(preview).toBeVisible();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
  await page.getByRole('button', { name: '查看源代码', exact: true }).click();
  await page.locator('.cm-content').focus();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
  await expect(page.getByRole('button', { name: '切换到预览', exact: true })).toBeVisible();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
  await expect(page.getByRole('textbox', { name: 'name', exact: true })).toHaveValue('Changed');
});

test('HTML iframe 内切换全屏并保留交互，隐藏页面和伪造消息不改变当前窗口', async ({ page }) => {
  const html = '<button id="count" onclick="this.textContent=Number(this.textContent)+1">0</button><input aria-label="留言">';
  await fs.writeFile(file, snippet([['index.html', 'html', html], ['Other', 'js', 'console.log(1)']]));
  await page.goto(route);
  const frame = page.frameLocator('iframe[title="index.html HTML 预览"]');
  await frame.locator('#count').click();
  await frame.getByRole('textbox').fill('保留输入');
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
  await expect(frame.locator('#count')).toHaveText('1');
  await expect(frame.getByRole('textbox')).toHaveValue('保留输入');
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
  await expect(frame.getByRole('textbox')).toHaveValue('保留输入');
  await frame.getByRole('textbox').focus();
  await page.keyboard.press('Meta+Shift+F');
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
  await page.keyboard.press('Meta+Shift+F');
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
  await page.getByRole('tab', { name: 'Other', exact: true }).click();
  await page.evaluate(() => window.postMessage({ channel: 'snippet-html', type: 'toggle-fullscreen', token: 'spoof' }, '*'));
  const inactive = await (await page.locator('iframe[title="index.html HTML 预览"]').elementHandle())!.contentFrame();
  await page.evaluate(() => {
    const receive = (event: MessageEvent) => {
      if (event.source === window || event.data?.channel !== 'snippet-html' || event.data.type !== 'toggle-fullscreen') return;
      removeEventListener('message', receive);
      requestAnimationFrame(() => { document.body.dataset.fullscreenSignalReceived = 'true'; });
    };
    addEventListener('message', receive);
  });
  await inactive!.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true })));
  await expect(page.locator('body')).toHaveAttribute('data-fullscreen-signal-received', 'true');
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
});

test('转换页根据激活的输入、输出或源码切换，代码与 Markdown 输出均可重复切换', async ({ page }) => {
  await fs.copyFile('docs/examples/transform-dynamic-language.md', file);
  await page.goto(route);
  const input = page.getByRole('textbox', { name: '转换输入', exact: true });
  await input.fill('md\n# Output report');
  const output = page.locator('#transform-output');
  await expect(output.getByRole('heading', { name: 'Output report' })).toBeVisible();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/input-focused/);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/output-focused/);
  await output.getByRole('button', { name: '查看源代码', exact: true }).click();
  await output.locator('.cm-content').focus();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/output-focused/);
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/output-focused/);
  await input.fill('json\n{"retained":true}');
  await expect(output.locator('.language')).toHaveText('JSON');
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/input-focused/);
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/output-focused/);
  await page.getByRole('tab', { name: '转换代码', exact: true }).click();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/output-focused/);
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
  await expect(page.getByRole('button', { name: '展开代码', exact: true })).toBeFocused();
});

test('内嵌 HTML 预览只切换当前一层，退出后保留外层全屏和 iframe 状态', async ({ page }) => {
  await fs.copyFile('docs/examples/markdown-html-preview.md', file);
  await page.goto(route);
  await expect(page.frameLocator('iframe[title="代码块 2 HTML 预览"]').locator('#counter')).toBeVisible();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
  const block = page.locator('[data-preview-html="1"]');
  const count = page.frameLocator('iframe[title="代码块 2 HTML 预览"]').locator('#counter');
  await count.click();
  await page.keyboard.press(hotkey);
  await expect(page.getByRole('dialog', { name: 'HTML 代码块 2', exact: true })).toBeVisible();
  await expect(count).toHaveText('点击次数：1');
  await page.keyboard.press(hotkey);
  await expect(page.locator('.html-code-dialog:modal')).toHaveCount(0);
  await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
  await expect(count).toHaveText('点击次数：1');
  await block.getByRole('button', { name: '全屏代码块 2', exact: true }).focus();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.html-code-dialog:modal')).toHaveCount(1);
  await page.getByRole('button', { name: '退出代码块 2 全屏', exact: true }).focus();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.html-code-dialog:modal')).toHaveCount(0);
  await page.getByRole('button', { name: '恢复正文', exact: true }).focus();
  await page.keyboard.press(hotkey);
  await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
});

test('窄屏可用快捷键切换，退出全屏后仍留在详情抽屉', async ({ page }) => {
  await fs.writeFile(file, snippet([['Code', 'text', 'code'], ['Markdown', 'md', '# Mobile preview']]));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);
  const drawer = page.getByRole('dialog', { name: '片段详情', exact: true });
  await expect(drawer).toHaveCSS('transform', 'none');
  for (const title of ['Code', 'Markdown']) {
    await page.getByRole('tab', { name: title, exact: true }).click();
    await page.keyboard.press(hotkey);
    await expect(page.locator('.snippet-detail-layout')).toHaveClass(/code-focused/);
    await page.keyboard.press(hotkey);
    await expect(page.locator('.snippet-detail-layout')).not.toHaveClass(/code-focused/);
    await expect(drawer).toBeVisible();
  }
});
