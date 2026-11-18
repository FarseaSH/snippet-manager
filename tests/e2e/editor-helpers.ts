import { expect, type Page } from '@playwright/test';

export async function editorSnapshot(page: Page) {
  return page.locator('.cm-editor').first().evaluate(element => {
    const scroller = element.querySelector('.cm-scroller')!;
    const host = element as HTMLElement;
    host.dataset.testInstance ||= crypto.randomUUID();
    return { top: scroller.scrollTop, left: scroller.scrollLeft, model: host.dataset.testInstance };
  });
}

export async function setEditorScroll(page: Page, top: number) {
  await page.locator('.cm-scroller').first().evaluate((element, value) => { element.scrollTop = value; }, top);
  await expect.poll(async () => (await editorSnapshot(page)).top).toBe(top);
}
