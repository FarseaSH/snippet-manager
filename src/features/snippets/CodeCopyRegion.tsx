import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Check, Copy } from 'snippet-manager/icons/ui';

interface Props {
  children: ReactNode;
  enabled: boolean;
  ready: boolean;
  content: string;
  viewport(): HTMLElement | null | undefined;
  onCopy?: () => Promise<boolean>;
}
type Feedback = 'idle' | 'copying' | 'copied' | 'error';

export function CodeCopyRegion({ children, enabled, ready, content, viewport, onCopy }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [mac] = useState(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  const [modified, setModified] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; height: number }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const request = useRef(0);
  const pending = useRef(false);
  const press = useRef<{ x: number; y: number } | undefined>(undefined);
  const shortcut = (event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }) =>
    (mac ? event.metaKey : event.ctrlKey) && !event.altKey && !event.shiftKey;

  function resetFeedback() {
    request.current++;
    pending.current = false;
    press.current = undefined;
    clearTimeout(timer.current);
    setFeedback('idle');
  }
  useEffect(() => {
    const sync = (event: KeyboardEvent) => setModified(shortcut(event));
    const reset = () => { setModified(false); resetFeedback(); };
    const visibility = () => { if (document.hidden) reset(); };
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
      request.current++;
      clearTimeout(timer.current);
    };
  }, [mac]);
  useEffect(() => { resetFeedback(); }, [content]);
  useEffect(() => {
    if (!enabled) setModified(false);
    if (!enabled || !modified) resetFeedback();
  }, [enabled, modified]);
  function copyBounds() {
    const area = viewport();
    const container = root.current;
    if (!area || !container) return;
    const outer = container.getBoundingClientRect();
    const rect = area.getBoundingClientRect();
    const top = Math.max(0, rect.top - outer.top + area.clientTop);
    // Include the editor's left inset while keeping find panels and scrollbars usable.
    return {
      left: 0,
      top,
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
      if (!next) return;
      setBounds(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [enabled, ready, viewport]);

  function withinViewport(event: { clientX: number; clientY: number; target: EventTarget }) {
    const bounds = copyBounds();
    const container = root.current?.getBoundingClientRect();
    if (!bounds || !container) return false;
    if (event.target instanceof Element && event.target.closest('.cm-panels')) return false;
    const left = container.left + bounds.left, top = container.top + bounds.top;
    return event.clientX >= left && event.clientX < left + bounds.width && event.clientY >= top && event.clientY < top + bounds.height;
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || !ready || !onCopy || event.button !== 0 || !shortcut(event) || !withinViewport(event)) return;
    event.preventDefault(); event.stopPropagation();
    setModified(true);
    press.current = { x: event.clientX, y: event.clientY };
  }
  async function copy(event: MouseEvent<HTMLDivElement>) {
    const start = press.current;
    press.current = undefined;
    if (!enabled || !ready || !onCopy || event.button !== 0 || !shortcut(event) || !withinViewport(event) || !start) return;
    event.preventDefault(); event.stopPropagation();
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5 || pending.current) return;
    const id = ++request.current;
    pending.current = true;
    clearTimeout(timer.current);
    setFeedback('copying');
    let success = false;
    try { success = await onCopy(); } catch { /* The caller normally reports clipboard failures. */ }
    if (request.current !== id) return;
    pending.current = false;
    setFeedback(success ? 'copied' : 'error');
    timer.current = setTimeout(() => setFeedback('idle'), 1200);
  }
  const active = enabled && ready && modified && Boolean(bounds?.width && bounds?.height);
  const label = feedback === 'copied' ? '已复制代码' : feedback === 'error' ? '复制失败，请重试' : feedback === 'copying' ? '正在复制…' : `${mac ? '⌘' : 'Ctrl'} + 单击复制代码`;
  // Layout changes can synthesize pointer-over events with outdated modifier flags.
  // Only real pointer movement supplements the keyboard state.
  return <div ref={root} className="code-copy-region" onPointerMove={event => setModified(shortcut(event))} onPointerDownCapture={pointerDown} onPointerCancel={() => { press.current = undefined; }} onClickCapture={event => void copy(event)}>
    {children}
    {enabled && ready && <button type="button" tabIndex={-1} className={`code-copy-overlay${active ? ' is-active' : ''}`} style={bounds} aria-hidden={!active} aria-label={label}>
      <span className="code-copy-message">{feedback === 'copied' ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}<span>{label}</span></span>
    </button>}
  </div>;
}
