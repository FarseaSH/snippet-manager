import { useLayoutEffect, useSyncExternalStore, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { WrapText } from 'snippet-manager/icons/ui';

// Page-memory preference shared by every editor, including newly mounted snippets.
// Navigating does not reset it; reloading the page starts with wrapping disabled.
let wrapping = false;
const subscribers = new Set<() => void>();
function subscribe(notify: () => void) { subscribers.add(notify); return () => { subscribers.delete(notify); }; }
function toggleWrapping() { wrapping = !wrapping; subscribers.forEach(notify => notify()); }
const snapshot = () => wrapping;
export function useCodeWrapping(): [boolean, () => void] {
  return [useSyncExternalStore(subscribe, snapshot, () => false), toggleWrapping];
}
export function CodeWrapButton({ enabled, onToggle }: { enabled: boolean; onToggle(): void }) {
  const label = enabled ? '关闭自动换行' : '开启自动换行';
  return <button type="button" className="code-wrap-button" aria-label={label} title={label} aria-pressed={enabled} onClick={onToggle}><WrapText size={16} aria-hidden="true" /></button>;
}

interface ScrollAnchor { line: HTMLElement; top: number; priority: number; lineHeight: number }
const scrollAnchors = new Map<HTMLElement, ScrollAnchor>();
let anchorFrame = 0;
function captureScrollAnchor(host: HTMLElement, pre: HTMLElement) {
  if (!pre.isConnected || !pre.getClientRects().length || getComputedStyle(pre).visibility === 'hidden') return;
  for (let scroller: HTMLElement | null = host; scroller; scroller = scroller.parentElement) {
    if (!/auto|scroll/.test(getComputedStyle(scroller).overflowY) || scroller.scrollHeight <= scroller.clientHeight) continue;
    const viewport = scroller.getBoundingClientRect(), area = pre.getBoundingClientRect();
    if (area.bottom <= viewport.top || area.top >= viewport.bottom) break;
    const lines = Array.from(pre.querySelectorAll<HTMLElement>('code > .line'));
    let low = 0, high = lines.length;
    while (low < high) { const middle = (low + high) >>> 1; if (lines[middle].getBoundingClientRect().bottom < viewport.top) low = middle + 1; else high = middle; }
    if (low < lines.length) {
      const top = lines[low].getBoundingClientRect().top - viewport.top;
      const priority = Math.max(0, top);
      const previous = scrollAnchors.get(scroller);
      if (!previous || priority < previous.priority) scrollAnchors.set(scroller, { line: lines[low], top, priority, lineHeight: parseFloat(getComputedStyle(pre).lineHeight) });
    }
    break;
  }
  if (!scrollAnchors.size || anchorFrame) return;
  // Every code block can change in the same commit. Restore one visible line per
  // shared viewport after all blocks have reflowed, rather than moving it once
  // for each code block (which would scroll to the last block).
  anchorFrame = requestAnimationFrame(() => {
    anchorFrame = 0;
    const changes: { scroller: HTMLElement; delta: number }[] = [];
    for (const [scroller, anchor] of scrollAnchors) {
      if (!scroller.isConnected || !anchor.line.isConnected || !anchor.line.getClientRects().length) continue;
      const rect = anchor.line.getBoundingClientRect();
      const top = Math.max(anchor.top, -Math.max(0, rect.height - anchor.lineHeight));
      changes.push({ scroller, delta: rect.top - scroller.getBoundingClientRect().top - top });
    }
    scrollAnchors.clear();
    changes.forEach(({ scroller, delta }) => { scroller.scrollTop += delta; });
  });
}

export function useStaticCodeWrapping(root: HTMLElement | RefObject<HTMLElement | null> | null, enabled: boolean, version: unknown) {
  useLayoutEffect(() => {
    const host = root && 'current' in root ? root.current : root;
    const pre = host?.querySelector<HTMLElement>('pre');
    if (!host || !pre) return;
    const gutter = host.querySelector<HTMLElement>('.preview-line-numbers, .line-numbers');
    host.classList.toggle('is-code-wrapped', enabled);
    if (enabled) pre.scrollLeft = 0;
    let frame = 0;
    function measure() {
      frame = 0;
      if (!gutter || !pre!.getClientRects().length) return;
      const lineHeight = parseFloat(getComputedStyle(pre!).lineHeight);
      const heights = Array.from(pre!.querySelectorAll<HTMLElement>('code > .line')).map(line => Math.max(1, Math.ceil((line.getBoundingClientRect().height - .5) / lineHeight)) * lineHeight);
      Array.from(gutter.children).forEach((number, index) => {
        const style = (number as HTMLElement).style;
        if (enabled && heights[index]) style.height = `${heights[index]}px`; else style.removeProperty('height');
      });
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
    measure();
    const observer = new ResizeObserver(schedule); observer.observe(pre);
    const code = pre.querySelector('code'); if (code) observer.observe(code);
    document.fonts.addEventListener('loadingdone', schedule);
    return () => {
      captureScrollAnchor(host, pre);
      observer.disconnect(); cancelAnimationFrame(frame); document.fonts.removeEventListener('loadingdone', schedule);
      host.classList.remove('is-code-wrapped');
      if (gutter) Array.from(gutter.children).forEach(number => (number as HTMLElement).style.removeProperty('height'));
    };
  }, [root, enabled, version]);
}
export function MarkdownCodeWrapping({ host, active }: { host: HTMLElement; active: boolean }) {
  const [wrapping, toggle] = useCodeWrapping();
  useStaticCodeWrapping(host, wrapping, host);
  const header = host.parentElement?.querySelector<HTMLElement>('.preview-code-header');
  return active && header ? createPortal(<div className="preview-wrap-action"><CodeWrapButton enabled={wrapping} onToggle={toggle} /></div>, header) : null;
}
