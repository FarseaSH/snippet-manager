import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy } from 'snippet-manager/icons/ui';
import { useCodeCopyAction } from './useCodeCopyAction';
import { useCopyGeometry } from './useCopyModifier';
import { useMarkdownCodeSelection } from './useMarkdownCodeSelection';

interface Props { host: HTMLElement; enabled?: boolean; version: unknown; onCopy(): Promise<boolean> }
function clientBox(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  return { left: rect.left + node.clientLeft, top: rect.top + node.clientTop, right: rect.left + node.clientLeft + node.clientWidth, bottom: rect.top + node.clientTop + node.clientHeight };
}
export function MarkdownCodeCopyOverlay({ host, enabled = true, version, onCopy }: Props) {
  useMarkdownCodeSelection(host, enabled, version);
  const container = host.parentElement;
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; height: number }>();
  function measure() {
    if (!container?.isConnected || !host.isConnected || getComputedStyle(host).visibility === 'hidden' || !host.getClientRects().length) return;
    const area = clientBox(host);
    const pre = host.querySelector('pre');
    if (pre) area.bottom -= Math.max(0, pre.offsetHeight - pre.clientHeight);
    for (let parent = host.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const clipX = /auto|scroll|hidden|clip/.test(style.overflowX);
      const clipY = /auto|scroll|hidden|clip/.test(style.overflowY);
      if (clipX || clipY) {
        const clip = clientBox(parent);
        if (clipX) { area.left = Math.max(area.left, clip.left); area.right = Math.min(area.right, clip.right); }
        if (clipY) { area.top = Math.max(area.top, clip.top); area.bottom = Math.min(area.bottom, clip.bottom); }
      }
    }
    area.left = Math.max(0, area.left); area.top = Math.max(0, area.top);
    area.right = Math.min(innerWidth, area.right); area.bottom = Math.min(innerHeight, area.bottom);
    const origin = clientBox(container);
    return { left: area.left - origin.left + container.scrollLeft, top: area.top - origin.top + container.scrollTop, width: Math.max(0, area.right - area.left), height: Math.max(0, area.bottom - area.top) };
  }
  const action = useCodeCopyAction(enabled, version, onCopy, event => {
    const next = measure();
    if (!next || !container) return false;
    const origin = clientBox(container);
    const left = origin.left + next.left - container.scrollLeft, top = origin.top + next.top - container.scrollTop;
    return event.clientX >= left && event.clientX < left + next.width && event.clientY >= top && event.clientY < top + next.height;
  });
  const handlers = useRef(action);
  useLayoutEffect(() => { handlers.current = action; });
  const geometry = useCopyGeometry(enabled && action.modified);
  useLayoutEffect(() => {
    if (!enabled || !action.modified || !container) return;
    const update = () => setBounds(measure());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host); observer.observe(container);
    return () => observer.disconnect();
  }, [host, container, enabled, action.modified, geometry]);
  useLayoutEffect(() => {
    if (!container || !enabled) return;
    const down = (event: PointerEvent) => handlers.current.pointerDown(event);
    const click = (event: MouseEvent) => { void handlers.current.click(event); };
    const cancel = () => handlers.current.cancel();
    container.addEventListener('pointerdown', down, true);
    container.addEventListener('click', click, true);
    container.addEventListener('pointercancel', cancel);
    return () => { container.removeEventListener('pointerdown', down, true); container.removeEventListener('click', click, true); container.removeEventListener('pointercancel', cancel); };
  }, [container, enabled]);
  if (!container || !enabled) return null;
  const active = action.modified && Boolean(bounds?.width && bounds?.height);
  return createPortal(<button type="button" tabIndex={-1} aria-hidden={!active} aria-label={action.label} className={`code-copy-overlay markdown-code-copy${active ? ' is-active' : ''}`} style={bounds}>
    <span className="code-copy-message">{action.feedback === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}<span>{action.label}</span></span>
  </button>, container);
}
