import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const name = `__input-history-${process.pid}`;
const file = path.resolve(process.env.SNIPPETS_DIR || 'snippets', `${name}.md`);
const route = `snippet/${name}`;
const front = '---\nsnippet_name: Input History\nsnippet_tags: []\n---\n\n';
const parts = (items: [string, string][]) => front + items.map(([title, code]) => `# ${title}\n\n\`\`\`text\n${code}\n\`\`\``).join('\n\n');
const transform = (prefix = '') => '---\nsnippet_name: Transform History\nsnippet_tags: []\nsnippet_type: transform\ntransform:\n  example: sample\n---\n\n```js\nexport default input => ({ ok: true, output: ' + JSON.stringify(prefix) + ' + input });\n```';
const field = (page: Page, name = 'name') => page.getByRole('textbox', { name, exact: true });
const clipboard = (page: Page) => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));

async function records(page: Page) {
  return page.evaluate(() => new Promise<{ path: string; group: string; name: string; value: string }[]>((resolve, reject) => {
    const request = indexedDB.open('snippet-manager-inputs', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('inputs', 'readonly');
      const read = tx.objectStore('inputs').getAll();
      tx.oncomplete = () => { db.close(); resolve(read.result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
}

async function failures(page: Page) {
  await page.addInitScript(() => {
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<IDBFactory['open']>) => {
      const mode = sessionStorage.getItem('history-mode');
      if (mode === 'throw') throw new DOMException('Storage unavailable', 'SecurityError');
      if (mode === 'hang' || mode === 'blocked') {
        const request = {} as IDBOpenDBRequest;
        if (mode === 'blocked') setTimeout(() => request.onblocked?.call(request, new IDBVersionChangeEvent('blocked')), 0);
        return request;
      }
      const request = originalOpen(...args);
      if (mode !== 'delay' && mode !== 'late') return request;
      return new Proxy(request, {
        get(target, key) { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; },
        set(target, key, value) {
          return Reflect.set(target, key, key === 'onsuccess' ? (event: Event) => setTimeout(() => value.call(target, event), mode === 'late' ? 1400 : 650) : value, target);
        },
      });
    }) as IDBFactory['open'];
    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      if (sessionStorage.getItem('history-mode') === 'write-error' && args[1] === 'readwrite') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return originalTransaction.apply(this, args);
    };
  });
}

test.beforeEach(async ({ context }) => {
  test.skip(process.env.APP_TEST_MODE === 'production', '使用临时片段验证本地输入历史');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});
test.afterEach(async () => { await fs.rm(file, { force: true }); });

test('参数跨页面、刷新和新窗口恢复实际输入，默认值保持灰色，重置只删除当前 Tab', async ({ page }) => {
  await fs.writeFile(file, parts([
    ['First', 'name=@name::demo@\nuntouched=@untouched::default@\naccepted=@accepted::same@\nblank=@blank@'],
    ['Second', 'name=@name::second@'],
  ]));
  await page.goto(route);
  await field(page).fill('  alice  ');
  await field(page, 'accepted').focus();
  await field(page, 'accepted').press('ArrowRight');
  await field(page, 'blank').fill('erase');
  await field(page, 'blank').fill('');
  await page.getByRole('tab', { name: 'Second', exact: true }).click();
  await field(page).fill('other-tab');
  // Leave before the 300ms debounce has fired.
  await page.goto('snippet/git/branch');
  await page.goto(route);
  await expect(field(page)).toHaveValue('  alice  ');
  await expect(field(page, 'untouched')).toHaveValue('');
  await expect(field(page, 'untouched').locator('..').locator('.placeholder-default')).toHaveText('default');
  await expect(field(page, 'accepted')).toHaveValue('same');
  await expect(field(page, 'accepted').locator('..').locator('.placeholder-default')).toHaveCount(0);
  await page.locator('.copy-code').click();
  expect(await clipboard(page)).toContain('blank=');
  expect(await clipboard(page)).not.toContain('@blank@');
  await page.reload();
  await expect(field(page)).toHaveValue('  alice  ');
  const reopened = await page.context().newPage();
  await reopened.goto(new URL(route, page.url().replace(/snippet\/.*/, '')).href);
  await expect(field(reopened)).toHaveValue('  alice  ');
  await reopened.close();
  await page.getByRole('button', { name: '重置参数', exact: true }).click();
  await page.reload();
  await expect(field(page)).toHaveValue('');
  await expect(field(page).locator('..').locator('.placeholder-default')).toHaveText('demo');
  await page.getByRole('tab', { name: 'Second', exact: true }).click();
  await expect(field(page)).toHaveValue('other-tab');
  expect((await records(page)).some(record => record.name === 'accepted')).toBe(false);
});

test('转换输入完整保存，恢复后用当前函数重新转换，清空及填入示例也持久化', async ({ page }) => {
  await fs.writeFile(file, transform());
  await page.goto(route);
  const input = field(page, '转换输入');
  const text = '  first\n\n' + 'last line  '.repeat(3000);
  await input.fill(text);
  await page.reload();
  await expect.poll(async () => (await records(page)).find(record => record.group === 'transform')?.value).toBe(text);
  await expect(page.locator('.cm-content').first()).toContainText('first');
  await fs.writeFile(file, transform('v2:'));
  await page.reload();
  const copy = page.getByRole('region', { name: '输出区', exact: true }).getByRole('button', { name: '复制结果', exact: true });
  await expect(copy).toBeEnabled();
  await copy.click();
  expect(await clipboard(page)).toBe('v2:' + text);
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await page.reload();
  await expect(input).toHaveText('');
  await expect(copy).toBeDisabled();
  await page.getByRole('button', { name: '填入示例', exact: true }).click();
  await page.reload();
  await expect(copy).toBeEnabled();
  await copy.click();
  expect(await clipboard(page)).toBe('v2:sample');
});

test('命名 Tab 调整顺序后参数归属不变，变更约束重新校验，新增变量使用新默认值', async ({ page }) => {
  await fs.writeFile(file, parts([['First', '@name::demo@ @removed@'], ['Second', '@name::other@']]));
  await page.goto(route);
  await field(page).fill('alice');
  await page.getByRole('tab', { name: 'Second', exact: true }).click();
  await field(page).fill('bob');
  await page.getByRole('heading', { name: 'Input History', exact: true }).click();
  await fs.writeFile(file, parts([['Second', '@name::other@'], ['Inserted', '@name::new@'], ['First', '@name:number:1@ @new::fresh@']]));
  await page.reload();
  await expect(field(page)).toHaveValue('bob');
  await page.getByRole('tab', { name: 'First', exact: true }).click();
  await expect(field(page)).toHaveValue('alice');
  await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.placeholder-hint')).toHaveText('请输入有效数字，支持负数和小数');
  await expect(field(page, 'removed')).toHaveCount(0);
  await expect(field(page, 'new').locator('..').locator('.placeholder-default')).toHaveText('fresh');
  await page.getByRole('tab', { name: 'Inserted', exact: true }).click();
  await expect(field(page)).toHaveValue('');
});

for (const mode of ['throw', 'blocked', 'hang', 'late']) {
  test(`历史读取 ${mode} 时输入与复制仍可用，失败回退不覆盖已有记录`, async ({ page }) => {
    await failures(page);
    await fs.writeFile(file, parts([['First', '@name::demo@']]));
    await page.goto(route);
    await field(page).fill('saved');
    await page.getByRole('heading', { name: 'Input History', exact: true }).click();
    await expect.poll(async () => (await records(page))[0]?.value).toBe('saved');
    await page.evaluate(mode => sessionStorage.setItem('history-mode', mode), mode);
    await page.reload();
    await expect(field(page)).toHaveValue('');
    await expect(field(page).locator('..').locator('.placeholder-default')).toHaveText('demo');
    await page.waitForTimeout(1600);
    await expect(field(page)).toHaveValue('');
    await page.locator('.copy-code').click();
    expect(await clipboard(page)).toBe('demo');
    await field(page).fill('usable');
    await page.locator('.copy-code').click();
    expect(await clipboard(page)).toBe('usable');
    await page.waitForTimeout(1600);
    await page.evaluate(() => sessionStorage.removeItem('history-mode'));
    await page.reload();
    await expect(field(page)).toHaveValue('saved');
  });
}

test('慢速恢复只补充未编辑字段，用户输入和重置都不被历史覆盖', async ({ page }) => {
  await failures(page);
  await fs.writeFile(file, parts([['First', '@name::demo@ @other::default@'], ['Second', '@name::second@']]));
  await page.goto(route);
  await field(page).fill('saved');
  await field(page, 'other').fill('untouched-history');
  await page.getByRole('heading', { name: 'Input History', exact: true }).click();
  await expect.poll(async () => (await records(page)).length).toBe(2);
  await page.evaluate(() => sessionStorage.setItem('history-mode', 'delay'));
  await page.reload();
  await field(page).fill('new-input');
  await expect(field(page, 'other')).toHaveValue('untouched-history');
  await expect(field(page)).toHaveValue('new-input');
  await page.reload();
  await page.getByRole('button', { name: '重置参数', exact: true }).click();
  await page.waitForTimeout(900);
  await expect(field(page)).toHaveValue('');
  await expect(field(page, 'other')).toHaveValue('');
  await page.evaluate(() => sessionStorage.removeItem('history-mode'));
  await page.reload();
  await expect(field(page)).toHaveValue('');
  await expect(field(page, 'other')).toHaveValue('');
});

test('保存失败不影响输入和转换，失败期间的初始状态也不删除已有历史', async ({ page }) => {
  await failures(page);
  await fs.writeFile(file, transform());
  await page.goto(route);
  const input = field(page, '转换输入');
  await input.fill('saved');
  await page.getByRole('heading', { name: /^Transform History/ }).click();
  await expect.poll(async () => (await records(page))[0]?.value).toBe('saved');
  await page.evaluate(() => sessionStorage.setItem('history-mode', 'write-error'));
  await input.fill('new-unsaved');
  const copy = page.getByRole('region', { name: '输出区', exact: true }).getByRole('button', { name: '复制结果', exact: true });
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect.poll(() => clipboard(page)).toBe('new-unsaved');
  await page.evaluate(() => sessionStorage.removeItem('history-mode'));
  await page.reload();
  await expect(copy).toBeEnabled();
  await copy.click();
  expect(await clipboard(page)).toBe('saved');
});
