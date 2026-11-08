import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const production = process.env.APP_TEST_MODE === 'production';
const contentRoot = process.env.SNIPPETS_DIR || path.resolve('snippets');
const renderedLines = (page: Page) => page.locator('.code-fallback .line-numbers span, .monaco-editor .margin-view-overlays .line-numbers');
test('目录图标继承与覆盖，列表路径和窄屏入口一致，配置修改实时生效', async ({ page }) => {
  test.skip(production, '使用临时目录与图标配置验证开发实时读取');
  const prefix = `__Folder-icons-${process.pid}`;
  const directory = path.resolve(contentRoot, prefix);
  const configFile = path.resolve(contentRoot, '_folders.yml');
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
    await expect(page.locator('.sidebar [aria-current="page"] [data-language-icon]')).toHaveAttribute('data-language-icon', 'python');
    await scriptRow.locator('.folder-select').click();
    await expect(page.locator('.sidebar [aria-current="page"] [data-language-icon]')).toHaveAttribute('data-language-icon', 'javascript');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(`.sidebar [data-folder-path="${prefix}/scripts/deep"] [data-language-icon]`)).toHaveAttribute('data-language-icon', 'javascript');
    await expect(page.locator(`.sidebar [data-folder-path="${prefix}/scripts/json"] [data-language-icon]`)).toHaveAttribute('data-language-icon', 'json');
    delete rule[`${prefix}[py]`];
    rule[prefix] = childRules;
    childRules[0] = { scripts: ['json[json]'] };
    await fs.writeFile(configFile, stringifyYaml(configuration));
    await expect(deep.locator('.snippet-folder [data-folder-icon="default"]')).toBeVisible();
    await expect(page.locator('.sidebar [aria-current="page"] [data-folder-icon="default"]')).toBeVisible();
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
  await expect(page.locator('.detail-title-row h1')).toHaveText('Python Requests');
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
  const file = path.resolve(contentRoot, `__editor-long-${process.pid}.md`);
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
    await expect(page.locator('.folder-placeholder')).toBeVisible();
    expect(await modelCount()).toBe(0);
    expect(errors).toEqual([]);
  } finally { await fs.rm(file, { force: true }); }
});

test('子片段按语言显示 Logo，未知与缺失类型保留默认图标', async ({ page }) => {
  test.skip(production, '使用临时 Markdown 验证开发实时读取的混合语言');
  const file = path.resolve(contentRoot, `__language-logo-${process.pid}.md`);
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

test('活动栏位于最左，搜索位于列表栏，窄屏搜索保持连续输入', async ({ page }) => {
  await page.goto('./');
  const brand = page.locator('.sidebar-brand');
  const logo = page.locator('.activity-home .activity-logo');
  const activity = page.locator('.activity-bar');
  await expect(brand).toHaveText('Snippet Manager');
  await expect(brand).toHaveCSS('border-bottom-width', '0px');
  await expect(activity).toHaveCSS('background-color', 'rgb(242, 76, 0)');
  await expect(activity).toHaveCSS('border-right-width', '0px');
  await expect(activity).toHaveCSS('border-radius', '14px 0px 0px 14px');
  await expect(logo).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(logo).toHaveCSS('color', 'rgb(242, 76, 0)');
  await expect(logo).toHaveCSS('border-radius', '50%');
  await expect(logo).toHaveCSS('width', '36px');
  await expect(logo).toHaveCSS('height', '36px');
  await expect(logo.locator('path').last()).toHaveCSS('stroke', 'rgb(251, 146, 60)');
  await expect(page.locator('.sidebar')).toHaveCSS('background-color', 'rgb(245, 245, 245)');
  await expect(page.locator('.snippet-panel .global-search')).toBeVisible();
  await expect(page.locator('.app-header')).toHaveCount(0);
  expect((await page.locator('.app-body').boundingBox())!.y).toBe(0);
  await page.getByLabel('搜索代码片段').fill('json=');
  await expect(page.locator('.snippet-item')).toHaveCount(1);
  await page.getByLabel('搜索代码片段').blur();
  await page.keyboard.press('/');
  await expect(page.getByLabel('搜索代码片段')).toBeFocused();
  await page.setViewportSize({ width: 900, height: 850 });
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.activity-bar')).toBeVisible();
  await expect(page.locator('.snippet-panel .global-search')).toBeVisible();
  await expect(page.getByLabel('搜索代码片段')).toHaveValue('json=');
  await page.screenshot({ path: 'test-results/tablet.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(activity).toHaveCSS('border-radius', '0px');
  await expect(page.getByLabel('搜索代码片段')).toHaveCount(1);
  await expect(page.locator('.snippet-panel .global-search')).toBeVisible();
  await page.goto('./');
  await page.getByLabel('搜索代码片段').click();
  await page.keyboard.type('ssh proxy');
  await expect(page.getByLabel('搜索代码片段')).toHaveValue('ssh proxy');
  await expect(page.getByLabel('搜索代码片段')).toBeFocused();
  await expect(page.locator('.snippet-item')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('活动栏切换全库和设置，路径栏品牌返回首页', async ({ page }) => {
  await page.goto('folder/python');
  const activity = page.getByRole('navigation', { name: '活动栏' });
  const logo = activity.getByRole('button', { name: '首页' });
  const home = page.locator('.sidebar').getByRole('button', { name: 'Snippet Manager 首页' });
  const library = activity.getByRole('button', { name: '全部片段' });
  const settings = activity.getByRole('button', { name: '设置' });
  await expect(activity.locator('[aria-current]')).toHaveCount(0);
  await expect(activity.getByRole('button')).toHaveCount(3);
  await expect(page.locator('.sidebar .all-folder')).toBeVisible();
  const rail = (await activity.boundingBox())!;
  expect(rail.x).toBe(0);
  expect(rail.width).toBe(56);
  const desktopLogo = (await logo.boundingBox())!;
  expect(desktopLogo.y - rail.y).toBe(12);
  expect((await library.boundingBox())!.y - desktopLogo.y - desktopLogo.height).toBe(12);
  await expect(library.locator('.lucide-file-text')).toBeVisible();
  expect((await settings.boundingBox())!.y).toBeGreaterThan((await library.boundingBox())!.y);

  await page.getByLabel('搜索代码片段').fill('ssh proxy');
  await expect(page.locator('.snippet-item')).toHaveCount(1);
  await library.click();
  await expect(page).toHaveURL(/\/folder$/);
  await expect(page.getByLabel('搜索代码片段')).toHaveValue('');
  await expect(page.locator('.snippet-item')).toHaveCount(8);
  await page.locator('.snippet-item').first().click();
  await expect(page.locator('.sidebar .all-folder')).toHaveAttribute('aria-current', 'page');

  await settings.click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.reload();
  const settingsPage = page.getByRole('main', { name: '设置' });
  await expect(settingsPage).toBeVisible();
  await expect(settingsPage.locator('*')).toHaveCount(0);
  await expect(activity.locator('[aria-current]')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(activity).toHaveCSS('width', '390px');
  const mobileLogo = (await logo.boundingBox())!;
  const mobileLibrary = (await library.boundingBox())!;
  const mobileSettings = (await settings.boundingBox())!;
  expect(mobileLogo.y).toBe(mobileLibrary.y);
  expect(mobileSettings.y).toBe(mobileLibrary.y);
  expect(mobileLogo.x).toBe(12);
  expect(mobileLibrary.x - mobileLogo.x - mobileLogo.width).toBe(12);
  expect(mobileSettings.x).toBeGreaterThan(mobileLibrary.x);
  await expect(settingsPage).toBeVisible();
  await expect(page.getByLabel('搜索代码片段')).toHaveCount(0);
  await logo.click();
  await expect(page).toHaveURL(test.info().project.use.baseURL!);
  await library.click();
  await expect(page).toHaveURL(/\/folder$/);
  await home.click();
  await expect(page).toHaveURL(test.info().project.use.baseURL!);
  await expect(page.locator('.snippet-item')).toHaveCount(8);
  await expect(page.getByRole('dialog', { name: '片段详情' })).toHaveCount(0);
});

test('桌面分隔线调整相邻栏宽，限制正文最小宽度并记住设置', async ({ page }) => {
  await page.goto('snippet/python/http/requests');
  const sidebar = page.getByRole('separator', { name: '调整文件夹侧栏宽度' });
  const list = page.getByRole('separator', { name: '调整片段列表宽度' });
  const detail = page.locator('.detail-region');
  const drag = async (handle: typeof sidebar, distance: number) => {
    const { x, y, width, height } = (await handle.boundingBox())!;
    await page.mouse.move(x + width / 2, y + height / 2);
    await page.mouse.down();
    await page.mouse.move(x + width / 2 + distance, y + height / 2, { steps: 5 });
    await page.mouse.up();
  };
  await expect(sidebar).toHaveAttribute('aria-valuenow', '232');
  const originalDetail = await detail.boundingBox();
  await drag(sidebar, 64);
  await expect(page.locator('.sidebar')).toHaveCSS('width', '296px');
  await expect(page.locator('.snippet-panel')).toHaveCSS('width', '254px');
  expect(await detail.boundingBox()).toEqual(originalDetail);

  await drag(list, 650);
  await expect(page.locator('.sidebar')).toHaveCSS('width', '296px');
  await expect(detail).toHaveCSS('width', '400px');
  await list.press('ArrowLeft');
  await expect(detail).toHaveCSS('width', '416px');
  await page.reload();
  await expect(page.locator('.sidebar')).toHaveCSS('width', '296px');
  await expect(detail).toHaveCSS('width', '416px');
  await page.setViewportSize({ width: 1101, height: 800 });
  await expect(detail).toHaveCSS('width', '400px');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(detail).toHaveCSS('width', '416px');
});

test('手机浏览时可调整侧栏，打开抽屉后正文占满屏幕', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('folder/python');
  const sidebar = page.getByRole('separator', { name: '调整文件夹侧栏宽度' });
  await expect(sidebar).toHaveAttribute('aria-valuenow', '133');
  const { x, y, width, height } = (await sidebar.boundingBox())!;
  const point = { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 100, y: point.y }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.detach();
  await expect(page.locator('.sidebar')).toHaveCSS('width', '210px');
  await expect(page.locator('.snippet-panel')).toHaveCSS('width', '180px');
  await page.locator('.snippet-item').filter({ hasText: 'Python Requests' }).click();
  await expect(sidebar).toHaveCount(0);
  const drawer = page.getByRole('dialog', { name: '片段详情' });
  await expect(drawer).toHaveCSS('width', '390px');
  await drawer.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveCSS('width', '210px');
});

test('目录递归、搜索定位与 Tab 说明保持不变', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('.folder-placeholder')).toBeVisible();
  await expect(page.locator('.folder-placeholder')).toHaveText('点击左侧列表中的代码片段，查看内容');
  await page.getByRole('navigation', { name: '文件夹导航' }).getByRole('button', { name: /^python/ }).click();
  await expect(page.locator('.snippet-item')).toHaveCount(3);
  await expect(page.locator('.folder-placeholder')).toHaveText('点击左侧列表中的代码片段，查看内容');
  await expect(page.locator('.folder-placeholder .brand-mark')).toBeVisible();
  await expect(page.locator('.folder-placeholder button')).toHaveCount(0);
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
  await page.getByRole('button', { name: '收起说明', exact: true }).click();
  await expect(page.locator('.description-content')).toHaveClass(/collapsed/);
  await expect(page.locator('.markdown')).toBeVisible();
  await page.getByRole('button', { name: '清空搜索' }).click();
  await expect(page.locator('.list-title')).toHaveCount(0);
  await expect(page.locator('.list-header')).toHaveCount(0);
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

test('说明整框展开、仅按钮收起，键盘可操作，短说明完整显示', async ({ page }) => {
  test.skip(production, '使用临时片段验证说明交互');
  const prefix = `__Description-${process.pid}`;
  const directory = path.resolve(contentRoot, prefix);
  const front = '---\nsnippet_name: Description Interaction\nsnippet_tags: []\n---\n\n';
  await fs.mkdir(directory, { recursive: true });
  try {
    const paragraphs = Array.from({ length: 24 }, (_, index) => `说明段落 ${index}，用于检查阅读和滚动时不会误收起。`).join('\n\n');
    await fs.writeFile(path.join(directory, 'long.md'), front + paragraphs + '\n\n# Example\n\n示例说明\n\n```python\nprint(1)\n```\n\n# Another\n\n另一段说明\n\n```python\nprint(2)\n```');
    await fs.writeFile(path.join(directory, 'short.md'), front + '不需要安装额外依赖');
    await page.goto(`snippet/${prefix}/long`);
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
    // Text expands the frame, but cannot collapse it once expanded.
    await frame.locator('.markdown > p').first().click();
    const collapse = frame.getByRole('button', { name: '收起说明' });
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await expect(collapse).toHaveText('收起');
    const collapseArrow = collapse.locator('.description-collapse-arrow');
    await expect(collapseArrow).toBeVisible();
    await expect(hint).toHaveCount(0);
    await frame.screenshot({ path: 'test-results/description-expanded-desktop.png' });
    await expect(collapse).toHaveCSS('color', 'rgb(82, 82, 91)');
    await collapse.hover();
    await expect(collapse).toHaveCSS('color', 'rgb(194, 65, 12)');
    await expect(collapseArrow).toHaveCSS('color', 'rgb(194, 65, 12)');
    await expect(collapse).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(collapse).toHaveCSS('border-top-width', '0px');
    expect(await viewport.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(previewHeight);
    await frame.locator('.markdown > p').first().click();
    await frame.click({ position: { x: 8, y: 8 } });
    await expect(viewport).not.toHaveClass(/collapsed/);
    await frame.getByRole('button', { name: '收起说明' }).click();
    await expect(viewport).toHaveClass(/collapsed/);
    await expect(collapse).toHaveCount(0);
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
    await frame.getByRole('button', { name: '收起说明' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(viewport).toHaveClass(/collapsed/);
    expect(await viewport.evaluate(el => el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight))).toBeCloseTo(5, 1);
    await frame.screenshot({ path: 'test-results/description-glass-mobile.png' });
    await page.locator('.description').click({ position: { x: 8, y: 8 } });
    await expect(collapse).toBeVisible();
    await frame.screenshot({ path: 'test-results/description-expanded-mobile.png' });
    await frame.click({ position: { x: 8, y: 8 } });
    await expect(viewport).not.toHaveClass(/collapsed/);
    await expect(collapse).toBeInViewport();
    await collapse.click();
    await expect(viewport).toHaveClass(/collapsed/);
    await page.goto(`snippet/${prefix}/short`);
    await expect(page.locator('.markdown')).toContainText('不需要安装额外依赖');
    await expect(page.locator('.description-disclosure, .description-overflow-hint')).toHaveCount(0);
    await page.locator('.description').click({ position: { x: 8, y: 8 } });
    await expect(viewport).not.toHaveClass(/collapsed/);
    await page.goto(`snippet/${prefix}/long`);
    await expect(viewport).toHaveClass(/collapsed/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('编辑器动态填满剩余高度，缩放、展开说明与切换长短代码时状态栏保持底部', async ({ page, context }) => {
  test.skip(production, '使用临时内容验证动态布局');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const file = path.resolve(contentRoot, `__editor-layout-${process.pid}.md`);
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
          const border = await statusbar.evaluate(el => Number.parseFloat(getComputedStyle(el.parentElement!).borderBottomWidth));
          return Math.round(pane.y + pane.height - bar.y - bar.height - border);
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
  const original = await fs.readFile(path.join(contentRoot, 'python/http/requests.md'), 'utf8');
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
  for (const [route, count, label] of [['folder', 8, '全部片段'], ['folder/python', 3, 'python']] as const) {
    await page.goto(route);
    await expect(page.locator('.snippet-item')).toHaveCount(count);
    const names = await page.locator('.snippet-item-title strong').allTextContents();
    const folderSelection = page.locator('.sidebar [aria-current="page"]');
    const selectedFolders = await folderSelection.allTextContents();
    expect(selectedFolders).toHaveLength(1);
    for (const name of ['Format JSON', 'Python Requests']) {
      await page.locator('.snippet-item').filter({ hasText: name }).click();
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(page.locator('.snippet-item')).toHaveCount(count);
      expect(await page.locator('.snippet-item-title strong').allTextContents()).toEqual(names);
      await expect(page.locator('.snippet-item.active')).toContainText(name);
      expect(await folderSelection.allTextContents()).toEqual(selectedFolders);
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
    await expect(folderSelection).toContainText(label);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, count, label] of [['folder', 8, '全部片段'], ['folder/python', 3, 'python']] as const) {
    await page.goto(route);
    await page.locator('.snippet-item').filter({ hasText: 'Format JSON' }).click();
    await expect(page.getByRole('heading', { name: 'Format JSON', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page.locator('.sidebar [aria-current="page"]')).toContainText(label);
    await expect(page.locator('.snippet-item')).toHaveCount(count);
    await expect(page).toHaveURL(new RegExp(`/${route}$`));
  }
  await page.goto('snippet/python/files/json/format');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.sidebar [data-folder-path="python/files/json"] [aria-current="page"]')).toBeVisible();
  await expect(page.locator('.snippet-item')).toHaveCount(1);
});

test('桌面、平板和手机通过同一文件夹侧栏切换范围', async ({ page }) => {
  await page.goto('folder/linux');
  const tree = page.getByRole('navigation', { name: '文件夹导航' });
  const labels = tree.locator('.sidebar-label');
  const expectLabelAlignment = async () => {
    const start = await page.locator('.sidebar-brand').evaluate(el => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));
    expect(await labels.evaluateAll(elements => elements.map(el => el.getBoundingClientRect().left))).toEqual([start, start]);
  };
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(labels).toHaveText(['个人收藏', '文件夹']);
  await expect(labels.first()).toHaveCSS('font-size', '11px');
  await expectLabelAlignment();
  await expect(page.locator('.list-header')).toHaveCount(0);
  await expect(page.locator('.snippet-item')).toHaveCount(2);
  await page.setViewportSize({ width: 900, height: 850 });
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.sidebar [aria-current="page"]')).toContainText('linux');
  await page.goto('folder/python/files/json');
  await expect(page.locator('.sidebar [data-folder-path="python/files/json"] [aria-current="page"]')).toBeVisible();
  await tree.getByRole('button', { name: /^linux/ }).click();
  await expect(page.locator('.sidebar [aria-current="page"]')).toContainText('linux');
  await page.setViewportSize({ width: 320, height: 640 });
  await expectLabelAlignment();
  await tree.getByRole('button', { name: /^全部片段/ }).click();
  await expect(page.locator('.sidebar .all-folder')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.snippet-item')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-folder-sidebar.png', fullPage: true });
});

test('平板文件夹入口与键盘 Tab 导航', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 850 });
  await page.goto('./');
  await page.getByRole('navigation', { name: '文件夹导航' }).getByRole('button', { name: /^python/ }).click();
  await page.locator('.snippet-item').filter({ hasText: 'Python Requests' }).click();
  const drawer = page.getByRole('dialog', { name: '片段详情' });
  await expect(drawer.getByRole('button', { name: '返回', exact: true })).toBeFocused();
  await expect(drawer.locator('.drawer-toolbar h1')).toHaveText('Python Requests');
  await expect(drawer.locator('.detail-title-row h1')).toHaveCount(0);
  await expect.poll(() => drawer.boundingBox()).toEqual({ x: 56, y: 0, width: 844, height: 850 });
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
  await page.getByRole('tab', { name: 'GET Request' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'POST Request' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'POST Request' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('完整版本更新：下载失败保持旧版，准备成功后提示刷新切换', async ({ page }) => {
  test.skip(!production || Boolean(process.env.SITE_BASE), '此测试在根路径生产模式运行，并临时重建本地产物');
  test.setTimeout(90_000);
  const file = path.resolve(contentRoot, `__version-update-${process.pid}.md`);
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

test('手机侧栏和全宽详情抽屉保留搜索、滚动位置与历史', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('navigation', { name: '文件夹导航' }).getByRole('button', { name: /^python/ }).click();
  await expect(page.locator('.sidebar [data-folder-path="python/files"]')).toBeVisible();
  await expect(page.locator('.snippet-item')).toHaveCount(3);
  await page.locator('.snippet-item').filter({ hasText: 'Python Requests' }).click();
  await expect(page.getByRole('heading', { name: 'Python Requests', exact: true })).toBeVisible();
  const drawer = page.getByRole('dialog', { name: '片段详情' });
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  const title = drawer.locator('.drawer-toolbar h1');
  await expect(title).toHaveText('Python Requests');
  await expect(title).toHaveCSS('text-align', 'center');
  await expect(drawer.locator('.detail-title-row h1')).toHaveCount(0);
  await expect.poll(() => drawer.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  const titleBox = (await title.boundingBox())!;
  expect(titleBox.x + titleBox.width / 2).toBe(195);
  for (const name of ['复制页面链接', '复制 Markdown URL', '复制 Markdown']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeInViewport();
  }
  await page.screenshot({ path: 'test-results/mobile-detail.png', fullPage: true });
  await page.goBack();
  await expect(page).toHaveURL(/\/folder\/python$/);
  await expect(drawer).toHaveCount(0);
  await page.getByLabel('搜索代码片段').fill('ssh proxy');
  await expect(page.locator('.snippet-panel')).toBeVisible();
  await expect(page.locator('.snippet-item')).toHaveCount(1);
  const match = page.locator('.snippet-item');
  await match.click();
  await expect(page.getByRole('heading', { name: 'SSH SOCKS Proxy', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.getByLabel('搜索代码片段')).toHaveValue('ssh proxy');
  await expect(match).toBeFocused();

  await page.locator('.sidebar .all-folder').click();
  const list = page.locator('.snippet-list');
  const guide = list.getByRole('button', { name: /Organizing/ });
  await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await guide.scrollIntoViewIfNeeded();
  const scrollTop = await list.evaluate(el => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  await guide.click();
  await drawer.locator('.description').click({ position: { x: 8, y: 8 } });
  await drawer.getByRole('link', { name: 'Python Requests', exact: true }).click();
  await expect(drawer.getByRole('heading', { name: 'Python Requests', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page).toHaveURL(/\/folder$/);
  await expect(guide).toBeFocused();
  expect(await list.evaluate(el => el.scrollTop)).toBe(scrollTop);
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noOverflow).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('实时读入：错误文件跳过、修复后出现、修改与删除自动更新', async ({ page, request }) => {
  test.skip(production, '实时读取仅适用于开发模式');
  const filename = `__live-smoke-${process.pid}.md`;
  const file = path.resolve(contentRoot, filename);
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
  await page.goto('settings');
  await expect(page.getByRole('main', { name: '设置' })).toBeVisible();
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
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await fs.readFile(path.join(contentRoot, 'guides/organizing.md'), 'utf8'));
});

test('展开代码仅占正文区，保留当前代码和编辑器状态，按钮与 Esc 恢复', async ({ page, context }) => {
  test.skip(production, '使用临时代码验证专注模式');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const prefix = `__Code-focus-${process.pid}`;
  const directory = path.resolve(contentRoot, prefix);
  const front = '---\nsnippet_name: Code Focus\nsnippet_tags: [focus]\n---\n\n';
  const source = 'def example():\n    print("folded")\n    return 1\n\n' + Array.from({ length: 160 }, (_, i) => `print("line-${i}")`).join('\n');
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(path.join(directory, 'code.md'), front + '说明正文。\n\n# First\n\n```python\nprint("first")\n```\n\n# Long\n\n```python\n' + source + '\n```');
    await fs.writeFile(path.join(directory, 'empty.md'), front.replace('Code Focus', 'Without Code') + '只有说明');
    await page.goto(`snippet/${prefix}/code`);
    await page.getByRole('tab', { name: 'Long', exact: true }).click();
    const editor = page.locator('.code-editor');
    await expect(editor).toHaveAttribute('data-state', 'ready');
    await page.locator('.codicon-folding-expanded').first().click();
    await expect(page.locator('.codicon-folding-collapsed')).toHaveCount(1);
    const editorState = () => page.evaluate(async () => {
      const moduleUrl = '/src/features/snippets/monaco-runtime.ts';
      const { monaco } = await import(moduleUrl);
      const instance = monaco.editor.getEditors()[0];
      return { top: instance.getScrollTop(), model: instance.getModel().id, folding: instance.saveViewState().contributionsState['editor.contrib.folding'] };
    });
    await page.evaluate(async () => {
      const moduleUrl = '/src/features/snippets/monaco-runtime.ts';
      const { monaco } = await import(moduleUrl);
      monaco.editor.getEditors()[0].setScrollTop(1500);
    });
    const before = await editorState();
    const sidebar = await page.locator('.sidebar').boundingBox();
    const list = await page.locator('.snippet-panel').boundingBox();
    const original = await page.locator('.code-card').boundingBox();
    await page.getByRole('button', { name: '展开代码', exact: true }).click();
    await expect(page.getByRole('button', { name: '恢复正文' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Code Focus', exact: true })).toBeHidden();
    await expect(page.getByRole('tablist', { name: '子片段' })).toBeHidden();
    await expect(page.locator('.description')).toBeHidden();
    expect(await page.locator('.sidebar').boundingBox()).toEqual(sidebar);
    expect(await page.locator('.snippet-panel').boundingBox()).toEqual(list);
    const panel = await page.locator('.detail-panel').boundingBox();
    const focused = await page.locator('.code-card').boundingBox();
    expect(focused).toEqual(panel);
    expect(focused!.height).toBeGreaterThan(original!.height);
    await expect(page.getByLabel('当前代码状态栏')).toBeInViewport();
    await page.getByRole('button', { name: '复制当前代码', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
    expect((await editorState()).model).toBe(before.model);
    expect((await editorState()).folding).toEqual(before.folding);
    await page.screenshot({ path: 'test-results/code-focused-desktop.png' });
    // Escape also works while the editor has keyboard focus.
    await page.locator('.monaco-editor textarea').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '展开代码', exact: true })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Long', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(editorState).toEqual(before);
    expect((await editorState()).folding).toEqual(before.folding);
    await page.getByRole('button', { name: '展开代码', exact: true }).click();
    await page.evaluate(async () => {
      const moduleUrl = '/src/features/snippets/monaco-runtime.ts';
      const { monaco } = await import(moduleUrl);
      monaco.editor.getEditors()[0].setScrollTop(1800);
    });
    const changed = await editorState();
    await page.getByRole('button', { name: '恢复正文' }).click();
    await expect.poll(editorState).toEqual(changed);
    await page.getByRole('button', { name: '展开代码', exact: true }).click();
    await page.locator('.snippet-item').filter({ hasText: 'Without Code' }).click();
    await expect(page.locator('.empty-code')).toBeVisible();
    await expect(page.getByRole('button', { name: '恢复正文' })).toHaveCount(0);
    await page.goto(`snippet/${prefix}/code`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Long', exact: true }).click();
    const fallback = page.locator('.code-fallback');
    await fallback.evaluate(el => { el.scrollTop = 1200; el.scrollLeft = 20; });
    const mobileScroll = await fallback.evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }));
    await page.getByRole('button', { name: '展开代码', exact: true }).click();
    await expect(page.locator('.description')).toBeHidden();
    await expect(page.getByLabel('当前代码状态栏')).toBeInViewport();
    expect(await page.locator('.code-card').boundingBox()).toEqual(await page.locator('.detail-panel').boundingBox());
    await page.screenshot({ path: 'test-results/code-focused-mobile.png' });
    await page.getByRole('button', { name: '恢复正文' }).click();
    expect(await fallback.evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }))).toEqual(mobileScroll);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('Markdown 默认预览、底栏切换、代码块复制与展开阅读，手机可用', async ({ page, context }) => {
  test.skip(production, '使用开发模块检查双模式滚动状态');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const raw = await fs.readFile('docs/examples/markdown-preview.md', 'utf8');
  const prefix = `__Markdown-preview-${process.pid}`;
  const directory = path.join(contentRoot, prefix);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'preview.md'), raw);
  try {
    const markdown = raw.split('````markdown\n')[1].split('\n````')[0];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`snippet/${prefix}/preview`);
    const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
    const footer = page.getByLabel('当前代码状态栏');
    await expect(preview).toBeVisible();
    await expect(page.locator('.code-window-title')).toHaveText('Markdown 预览');
    await expect(page.locator('.window-traffic-lights .window-dot')).toHaveCount(3);
    await expect(page.locator('.window-traffic-lights button')).toHaveCount(0);
    await expect(page.locator('.markdown-window')).toHaveCSS('border-top-width', '1px');
    await expect(preview.getByRole('heading', { name: '小小代码库', exact: true })).toBeVisible();
    await expect(preview.locator('table')).toHaveCount(1);
    await expect(preview.getByRole('checkbox')).toHaveCount(4);
    await expect(preview.locator('.preview-code-language')).toHaveText(['bash', 'python', 'json']);
    await expect(preview).toHaveCSS('background-color', 'rgb(250, 250, 250)');
    await expect(preview.locator('.preview-code-block').first()).toHaveCSS('background-color', 'rgb(248, 248, 249)');
    await expect(preview.locator('.preview-code-block pre').first()).toHaveCSS('background-color', 'rgb(248, 248, 249)');
    await expect(preview.locator('.preview-code-header [data-language-icon="bash-prompt"]')).toBeVisible();
    await expect(preview.locator('.preview-code-header [data-language-icon="python"]')).toHaveCSS('fill', 'rgb(55, 118, 171)');
    await expect(preview.locator('.preview-code-header [data-language-icon="json"]')).toBeVisible();
    const firstBlock = preview.locator('.preview-code-block').first();
    await expect(firstBlock.locator('.preview-line-numbers > span')).toHaveText(['1', '2']);
    await expect(preview.locator('.preview-code-block').nth(1).locator('.preview-line-numbers > span')).toHaveText(['1', '2', '3', '4', '5']);
    expect(await firstBlock.locator('.preview-line-numbers').evaluate(el => getComputedStyle(el).userSelect)).toBe('none');
    await expect(page.getByRole('button', { name: '查看源代码' })).toBeVisible();
    await expect(page.locator('.code-editor')).toBeHidden();
    const firstCopy = preview.getByRole('button', { name: '复制代码块 1', exact: true });
    // Observe the transient success state before clicking, even if the driver returns after it resets.
    await preview.evaluate(root => {
      const observer = new MutationObserver(() => {
        const button = root.querySelector('[data-preview-copy="0"]')!;
        if (button.classList.contains('copied')) {
          (root as HTMLElement).dataset.copyFeedback = JSON.stringify({
            color: getComputedStyle(button).color,
            checkVisible: button.querySelector('.preview-copy-check')!.getBoundingClientRect().width > 0,
          });
          observer.disconnect();
        }
      });
      observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    });
    await firstCopy.click();
    await expect.poll(() => preview.getAttribute('data-copy-feedback')).toBe(JSON.stringify({ color: 'rgb(21, 128, 61)', checkVisible: true }));
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm install\nnpm run dev');
    await expect(firstCopy).not.toHaveClass(/copied/);
    await expect(firstCopy.locator('.preview-copy-icon')).toBeVisible();
    await preview.getByRole('button', { name: '复制代码块 2', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('def greet(name: str) -> str:\n    return f"你好，{name}！欢迎来到代码库。"\n\n\nprint(greet("开发者"))');
    await footer.getByRole('button', { name: '复制 Markdown', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(markdown);
    await preview.evaluate(el => { el.scrollTop = 260; });
    const previewTop = await preview.evaluate(el => el.scrollTop);
    await page.getByRole('button', { name: '查看源代码' }).click();
    await expect(page.locator('.code-window-title')).toHaveCount(0);
    await expect(page.locator('.window-traffic-lights')).toHaveCount(0);
    await expect(page.locator('.markdown-window')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '展开代码', exact: true })).toHaveCSS('position', 'absolute');
    await expect(page.locator('.code-editor')).toBeVisible();
    await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
    await page.screenshot({ path: 'test-results/markdown-source-desktop.png' });
    await page.evaluate(async () => {
      const moduleUrl = '/src/features/snippets/monaco-runtime.ts';
      const { monaco } = await import(moduleUrl);
      monaco.editor.getEditors()[0].setScrollTop(300);
    });
    await page.getByRole('button', { name: '切换到预览' }).click();
    await expect(preview).toBeVisible();
    expect(await preview.evaluate(el => el.scrollTop)).toBe(previewTop);
    await page.getByRole('button', { name: '查看源代码' }).click();
    expect(await page.evaluate(async () => {
      const moduleUrl = '/src/features/snippets/monaco-runtime.ts';
      const { monaco } = await import(moduleUrl);
      return monaco.editor.getEditors()[0].getScrollTop();
    })).toBe(300);
    await page.getByRole('button', { name: '切换到预览' }).click();
    await page.getByRole('button', { name: '展开代码', exact: true }).click();
    await expect(preview).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Markdown 预览示例', exact: true })).toBeHidden();
    await expect(footer).toBeInViewport();
    await page.keyboard.press('Escape');
    expect(await preview.evaluate(el => el.scrollTop)).toBe(previewTop);
    await preview.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: 'test-results/markdown-preview-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(preview).toBeVisible();
    await expect(page.getByRole('button', { name: '查看源代码' })).toBeInViewport();
    await expect(footer.getByRole('button', { name: '复制 Markdown', exact: true })).toBeInViewport();
    await page.screenshot({ path: 'test-results/markdown-preview-mobile.png' });
    await page.getByRole('button', { name: '查看源代码' }).click();
    await expect(page.locator('.code-fallback')).toBeVisible();
    await page.getByRole('button', { name: '切换到预览' }).click();
    await expect(preview).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('snippet/python/files/read-json');
    await expect(page.locator('.code-view-toggle')).toHaveCount(0);
    await expect(page.locator('.code-fallback')).toBeVisible();
    await page.goto(`snippet/${prefix}/preview`);
    await expect(preview).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('行内代码支持修饰键复制、悬停提示和局部反馈，不触发展开或链接', async ({ page, context }) => {
  test.skip(production, '使用临时片段验证行内代码交互');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const prefix = `__Inline-copy-${process.pid}`;
  const directory = path.resolve(contentRoot, prefix);
  const front = '---\nsnippet_name: Inline Copy\nsnippet_tags: []\n---\n\n';
  const markdown = '# Inline Preview\n\n复制 `preview  value & <tag>`。\n\n链接 [`link-value`](https://example.invalid/)\n\n```python\nvalue = "block-value"\n```';
  const description = '复制 `ScriptInputArgs`，或访问 [`description-link`](https://example.invalid/)。\n\n' + Array.from({ length: 12 }, (_, i) => `说明段落 ${i}。`).join('\n\n');
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(path.join(directory, 'example.md'), front + description + '\n\n# Markdown\n\n````md\n' + markdown + '\n````');
    await page.goto(`snippet/${prefix}/example`);
    const descriptionFrame = page.locator('.description');
    const descriptionCode = descriptionFrame.locator('p > code').first();
    const disclosure = page.locator('.description-content');
    const tooltip = page.locator('.inline-code-feedback');
    const modifier = await page.evaluate(() => navigator.platform.includes('Mac') ? 'Meta' : 'Control');
    await expect(disclosure).toHaveClass(/collapsed/);
    await descriptionCode.hover();
    await expect(descriptionCode).toHaveCSS('cursor', 'text');
    const normalColor = await descriptionCode.evaluate(el => getComputedStyle(el).color);
    const normalBackground = await descriptionCode.evaluate(el => getComputedStyle(el).backgroundColor);
    // Pressing the key while already hovering updates the affordance immediately.
    await page.keyboard.down(modifier);
    await expect(descriptionCode).toHaveCSS('color', 'rgb(154, 52, 18)');
    await expect(descriptionCode).toHaveCSS('font-weight', '600');
    await expect(descriptionCode).toHaveCSS('cursor', 'pointer');
    await expect(descriptionCode).toHaveCSS('background-color', normalBackground);
    await expect(descriptionCode).toHaveCSS('outline-style', 'none');
    await descriptionCode.evaluate(code => {
      const observer = new MutationObserver(() => {
        const tooltip = document.querySelector<HTMLElement>('.inline-code-feedback');
        if (!tooltip || getComputedStyle(tooltip).visibility !== 'visible') return;
        document.body.dataset.inlineFeedback = JSON.stringify({
          text: tooltip.textContent,
          above: tooltip.getBoundingClientRect().bottom < code.getBoundingClientRect().top,
        });
        observer.disconnect();
      });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
    });
    await descriptionCode.click();
    await expect.poll(() => page.locator('body').getAttribute('data-inline-feedback')).toBe(JSON.stringify({ text: '已复制', above: true }));
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ScriptInputArgs');
    await expect(disclosure).toHaveClass(/collapsed/);
    await page.screenshot({ path: 'test-results/inline-code-description.png' });
    await page.keyboard.up(modifier);
    await expect(descriptionCode).toHaveCSS('cursor', 'text');
    await expect(descriptionCode).toHaveCSS('color', normalColor);
    await expect(tooltip).toHaveCount(0);
    await descriptionCode.click();
    await expect(disclosure).not.toHaveClass(/collapsed/);
    await page.getByRole('button', { name: '收起说明' }).click();
    await descriptionCode.hover();
    await page.keyboard.down(modifier);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(descriptionCode).toHaveCSS('cursor', 'text');
    await expect(descriptionCode).toHaveCSS('color', normalColor);
    await page.keyboard.up(modifier);

    const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
    const previewCode = preview.locator('p > code').first();
    await previewCode.hover();
    await page.keyboard.down(modifier);
    await expect(previewCode).toHaveCSS('color', 'rgb(154, 52, 18)');
    await expect(previewCode).toHaveCSS('font-weight', '600');
    await expect(previewCode).toHaveCSS('cursor', 'pointer');
    await previewCode.click();
    await page.keyboard.up(modifier);
    await expect(tooltip).toHaveText('已复制');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('preview  value & <tag>');
    await page.screenshot({ path: 'test-results/inline-code-preview.png' });
    const originalUrl = page.url();
    // Ctrl is also accepted, and inline code inside a link copies instead of opening it.
    await preview.locator('a > code').dispatchEvent('click', { ctrlKey: true, button: 0 });
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('link-value');
    expect(page.url()).toBe(originalUrl);
    expect(context.pages()).toHaveLength(1);
    await descriptionFrame.locator('a > code').dispatchEvent('click', { metaKey: true, button: 0 });
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('description-link');
    await expect(disclosure).toHaveClass(/collapsed/);
    expect(context.pages()).toHaveLength(1);
    await page.evaluate(() => navigator.clipboard.writeText('keep-code-block-copy'));
    const blockCode = preview.locator('pre code');
    await blockCode.dispatchEvent('click', { metaKey: true, button: 0 });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('keep-code-block-copy');
    await page.keyboard.down(modifier);
    await blockCode.hover();
    expect(await blockCode.evaluate(el => getComputedStyle(el).cursor)).not.toBe('pointer');
    await page.keyboard.up(modifier);
    await page.getByRole('button', { name: '查看源代码' }).click();
    await expect(tooltip).toHaveCount(0);
    await expect(page.locator('.code-editor')).toBeVisible();
    await page.goto('./');
    await expect(tooltip).toHaveCount(0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('生产 Markdown 预览与源码离线切换，代码块和行内代码可复制', async ({ page, context }) => {
  test.skip(!production, '验证生产构建与离线缓存');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('snippet/linux/markdown-preview');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  const preview = page.getByRole('region', { name: 'Markdown 预览', exact: true });
  await expect(preview).toBeVisible();
  await expect(page.locator('.window-dot')).toHaveCount(3);
  await preview.getByRole('button', { name: '复制代码块 1', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm install\nnpm run dev');
  const inline = preview.locator('td code').first();
  await inline.click({ modifiers: [await page.evaluate(() => navigator.platform.includes('Mac') ? 'Meta' : 'Control')] });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('# 项目名称');
  await page.getByRole('button', { name: '查看源代码' }).click();
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.window-traffic-lights')).toHaveCount(0);
  await page.getByRole('button', { name: '切换到预览' }).click();
  await expect(preview).toBeVisible();
});
