import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy } from 'snippet-manager/icons/ui';
import { useCodeCopyAction } from './useCodeCopyAction';
import { syncCopyModifier } from './useCopyModifier';

interface Props {
  children: ReactNode; enabled: boolean; ready: boolean; content: string;
  viewport(): HTMLElement | null | undefined;
  onCopy?: () => Promise<boolean>;
}
export function CodeCopyRegion({ children, enabled, ready, content, viewport, onCopy }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; height: number }>();
  function copyBounds() {
    const area = viewport(), container = root.current;
    if (!area || !container) return;
    const outer = container.getBoundingClientRect(), rect = area.getBoundingClientRect();
    const top = Math.max(0, rect.top - outer.top + area.clientTop);
    return {
      left: 0, top,
      width: Math.max(0, Math.min(container.clientWidth, rect.left - outer.left + area.clientLeft + area.clientWidth)),
      height: Math.max(0, Math.min(area.clientHeight, container.clientHeight - top)),
    };
  }
  useLayoutEffect(() => {
    if (!enabled || !ready) return;
    const area = viewport();
    if (!area || !root.current) return;
    const measure = () => {
      const next = copyBounds();
      if (next) setBounds(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area); observer.observe(root.current);
    return () => observer.disconnect();
  }, [enabled, ready, viewport]);
  function contains(event: { clientX: number; clientY: number; target: EventTarget | null }) {
    const bounds = copyBounds(), container = root.current?.getBoundingClientRect();
    if (!bounds || !container || event.target instanceof Element && event.target.closest('.cm-panels')) return false;
    const left = container.left + bounds.left, top = container.top + bounds.top;
    return event.clientX >= left && event.clientX < left + bounds.width && event.clientY >= top && event.clientY < top + bounds.height;
  }
  const action = useCodeCopyAction(enabled && ready, content, onCopy, contains);
  const active = enabled && ready && action.modified && Boolean(bounds?.width && bounds?.height);
  return <div ref={root} className="code-copy-region" onPointerMove={syncCopyModifier} onPointerDownCapture={action.pointerDown} onPointerCancel={action.cancel} onClickCapture={event => void action.click(event)}>
    {children}
    {enabled && ready && <button type="button" tabIndex={-1} className={`code-copy-overlay${active ? ' is-active' : ''}`} style={bounds} aria-hidden={!active} aria-label={action.label}>
      <span className="code-copy-message">{action.feedback === 'copied' ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}<span>{action.label}</span></span>
    </button>}
  </div>;
}
