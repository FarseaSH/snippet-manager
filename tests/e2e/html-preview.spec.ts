import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';

const name = `__html-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
const route = `snippet/${name}`;
let resourceBase = '';
let failResource = false;
// Real cross-origin responses exercise opaque iframe loading and browser CORS.
// CDP request interception does not reliably see opaque iframe subresources.
const resources = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (failResource && request.url === '/lib.js') { response.statusCode = 503; response.end('Unavailable'); return; }
  response.setHeader('Content-Type', request.url?.endsWith('.css') ? 'text/css' : 'text/javascript');
  response.end(request.url === '/main.css' ? 'h1 { color: rgb(10, 30, 50) }' : request.url === '/module.js' ? 'export const remote = 2;' : 'window.order.push("cdn");');
});
test.beforeAll(async () => {
  await new Promise<void>(resolve => resources.listen(0, '127.0.0.1', resolve));
  const address = resources.address();
  resourceBase = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
test.afterAll(async () => { resources.closeAllConnections(); await new Promise<void>(resolve => resources.close(() => resolve())); });
const rawSnippet = (parts: [string, string, string][]) => '---\nsnippet_name: HTML Preview\nsnippet_tags: [html]\n---\n\n' + parts.map(([title, language, code]) => `# ${title}\n\n\`\`\`${language}\n${code}\n\`\`\``).join('\n\n');
test.beforeEach(async ({ context }) => {
  test.skip(process.env.APP_TEST_MODE === 'production', '使用独立的 HTML 示例验证开发与交互');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fs.copyFile(path.resolve('docs/examples/html-preview.md'), file);
  failResource = false;
});
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('HTML 默认预览同组 CSS 和 JS 模块，复制原文，切换源码、Tab、全屏及重跑', async ({ page, request }) => {
  const raw = await fs.readFile(file, 'utf8');
  await page.goto(route);
  const preview = page.frameLocator('iframe[title="index.html HTML 预览"]');
  const counter = preview.locator('#counter');
  await expect(counter).toHaveText('点击次数：0');
  await expect(counter).toHaveCSS('background-color', 'rgb(194, 65, 12)');
  await counter.click();
  await counter.click();
  await page.getByRole('tab', { name: 'assets/style.css', exact: true }).click();
  await page.getByRole('tab', { name: 'index.html', exact: true }).click();
  await expect(counter).toHaveText('点击次数：2');
  await page.getByRole('button', { name: '查看源代码', exact: true }).click();
  await expect(page.locator('.code-editor')).toHaveAttribute('data-state', 'ready');
  await page.getByRole('button', { name: '复制 HTML', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('href="./assets/style.css"');
  expect(copied).toContain('src="./assets/main.js"');
  expect(copied).not.toContain('blob:');
  await page.getByRole('button', { name: '切换到预览', exact: true }).click();
  await expect(counter).toHaveText('点击次数：2');
  await page.getByRole('button', { name: '展开代码', exact: true }).click();
  await counter.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '展开代码', exact: true })).toBeVisible();
  await expect(counter).toHaveText('点击次数：2');
  await page.getByRole('button', { name: '重新运行 HTML', exact: true }).click();
  await expect(counter).toHaveText('点击次数：0');
  expect(await (await request.get(`raw/${name}.md`)).text()).toBe(raw);
});

test('多个 HTML 页面独立保持状态，HTML 与依赖参数按 500ms 更新，手机可用', async ({ page }) => {
  await page.goto(route);
  const frame = page.frameLocator('iframe[title="index.html HTML 预览"]');
  await expect(frame.locator('#counter')).toHaveText('点击次数：0');
  await frame.locator('#counter').click();
  await page.getByRole('tab', { name: 'second.html', exact: true }).click();
  const second = page.frameLocator('iframe[title="second.html HTML 预览"]');
  await second.getByRole('textbox').fill('保留留言');
  await page.getByRole('tab', { name: 'index.html', exact: true }).click();
  await expect(frame.locator('#counter')).toHaveText('点击次数：1');
  await page.getByLabel('name', { exact: true }).fill('新的名字');
  await expect(frame.getByRole('heading')).toHaveText('你好，新的名字');
  await expect(frame.locator('#counter')).toHaveText('点击次数：0');
  await page.getByRole('tab', { name: 'assets/main.js', exact: true }).click();
  await page.getByLabel('start', { exact: true }).fill('12');
  await page.getByRole('tab', { name: 'index.html', exact: true }).click();
  await expect(frame.locator('#counter')).toHaveText('点击次数：12');
  await page.getByRole('tab', { name: 'second.html', exact: true }).click();
  await expect(second.getByRole('textbox')).toHaveValue('保留留言');
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.getByRole('dialog', { name: '片段详情', exact: true })).toHaveCSS('transform', 'none');
  await expect(second.getByRole('textbox')).toBeVisible();
  await expect(second.getByRole('textbox')).toHaveValue('保留留言');
  await expect(page.getByRole('button', { name: '复制 HTML', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: '重新运行 HTML', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/html-preview-mobile.png' });
});

test('支持模块循环、再导出、动态导入、import map，以及 CSS SVG 资源和查询参数', async ({ page }) => {
  await fs.writeFile(file, rawSnippet([
    ['pages/index.html', 'html', '<link rel="stylesheet" href="../css/main.css"><script type="importmap">{"imports":{"alias":"../js/util.js"}}</script><h1 id="result">waiting</h1><script type="module" src="../js/main.js"></script>'],
    ['css/main.css', 'css', '@import "./theme.css"; h1 { background-image: url("../icon.svg#symbol"); }'],
    ['css/theme.css', 'css', 'h1 { color: rgb(20, 80, 120); }'],
    ['icon.svg', 'xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="red"/></svg>'],
    ['js/main.js', 'js', `import { value } from "./cycle.js"; import { extra } from "alias"; import { remote } from "${resourceBase}/module.js"; const later = await import("./util.js?v=2#module"); document.querySelector("#result").textContent = value + extra + later.extra + remote; export function stable() { return 3; }`],
    ['js/cycle.js', 'js', 'import { stable } from "./main.js"; export const value = stable();'],
    ['js/util.js', 'js', 'export { extra } from "./data.js";'],
    ['js/data.js', 'js', 'export const extra = 4;'],
  ]));
  await page.goto(route);
  const result = page.frameLocator('iframe').locator('#result');
  await expect(result).toHaveText('13');
  await expect(result).toHaveCSS('color', 'rgb(20, 80, 120)');
  await expect(result).toHaveCSS('background-image', /blob:.*#symbol/);
  await expect(page.locator('.html-preview-errors')).toHaveCount(0);
});

test('CDN 样式、普通及 defer 脚本保留浏览器顺序，资源和运行错误显示提示', async ({ page }) => {
  await fs.writeFile(file, rawSnippet([
    ['index.html', 'html', `<link rel="stylesheet" href="${resourceBase}/main.css"><script>window.order = ["inline"]</script><script src="${resourceBase}/lib.js"></script><script defer src="./deferred.js"></script><h1 id="result"></h1><script>window.order.push("body")</script>`],
    ['deferred.js', 'js', 'document.querySelector("#result").textContent = window.order.join(",");'],
  ]));
  await page.goto(route);
  const result = page.frameLocator('iframe').locator('#result');
  await expect(result).toHaveText('inline,cdn,body');
  await expect(result).toHaveCSS('color', 'rgb(10, 30, 50)');
  failResource = true;
  await page.getByRole('button', { name: '重新运行 HTML', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('资源加载失败');
  await expect(page.getByRole('alert')).toContainText(`${resourceBase}/lib.js`);
});

test('沙箱隔离应用 DOM 与存储，脚本错误可见，消息不能伪造跨窗口操作', async ({ page }) => {
  await fs.writeFile(file, rawSnippet([['index.html', 'html', '<h1 id="status"></h1><script>let blocked=0; try {parent.document.body} catch {blocked++} try {localStorage.getItem("x")} catch {blocked++} document.querySelector("#status").textContent=blocked; window.parent.postMessage({channel:"snippet-html",type:"error",message:"spoof"},"*"); setTimeout(()=>{throw new Error("示例异常")},20)</script>']]));
  await page.goto(route);
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('2');
  await expect(page.getByRole('alert')).toContainText('示例异常');
  await expect(page.getByRole('alert')).not.toContainText('spoof');
  await expect(page.getByRole('textbox', { name: '搜索代码片段', exact: true })).toBeVisible();
});

test('文件缺失、重名、类型不符和越界有具体提示，源码仍然可读可复制', async ({ page }) => {
  const cases: { parts: [string, string, string][]; message: string }[] = [
    { parts: [['index.html', 'html', '<link rel="stylesheet" href="./missing.css">']], message: '找不到同组文件' },
    { parts: [['index.html', 'html', '<script src="./a.js"></script>'], ['a.js', 'js', ''], ['./a.js', 'js', '']], message: '文件名重复' },
    { parts: [['index.html', 'html', '<script src="./a.js"></script>'], ['a.js', 'text', 'hello']], message: 'javascript' },
    { parts: [['index.html', 'html', '<link rel="stylesheet" href="../outside.css">']], message: '超出当前片段组' },
  ];
  for (const item of cases) {
    await fs.writeFile(file, rawSnippet(item.parts));
    await page.goto(route);
    await expect(page.getByRole('alert')).toContainText(item.message);
    await page.getByRole('button', { name: '查看源代码', exact: true }).click();
    await page.getByRole('button', { name: '复制 HTML', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(item.parts[0][2]);
  }
});
