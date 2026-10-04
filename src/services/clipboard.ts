export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* use local selection fallback */ }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;left:-10000px;top:0';
  document.body.append(textarea);
  const focused = document.activeElement as HTMLElement | null;
  textarea.select();
  const success = document.execCommand('copy');
  textarea.remove();
  focused?.focus();
  if (!success) throw new Error('剪贴板不可用');
}

export function readPreference(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function savePreference(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* browsing remains available */ }
}
