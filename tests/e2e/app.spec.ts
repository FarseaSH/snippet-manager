import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const production = process.env.APP_TEST_MODE === 'production';
const renderedLines = (page: Page) => page.locator('.code-fallback .line-numbers span, .monaco-editor .margin-view-overlays .line-numbers');
test('目录图标继承与覆盖，列表路径和窄屏入口一致，配置修改实时生效', async ({ page }) => {
  test.skip(production, '使用临时目录与图标配置验证开发实时读取');
  const prefix = `__Folder-icons-${process.pid}`;
  const directory = path.resolve('snippets', prefix);
  const configFile = path.resolve('snippets/_folders.yml');
  const original = await fs.readFile(configFile, 'utf8');
  const configuration = parseYaml(original);
  const childRules: Record<string, string[]>[] = [{ scripts: ['json[json]'] }];
  const rule: Record<string, typeof childRules> = { [`${prefix}[py]`]: childRules };
  configuration.folders = [...(configuration.folders ?? []), rule];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await fs.mkdir(path.join(directory, 'scripts/deep'), { recursive: true });
    await fs.mkdir(path.join(directory, 'scripts/json'), { recursive: true });
    await fs.writeFile(path.join(directory, 'scripts/deep/a.md'), '---\nsnippet_name: Folder Icon Deep\nsnippet_tags: []\n---\n\n```text\ndeep\n```');
    await fs.writeFile(path.join(directory, 'scripts/json/a.md'), '---\nsnippet_name: Folder Icon JSON\nsnippet_tags: []\n---\n\n```text\njson\n```');
    await fs.writeFile(configFile, stringifyYaml(configuration));
    await page.goto(`folder/${prefix}`);
    const deep = page.locator('.snippet-item').filter({ hasText: 'Folder Icon Deep' });
    const json = page.locator('.snippet-item').filter({ hasText: 'Folder Icon JSON' });
    await expect(deep.locator('.snippet-folder [data-language-icon]')).toHaveAttribute('data-language-icon', 'python');
    await expect(json.locator('.snippet-folder [data-language-icon]')).toHaveAttribute('data-language-icon', 'json');
    const scriptRow = page.locator(`.sidebar [data-folder-path="${prefix}/scripts"]`);
    await expect(page.locator(`.sidebar [data-folder-path="${prefix}"] .folder-select`)).toContainText(prefix);
    await expect(scriptRow.locator('.folder-select [data-language-icon]')).toHaveAttribute('data-language-icon', 'python');
    childRules[0] = { 'scripts[js]': ['json[json]'] };
    await fs.writeFile(configFile, stringifyYaml(configuration));
    await expect(deep.locator('.snippet-folder [data-language-icon]')).toHaveAttribute('data-language-icon', 'javascript');
    await expect(scriptRow.locator('.folder-select [data-language-icon]')).toHaveAttribute('data-language-icon', 'javascript');
    await expect(json.locator('.snippet-folder [data-language-icon]')).toHaveAttribute('data-language-icon', 'json');
    await page.getByLabel('搜索代码片段').fill('Folder Icon');
    await expect(deep.locator('.snippet-folder [data-language-icon]')).toHaveAttribute('data-language-icon', 'javascript');
    await page.getByRole('button', { name: '清空搜索' }).click();
    await page.setViewportSize({ width: 900, height: 850 });
    await expect(page.locator('.folder-picker-button [data-language-icon]')).toHaveAttribute('data-language-icon', 'python');
    await page.locator('.folder-picker-button').click();
    await page.locator(`#folder-picker [data-folder-path="${prefix}/scripts"] .folder-select`).click();
    await expect(page.locator('.folder-picker-button [data-language-icon]')).toHaveAttribute('data-language-icon', 'javascript');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.mobile-subfolders button').filter({ hasText: 'deep' }).locator('[data-language-icon]')).toHaveAttribute('data-language-icon', 'javascript');
    await expect(page.locator('.mobile-subfolders button').filter({ hasText: 'json' }).locator('[data-language-icon]')).toHaveAttribute('data-language-icon', 'json');
    delete rule[`${prefix}[py]`];
    rule[prefix] = childRules;
    childRules[0] = { scripts: ['json[json]'] };
    await fs.writeFile(configFile, stringifyYaml(configuration));
    await expect(deep.locator('.snippet-folder [data-folder-icon="default"]')).toBeVisible();
    await expect(page.locator('.folder-picker-button [data-folder-icon="default"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await fs.writeFile(configFile, original);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

async function readEditorCode(page: Page) {
  if (await page.locator('.code-fallback').count()) return (await page.locator('.code-fallback .code-source code').textContent())!;
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  const textarea = page.locator('.monaco-editor textarea');
  await textarea.focus();
  const modifier = await page.evaluate(() => navigator.platform.includes('Mac') ? 'Meta' : 'Control');
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.press(`${modifier}+C`);
  return page.evaluate(() => navigator.clipboard.readText());
}

test('编辑器首次加载即显示折叠箭头，收起与展开切换正常', async ({ page }) => {
  await page.goto('snippet/python/files/read-json');
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  const expanded = page.locator('.codicon-folding-expanded').first();
  await expect(expanded).toBeVisible();
  const font = await expanded.evaluate(async el => {
    const glyph = getComputedStyle(el, '::before').content;
    await document.fonts.load('16px codicon');
    return {
      family: getComputedStyle(el).fontFamily,
      loaded: [...document.fonts].some(face => face.family.replace(/["']/g, '') === 'codicon' && face.status === 'loaded'),
      glyph,
    };
  });
  expect(font.family).toContain('codicon');
  expect(font.loaded).toBe(true);
  expect(font.glyph).not.toBe('none');
  await page.locator('.code-editor').screenshot({ path: 'test-results/folding-expanded.png' });
  await expanded.click();
  const collapsed = page.locator('.codicon-folding-collapsed').first();
  await expect(collapsed).toBeVisible();
  expect(await collapsed.evaluate(el => getComputedStyle(el, '::before').content)).not.toBe(font.glyph);
  await expect(page.locator('.view-lines')).not.toContainText('data = json.load');
  await page.locator('.code-editor').screenshot({ path: 'test-results/folding-collapsed.png' });
  await collapsed.click();
  await expect(expanded).toBeVisible();
  await expect(page.locator('.view-lines')).toContainText('data = json.load');
});

test('Monaco 只读编辑器支持精确复制与查找，切换代码和窄屏正常', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('snippet/python/http/requests');
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  const source = await readEditorCode(page);
  expect(source).toContain('    params={"page": 1, "limit": 20},');
  expect(source).toContain('\n\nresponse');
  await expect(page.locator('.monaco-editor textarea')).toHaveAttribute('readonly', 'true');
  await page.keyboard.type('this must not change the snippet');
  expect(await readEditorCode(page)).toBe(source);
  const modifier = await page.evaluate(() => navigator.platform.includes('Mac') ? 'Meta' : 'Control');
  await page.keyboard.press(`${modifier}+f`);
  const find = page.getByRole('textbox', { name: 'Find', exact: true });
  await expect(find).toBeVisible();
  await find.fill('requests');
  await expect(page.getByRole('dialog', { name: 'Find / Replace' }).locator('.matchesCount')).toContainText('of');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/monaco-desktop.png', fullPage: true });
  await page.getByRole('tab', { name: 'JSON Response' }).click();
  expect(await readEditorCode(page)).toBe('data = response.json()\nprint(data)');
  await expect(page.locator('.code-statusbar .line-count')).toHaveText('2 行');
  await page.setViewportSize({ width: 900, height: 850 });
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.code-fallback')).toBeVisible();
  await expect(page.locator('.monaco-editor')).toHaveCount(0);
  await page.getByRole('button', { name: '复制当前代码', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('data = response.json()\nprint(data)');
  await page.screenshot({ path: 'test-results/monaco-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  expect(await readEditorCode(page)).toBe('data = response.json()\nprint(data)');
  expect(errors).toEqual([]);
});

test('长代码完整复制、折叠与滚动，JSON 高亮及旧模型释放', async ({ page, context }) => {
  test.skip(production, '使用临时 Markdown 验证长代码与模型生命周期');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const file = path.resolve(`snippets/__editor-long-${process.pid}.md`);
  const source = 'def greet():\n    print("hello")\n    return True\n\n' + Array.from({ length: 120 }, (_, index) => `print("line-${index}-${'x'.repeat(200)}")`).join('\n');
  const json = '{\n  "ok": true\n}';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const runtime = new URL('src/features/snippets/monaco-runtime.ts', test.info().project.use.baseURL).href;
  const modelCount = () => page.evaluate(async url => (await import(/* @vite-ignore */ url)).monaco.editor.getModels().length, runtime);
  try {
    await fs.writeFile(file, `---\nsnippet_name: Editor Long Smoke\nsnippet_tags: []\n---\n\n# Long Python\n\n\`\`\`py\n${source}\n\`\`\`\n\n# JSON\n\n\`\`\`json\n${json}\n\`\`\``);
    await page.goto(`snippet/__editor-long-${process.pid}`);
    await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('.codicon-folding-expanded').first()).toBeVisible();
    await page.locator('.codicon-folding-expanded').first().click();
    await expect(page.locator('.codicon-folding-collapsed').first()).toBeVisible();
    expect(await readEditorCode(page)).toBe(source);
    await page.getByRole('button', { name: '复制当前代码', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
    await expect(page.locator('.code-statusbar .line-count')).toHaveText(`${source.split('\n').length} 行`);
    const modifier = await page.evaluate(() => navigator.platform.includes('Mac') ? 'Meta' : 'Control');
    await page.locator('.monaco-editor textarea').focus();
    await page.keyboard.press(modifier === 'Meta' ? 'Meta+ArrowDown' : 'Control+End');
    await expect(renderedLines(page)).toContainText([String(source.split('\n').length)]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['JSON', 'Long Python', 'JSON']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
      expect(await readEditorCode(page)).toBe(name === 'JSON' ? json : source);
      expect(await modelCount()).toBe(1);
    }
    await page.goto('folder');
    await expect(page.locator('.welcome')).toBeVisible();
    expect(await modelCount()).toBe(0);
    expect(errors).toEqual([]);
  } finally { await fs.rm(file, { force: true }); }
});

test('子片段按语言显示 Logo，未知与缺失类型保留默认图标', async ({ page }) => {
  test.skip(production, '使用临时 Markdown 验证开发实时读取的混合语言');
  const file = path.resolve(`snippets/__language-logo-${process.pid}.md`);
  const parts = [
    ['Python', 'py', 'print("python")', 'python'],
    ['JavaScript', 'js', 'console.log("javascript")', 'javascript'],
    ['Shell', 'sh', 'echo shell', 'bash-prompt'],
    ['Unknown', 'custom-language', 'unknown code', 'fallback'],
    ['No Language', '', 'plain code', 'fallback'],
  ];
  try {
    await page.goto('./');
    await page.getByLabel('搜索代码片段').fill('Icon Logo Smoke');
    await fs.writeFile(file, '---\nsnippet_name: Icon Logo Smoke\nsnippet_tags: []\n---\n\n' + parts.map(([name, lang, code]) => `# ${name}\n\n\`\`\`${lang}\n${code}\n\`\`\``).join('\n\n'));
    await expect(page.locator('.snippet-item')).toHaveCount(1);
    await page.locator('.snippet-item').click();
    await page.locator('.description').click({ position: { x: 8, y: 8 } });
    for (const [name, , code, icon] of parts) {
      const tab = page.getByRole('tab', { name, exact: true });
      await expect(tab.locator('.language-icon')).toHaveAttribute('data-language-icon', icon);
      await tab.click();
      const summary = page.locator('.sub-summary').filter({ has: page.getByRole('button', { name, exact: true }) });
      await expect(summary.locator('[data-language-icon]')).toHaveAttribute('data-language-icon', icon);
      await summary.locator('.sub-summary-icon').click();
      await expect(page.locator('.description-content')).not.toHaveClass(/collapsed/);
      await expect(page.locator('.code-statusbar .language-icon')).toHaveAttribute('data-language-icon', icon);
      await expect(page.locator('.highlighted-code')).toContainText(code);
    }
  } finally { await fs.rm(file, { force: true }); }
});

test('品牌位于左栏，搜索位于中栏，窄屏搜索保持连续输入', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.sidebar .brand')).toBeVisible();
  await expect(page.locator('.snippet-panel .global-search')).toBeVisible();
  await expect(page.locator('.app-header')).toHaveCount(0);
  expect((await page.locator('.app-body').boundingBox())!.y).toBe(0);
  await page.getByLabel('搜索代码片段').fill('json=');
  await expect(page.locator('.snippet-item')).toHaveCount(1);
  await page.getByLabel('搜索代码片段').blur();
  await page.keyboard.press('/');
  await expect(page.getByLabel('搜索代码片段')).toBeFocused();
  await page.setViewportSize({ width: 900, height: 850 });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.snippet-panel .global-search')).toBeVisible();
  await expect(page.getByLabel('搜索代码片段')).toHaveValue('json=');
  await page.screenshot({ path: 'test-results/tablet.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('搜索代码片段')).toHaveCount(1);
  await expect(page.locator('.mobile-controls .global-search')).toBeVisible();
  await page.goto('./');
  await page.getByLabel('搜索代码片段').click();
  await page.keyboard.type('ssh proxy');
  await expect(page.getByLabel('搜索代码片段')).toHaveValue('ssh proxy');
  await expect(page.getByLabel('搜索代码片段')).toBeFocused();
  await expect(page.locator('.snippet-item')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('目录递归、搜索定位与 Tab 说明保持不变', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '好代码，随手可得。' })).toBeVisible();
  await page.getByRole('navigation', { name: '文件夹导航' }).getByRole('button', { name: /^python/ }).click();
  await expect(page.locator('.snippet-item')).toHaveCount(3);
  await expect(page.locator('.snippet-item').filter({ hasText: 'Format JSON' })).toContainText('python / files / json');
  await page.getByLabel('搜索代码片段').fill('json=');
  await expect(page.locator('.snippet-item')).toHaveCount(1);
  const item = page.locator('.snippet-item');
  await expect(item.locator('p')).toContainText('用 Requests 发送 HTTP 请求');
  await expect(item.locator('p')).not.toContainText('requests.post(');
  const preview = await item.locator('p').evaluate(el => ({
    height: el.clientHeight, fullHeight: el.scrollHeight, lineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(preview.height).toBeLessThanOrEqual(preview.lineHeight * 2 + 1);
  expect(preview.fullHeight).toBeGreaterThan(preview.height);
  const pathPosition = await item.locator('.snippet-folder').boundingBox();
  const titlePosition = await item.locator('.snippet-item-title').boundingBox();
  expect(pathPosition!.y + pathPosition!.height).toBeLessThan(titlePosition!.y);
  await page.locator('.snippet-item').click();
  await expect(page.getByRole('heading', { name: 'Python Requests', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'POST Request' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.list-title')).toContainText('搜索结果');
  const description = await page.locator('.markdown').innerText();
  await page.getByRole('tab', { name: 'GET Request' }).click();
  expect(await page.locator('.markdown').innerText()).toBe(description);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.locator('.description').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('.description-content')).not.toHaveClass(/collapsed/);
  await page.getByRole('tab', { name: 'POST Request' }).click();
  await expect(page.locator('.description-content')).not.toHaveClass(/collapsed/);
  await page.locator('.description').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('.description-content')).toHaveClass(/collapsed/);
  await expect(page.locator('.markdown')).toBeVisible();
  await page.getByRole('button', { name: '清空搜索' }).click();
  await expect(page.locator('.list-title')).toHaveCount(0);
  await expect(page.locator('.list-header.folder-mode')).toBeHidden();
  expect(errors).toEqual([]);
});

test('子片段说明无分割线和圆点，代码图标对齐名称，点击名称保持展开', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('snippet/git/branch');
    await page.locator('.description').click({ position: { x: 8, y: 8 } });
    const markdown = page.locator('.markdown');
    await expect(markdown.locator('hr, ul.sub-summary, .sub-summary > li')).toHaveCount(0);
    await expect(markdown.locator('.sub-summary-icon')).toHaveCount(3);
    const name = markdown.getByRole('button', { name: 'Delete Branch', exact: true });
    await name.hover();
    expect(await name.evaluate(el => getComputedStyle(el).textDecorationLine)).toBe('none');
    expect(await name.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await name.evaluate(el => getComputedStyle(el).fontFamily)).not.toContain('monospace');
    await name.click();
    await expect(page.getByRole('tab', { name: 'Delete Branch', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.description-content')).not.toHaveClass(/collapsed/);
    await expect(markdown).toContainText('未合并的分支会拒绝删除');
    const row = markdown.locator('.sub-summary').nth(1);
    const icon = await row.locator('.sub-summary-icon').boundingBox();
    const title = await name.locator('.summary-tab-name').boundingBox();
    expect(icon!.x + icon!.width).toBeLessThan(title!.x);
    expect(Math.abs(icon!.y + icon!.height / 2 - title!.y - title!.height / 2)).toBeLessThan(5);
    await expect(row.locator('button')).toHaveCount(1);
    for (const target of [name.locator('.sub-summary-icon'), name.locator('.summary-tab-name')]) {
      await page.getByRole('tab', { name: 'Create Branch', exact: true }).click();
      await target.hover();
      const colors = await name.evaluate(el => ({
        button: getComputedStyle(el).color,
        icon: getComputedStyle(el.querySelector('.sub-summary-icon')!).color,
        name: getComputedStyle(el.querySelector('.summary-tab-name')!).color,
      }));
      expect(colors.icon).toBe(colors.button);
      expect(colors.name).toBe(colors.button);
      await target.click();
      await expect(page.getByRole('tab', { name: 'Delete Branch', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.description-content')).not.toHaveClass(/collapsed/);
    }
    await page.getByRole('tab', { name: 'Create Branch', exact: true }).click();
    await name.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'Delete Branch', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.locator('.description').screenshot({ path: `test-results/sub-description-${width}.png` });
    await page.goto('snippet/python/http/requests');
    await page.locator('.description').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('.sub-summary [data-language-icon="python"]')).toHaveCount(3);
    await page.locator('.description').screenshot({ path: `test-results/sub-description-python-${width}.png` });
  }
});

test('说明玻璃提示与整框点击切换，键盘可操作，短说明完整显示', async ({ page }) => {
  await page.goto('snippet/python/http/requests');
  const viewport = page.locator('.description-content');
  await expect(viewport).toHaveClass(/collapsed/);
  const previewHeight = await viewport.evaluate(el => el.getBoundingClientRect().height);
  expect(await viewport.evaluate(el => el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight))).toBeCloseTo(5, 1);
  const frame = page.locator('.description');
  const hint = frame.locator('.description-overflow-hint');
  await expect(hint).toBeVisible();
  await frame.screenshot({ path: 'test-results/description-glass-desktop.png' });
  expect(await hint.evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur');
  expect(await hint.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  await expect(frame.locator('.description-actions')).toHaveCount(0);
  // Clicking text rather than a separate control expands and collapses.
  await frame.locator('.markdown > p').first().click();
  await expect(frame.getByRole('button', { name: '收起说明' })).toHaveAttribute('aria-expanded', 'true');
  await expect(hint).toHaveCount(0);
  await expect(frame.locator('.description-collapse-arrow')).toBeVisible();
  await frame.screenshot({ path: 'test-results/description-expanded-desktop.png' });
  expect(await viewport.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(previewHeight);
  await frame.locator('.markdown > p').first().click();
  await expect(viewport).toHaveClass(/collapsed/);
  await expect(frame.locator('.description-collapse-arrow')).toHaveCount(0);
  const disclosure = frame.getByRole('button', { name: '展开说明' });
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(viewport).not.toHaveClass(/collapsed/);
  await page.keyboard.press('Space');
  await expect(viewport).toHaveClass(/collapsed/);
  await frame.click({ position: { x: 8, y: 8 } });
  await frame.locator('.summary-tab').last().click();
  await expect(viewport).not.toHaveClass(/collapsed/);
  // Selecting text to copy must not collapse the frame.
  await frame.locator('.markdown > p').first().evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(viewport).not.toHaveClass(/collapsed/);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await frame.click({ position: { x: 8, y: 8 } });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(viewport).toHaveClass(/collapsed/);
  expect(await viewport.evaluate(el => el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight))).toBeCloseTo(5, 1);
  await frame.screenshot({ path: 'test-results/description-glass-mobile.png' });
  await page.locator('.description').click({ position: { x: 8, y: 8 } });
  await expect(frame.locator('.description-collapse-arrow')).toBeVisible();
  await frame.screenshot({ path: 'test-results/description-expanded-mobile.png' });
  await page.goto('snippet/python/files/read-json');
  await expect(page.locator('.markdown')).toContainText('不需要安装额外依赖');
  await expect(page.locator('.description-disclosure, .description-overflow-hint, .description-collapse-arrow')).toHaveCount(0);
  await page.locator('.description').click({ position: { x: 8, y: 8 } });
  await expect(viewport).not.toHaveClass(/collapsed/);
  await page.goto('snippet/python/http/requests');
  await expect(viewport).toHaveClass(/collapsed/);
});

test('编辑器动态填满剩余高度，缩放、展开说明与切换长短代码时状态栏保持底部', async ({ page, context }) => {
  test.skip(production, '使用临时内容验证动态布局');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const file = path.resolve(`snippets/__editor-layout-${process.pid}.md`);
  const source = Array.from({ length: 150 }, (_, index) => `print("line-${index}")`).join('\n');
  const description = Array.from({ length: 25 }, (_, index) => `说明段落 ${index}。`).join('\n\n');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await fs.writeFile(file, `---\nsnippet_name: Editor Layout\nsnippet_tags: []\n---\n\n${description}\n\n# Long\n\n\`\`\`python\n${source}\n\`\`\`\n\n# Short\n\n\`\`\`python\nprint(1)\n\`\`\``);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1440, height: 650 }, { width: 390, height: 844 }, { width: 390, height: 600 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`snippet/__editor-layout-${process.pid}`);
      const editor = page.locator('.highlighted-code');
      const statusbar = page.locator('#code-panel .code-statusbar');
      if (viewport.width > 700) await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
      else await expect(page.locator('.code-fallback')).toBeVisible();
      const checkBottom = async () => {
        await expect.poll(async () => {
          const pane = (await page.locator('.snippet-detail-scroll').boundingBox())!;
          const bar = (await statusbar.boundingBox())!;
          return Math.round(pane.y + pane.height - bar.y - bar.height);
        }).toBe(8);
        const bar = (await statusbar.boundingBox())!;
        const area = (await editor.boundingBox())!;
        expect(bar.y).toBeCloseTo(area.y + area.height, 0);
        expect(area.height).toBeGreaterThan(0);
        await expect(page.getByRole('button', { name: '复制当前代码', exact: true })).toBeInViewport();
      };
      await checkBottom();
      const height = (await editor.boundingBox())!.height;
      if (viewport.width <= 700) {
        await editor.evaluate(el => { el.scrollTop = el.scrollHeight; });
        expect(await editor.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      }
      await page.getByRole('tab', { name: 'Short', exact: true }).click();
      await expect(statusbar.locator('.line-count')).toHaveText('1 行');
      await checkBottom();
      expect((await editor.boundingBox())!.height).toBeCloseTo(height, 0);
      await page.getByRole('button', { name: '复制当前代码', exact: true }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('print(1)');
      await page.getByRole('button', { name: '展开说明', exact: true }).evaluate((el: HTMLButtonElement) => el.click());
      await checkBottom();
      expect((await editor.boundingBox())!.height).toBeLessThan(height);
      expect(await page.locator('.description').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      await page.locator('.description').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.getByRole('button', { name: '收起说明', exact: true }).evaluate((el: HTMLButtonElement) => el.click());
      await checkBottom();
      expect((await editor.boundingBox())!.height).toBeCloseTo(height, 0);
      await page.screenshot({ path: `test-results/editor-layout-${viewport.width}-${viewport.height}.png` });
    }
    expect(errors).toEqual([]);
  } finally { await fs.rm(file, { force: true }); }
});

test('唯一子片段直接显示代码，多个子片段保留 Tab', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ['snippet/python/files/read-json', 'snippet/python/files/json/format']) {
      await page.goto(route);
      await expect(page.getByRole('region', { name: '代码', exact: true })).toBeVisible();
      await expect(page.getByRole('tablist')).toHaveCount(0);
      await expect(page.getByRole('tab')).toHaveCount(0);
      await expect(page.getByRole('tabpanel')).toHaveCount(0);
      await expect(page.locator('.highlighted-code')).toContainText('import json');
      await expect(page.locator('.markdown')).toBeVisible();
      await page.getByRole('button', { name: '复制当前代码', exact: true }).click();
      const source = await readEditorCode(page);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
      await expect(renderedLines(page)).toHaveCount(source!.split('\n').length);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto('snippet/python/http/requests');
    await expect(page.getByRole('tab')).toHaveCount(3);
    await expect(page.getByRole('tabpanel')).toBeVisible();
  }
});

test('四种复制对象正确，深层链接可刷新，Raw 文件保持原文', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('snippet/python/http/requests');
  for (const name of ['复制页面链接', '复制 Markdown URL', '复制 Markdown']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(renderedLines(page)).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  await expect(page.locator('.code-fallback .line-numbers, .monaco-editor .margin')).toHaveAttribute('aria-hidden', 'true');
  await page.getByRole('tab', { name: 'JSON Response' }).click();
  await expect(renderedLines(page)).toHaveText(['1', '2']);
  await page.getByRole('tab', { name: 'POST Request' }).click();
  await expect(renderedLines(page)).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8']);
  await page.getByRole('button', { name: '复制当前代码', exact: true }).click();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  expect(code).toBe(await readEditorCode(page));
  expect(code).toContain('json={'); expect(code).not.toContain('```'); expect(code).not.toContain('snippet_name');
  await page.getByRole('button', { name: '复制页面链接', exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('/snippet/python/http/requests'); expect(link).not.toContain('#');
  await page.getByRole('button', { name: '复制 Markdown URL', exact: true }).click();
  const rawLink = await page.evaluate(() => navigator.clipboard.readText());
  const raw = await request.get(rawLink);
  expect(raw.status()).toBe(200); expect(raw.headers()['content-type']).not.toContain('text/html');
  const original = await fs.readFile('snippets/python/http/requests.md', 'utf8');
  expect(await raw.text()).toBe(original);
  await page.getByRole('button', { name: '复制 Markdown', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(original);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Python Requests', exact: true })).toBeVisible();
  expect((await request.get('raw/does-not-exist.md')).status()).toBe(404);
});

test('浏览器历史与首页恢复，明确链接优先', async ({ page }) => {
  await page.goto('folder/git');
  await page.locator('.snippet-item').filter({ hasText: 'Git Branch' }).click();
  await page.locator('.snippet-item').filter({ hasText: 'Undo Last Commit' }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Git Branch', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Undo Last Commit', exact: true })).toBeVisible();
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Undo Last Commit', exact: true })).toBeVisible();
  await page.goto('snippet/python/files/read-json');
  await expect(page.getByRole('heading', { name: 'Read JSON File', exact: true })).toBeVisible();
});

test('打开片段保留全部或父目录列表，历史与移动端返回保留来源范围', async ({ page }) => {
  for (const [route, count, label] of [['folder', 8, '内容库根目录'], ['folder/python', 3, 'python']] as const) {
    await page.goto(route);
    await expect(page.locator('.snippet-item')).toHaveCount(count);
    const names = await page.locator('.snippet-item-title strong').allTextContents();
    const folderSelection = await page.locator('.sidebar [aria-current="page"]').innerText();
    for (const name of ['Format JSON', 'Python Requests']) {
      await page.locator('.snippet-item').filter({ hasText: name }).click();
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(page.locator('.snippet-item')).toHaveCount(count);
      expect(await page.locator('.snippet-item-title strong').allTextContents()).toEqual(names);
      await expect(page.locator('.snippet-item.active')).toContainText(name);
      expect(await page.locator('.sidebar [aria-current="page"]').innerText()).toBe(folderSelection);
    }
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Format JSON', exact: true })).toBeVisible();
    await expect(page.locator('.snippet-item')).toHaveCount(count);
    await page.goForward();
    await page.reload();
    await expect(page.locator('.snippet-item')).toHaveCount(count);
    await page.getByLabel('搜索代码片段').fill('ssh proxy');
    await page.locator('.snippet-item').click();
    await expect(page.getByRole('heading', { name: 'SSH SOCKS Proxy', exact: true })).toBeVisible();
    await expect(page.locator('.snippet-item')).toHaveCount(1);
    await page.getByRole('button', { name: '清空搜索' }).click();
    await expect(page.locator('.snippet-item')).toHaveCount(count);
    expect(await page.locator('.snippet-item-title strong').allTextContents()).toEqual(names);
    await page.setViewportSize({ width: 900, height: 850 });
    await expect(page.locator('.folder-picker-button')).toHaveText(label);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, count, label] of [['folder', 8, '内容库根目录'], ['folder/python', 3, 'python']] as const) {
    await page.goto(route);
    await page.locator('.snippet-item').filter({ hasText: 'Format JSON' }).click();
    await expect(page.getByRole('heading', { name: 'Format JSON', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page.locator('.folder-picker-button')).toHaveText(label);
    await expect(page.locator('.snippet-item')).toHaveCount(count);
    await expect(page).toHaveURL(new RegExp(`/${route}$`));
  }
  await page.goto('snippet/python/files/json/format');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.folder-picker-button')).toHaveText('python / files / json');
  await expect(page.locator('.snippet-item')).toHaveCount(1);
});

test('宽屏隐藏目录标题栏，窄屏通过当前路径按钮切换文件夹', async ({ page }) => {
  await page.goto('folder/linux');
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.list-header.folder-mode')).toBeHidden();
  await expect(page.locator('.snippet-item')).toHaveCount(2);
  await page.setViewportSize({ width: 900, height: 850 });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.folder-picker-button')).toHaveText('linux');
  await expect(page.locator('.folder-list-count')).toHaveText('2');
  await expect(page.locator('.list-header > p')).toHaveCount(0);
  await page.goto('folder/python/files/json');
  await expect(page.locator('.folder-picker-button')).toHaveText('python / files / json');
  await page.locator('.folder-picker-button').click();
  await page.getByRole('navigation', { name: '文件夹导航' }).getByRole('button', { name: /^linux/ }).click();
  await expect(page.locator('.folder-picker-button')).toHaveText('linux');
  await expect(page.locator('.folder-picker')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.folder-picker-button')).toBeVisible();
  await page.locator('.folder-picker-button').click();
  await page.getByRole('navigation', { name: '文件夹导航' }).getByRole('button', { name: /^全部片段/ }).click();
  await expect(page.locator('.folder-picker-button')).toHaveText('内容库根目录');
  await expect(page.locator('.snippet-item')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-folder-picker.png', fullPage: true });
});

test('平板文件夹入口与键盘 Tab 导航', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 850 });
  await page.goto('./');
  await page.getByRole('button', { name: /^选择文件夹：/ }).click();
  await page.getByRole('navigation', { name: '文件夹导航' }).getByRole('button', { name: /^python/ }).click();
  await page.locator('.snippet-item').filter({ hasText: 'Python Requests' }).click();
  await page.getByRole('tab', { name: 'GET Request' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'POST Request' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'POST Request' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('完整版本更新：下载失败保持旧版，准备成功后提示刷新切换', async ({ page }) => {
  test.skip(!production || Boolean(process.env.SITE_BASE), '此测试在根路径生产模式运行，并临时重建本地产物');
  test.setTimeout(90_000);
  const file = path.resolve(`snippets/__version-update-${process.pid}.md`);
  const build = () => promisify(execFile)(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { maxBuffer: 4 * 1024 * 1024 });
  try {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await fs.writeFile(file, '---\nsnippet_name: Version Update Smoke\nsnippet_tags: []\n---\n\n```text\nnew-version-value\n```');
    await build();
    const manifest = JSON.parse(await fs.readFile('dist/version.json', 'utf8'));
    const libraryFile = path.join('dist', manifest.library);
    const bytes = await fs.readFile(libraryFile);
    await fs.rm(libraryFile);
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration?.update(); });
    await expect.poll(() => page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); return registration?.installing === null && registration.waiting === null; })).toBe(true);
    await page.getByLabel('搜索代码片段').fill('Version Update Smoke');
    await expect(page.locator('.snippet-item')).toHaveCount(0);
    await expect(page.locator('.update-banner')).toHaveCount(0);
    await fs.writeFile(libraryFile, bytes);
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration?.update(); });
    await expect(page.getByRole('button', { name: '刷新更新' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.snippet-item')).toHaveCount(0);
    await page.getByRole('button', { name: '刷新更新' }).click();
    await expect(page.getByLabel('搜索代码片段')).toHaveValue('');
    await page.getByLabel('搜索代码片段').fill('Version Update Smoke');
    await expect(page.locator('.snippet-item')).toHaveCount(1);
    await page.locator('.snippet-item').click();
    await expect(page.locator('.highlighted-code')).toContainText('new-version-value');
  } finally { await fs.rm(file, { force: true }); await build(); }
});

test('说明片段、图片、相对链接与搜索空状态', async ({ page }) => {
  await page.goto('snippet/guides/organizing');
  await expect(page.locator('.empty-code')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制当前代码', exact: true })).toHaveCount(0);
  expect(await page.locator('.markdown img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.locator('.description').click({ position: { x: 8, y: 8 } });
  await page.getByRole('link', { name: 'Python Requests', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Python Requests', exact: true })).toBeVisible();
  await page.getByLabel('搜索代码片段').fill('xxxxxxxx-no-match');
  await expect(page.getByRole('heading', { name: '没有找到匹配片段' })).toBeVisible();
  await page.getByRole('button', { name: '清空搜索' }).click();
  await page.getByLabel('搜索代码片段').blur();
  await page.keyboard.press('/');
  await expect(page.getByLabel('搜索代码片段')).toBeFocused();
  await page.keyboard.type('/');
  await expect(page.getByLabel('搜索代码片段')).toHaveValue('/');
});

test('移动端分级导航、搜索返回、Tab 与页面宽度', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('navigation', { name: '文件夹导航' }).getByRole('button', { name: /^python/ }).click();
  await expect(page.locator('.mobile-subfolders')).toBeVisible();
  await expect(page.locator('.snippet-item')).toHaveCount(3);
  await page.locator('.snippet-item').filter({ hasText: 'Python Requests' }).click();
  await expect(page.getByRole('heading', { name: 'Python Requests', exact: true })).toBeVisible();
  for (const name of ['复制页面链接', '复制 Markdown URL', '复制 Markdown']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeInViewport();
  }
  await page.screenshot({ path: 'test-results/mobile-detail.png', fullPage: true });
  await page.getByLabel('搜索代码片段').fill('ssh proxy');
  await expect(page.locator('.snippet-panel')).toBeVisible();
  await expect(page.locator('.snippet-item')).toHaveCount(1);
  await page.locator('.snippet-item').click();
  await expect(page.getByRole('heading', { name: 'SSH SOCKS Proxy', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.snippet-panel')).toBeVisible();
  await expect(page.getByLabel('搜索代码片段')).toHaveValue('ssh proxy');
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noOverflow).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('实时读入：错误文件跳过、修复后出现、修改与删除自动更新', async ({ page, request }) => {
  test.skip(production, '实时读取仅适用于开发模式');
  const filename = `__live-smoke-${process.pid}.md`;
  const file = path.resolve('snippets', filename);
  const front = '---\nsnippet_name: Live Reload Smoke\nsnippet_tags: [live]\n---\n\n';
  try {
    await page.goto('./');
    await page.getByLabel('搜索代码片段').fill('Live Reload Smoke');
    await fs.writeFile(file, 'invalid');
    await expect.poll(async () => (await request.get('__content/diagnostics.json')).json()).toContainEqual(expect.objectContaining({ path: filename, level: 'error' }));
    await expect(page.locator('.snippet-item')).toHaveCount(0);
    await fs.writeFile(file, front + '# Live\n\n```text\nfirst-value\n```');
    await expect(page.locator('.snippet-item')).toHaveCount(1);
    await page.locator('.snippet-item').click();
    await expect(page.locator('.highlighted-code')).toContainText('first-value');
    await fs.writeFile(file, front.replace('Live Reload Smoke', 'Live Reload Smoke Updated') + '# Live\n\n```text\nsecond-value\n```');
    await expect(page.locator('.highlighted-code')).toContainText('second-value');
    await expect(page).toHaveTitle('Live Reload Smoke Updated · Snippet Manager');
    await fs.rm(file);
    await expect(page.getByRole('heading', { name: '这个位置没有找到内容' })).toBeVisible();
    await expect(page.locator('.snippet-item')).toHaveCount(0);
  } finally { await fs.rm(file, { force: true }); }
});

test('生产 PWA 全库离线，包括未访问过的片段、搜索、Raw 与本地图片', async ({ page, context }) => {
  test.skip(!production, '需要生产 Service Worker');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  await context.setOffline(true);
  await page.goto('snippet/python/files/json/format');
  await expect(page.getByRole('heading', { name: 'Format JSON', exact: true })).toBeVisible();
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.snippet-item.active .snippet-folder [data-language-icon]')).toHaveAttribute('data-language-icon', 'python');
  await page.getByLabel('搜索代码片段').fill('ssh proxy');
  await expect(page.locator('.snippet-item')).toHaveCount(1);
  await expect(page.locator('.snippet-item .snippet-folder [data-language-icon]')).toHaveAttribute('data-language-icon', 'bash-prompt');
  await page.locator('.snippet-item').click();
  await page.getByRole('tab', { name: 'Test with curl' }).click();
  await expect(page.locator('.highlighted-code')).toContainText('socks5h');
  await page.getByRole('button', { name: '复制当前代码', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('curl --proxy socks5h');
  await page.goto('snippet/guides/organizing');
  await page.locator('.description').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('.markdown img')).toBeVisible();
  expect(await page.locator('.markdown img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  const rawUrl = new URL('raw/python/http/requests.md', test.info().project.use.baseURL).href;
  const raw = await page.evaluate(async url => (await fetch(url)).text(), rawUrl);
  expect(raw).toContain('snippet_name: Python Requests');
  await page.getByRole('button', { name: '复制 Markdown', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await fs.readFile('snippets/guides/organizing.md', 'utf8'));
});
