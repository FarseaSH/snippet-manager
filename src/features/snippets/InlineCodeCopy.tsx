import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { copyText } from '../../services/clipboard';

interface Feedback { target: HTMLElement; success: boolean }
interface Props { children: ReactNode; resetKey?: string }

export function InlineCodeCopy({ children, resetKey }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef(0);
  const [modified, setModified] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const sync = (event: KeyboardEvent) => setModified(event.metaKey || event.ctrlKey);
    const reset = () => { request.current++; clearTimeout(timer.current); setModified(false); setFeedback(null); };
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
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => { request.current++; clearTimeout(timer.current); setFeedback(null); }, [resetKey]);

  useLayoutEffect(() => {
    if (!feedback) { setPosition(null); return; }
    const update = () => {
      const target = feedback.target;
      if (!rootRef.current?.contains(target) || getComputedStyle(target).visibility === 'hidden') { setFeedback(null); return; }
      const rect = target.getBoundingClientRect();
      const tooltip = tooltipRef.current?.getBoundingClientRect();
      if (!tooltip || rect.bottom < 0 || rect.top > innerHeight) { setFeedback(null); return; }
      const left = Math.max(8, Math.min(rect.left + (rect.width - tooltip.width) / 2, innerWidth - tooltip.width - 8));
      const top = rect.top - tooltip.height - 7;
      setPosition({ left, top: top >= 8 ? top : rect.bottom + 7 });
    };
    const dismiss = (event: globalThis.PointerEvent) => { if (!feedback.target.contains(event.target as Node)) setFeedback(null); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(feedback.target);
    const visibility = new IntersectionObserver(entries => { if (!entries[0]?.isIntersecting) setFeedback(null); });
    visibility.observe(feedback.target);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    document.addEventListener('pointerdown', dismiss, true);
    return () => {
      observer.disconnect();
      visibility.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('pointerdown', dismiss, true);
    };
  }, [feedback]);

  function inlineTarget(target: EventTarget): HTMLElement | null {
    const code = target instanceof Element ? target.closest<HTMLElement>('code') : null;
    return code && !code.closest('pre') && rootRef.current?.contains(code) ? code : null;
  }
  function pointer(event: PointerEvent<HTMLDivElement>) { setModified(event.metaKey || event.ctrlKey); }
  async function copy(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || !(event.metaKey || event.ctrlKey)) return;
    const target = inlineTarget(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const id = ++request.current;
    const text = target.textContent ?? '';
    let success = true;
    try { await copyText(text); } catch { success = false; }
    if (id !== request.current || !rootRef.current?.contains(target)) return;
    clearTimeout(timer.current);
    setFeedback({ target, success });
    timer.current = setTimeout(() => setFeedback(null), success ? 1500 : 2000);
  }

  return <div ref={rootRef} className={`inline-code-copy ${modified ? 'is-modified' : ''}`} onPointerOver={pointer} onPointerMove={pointer} onPointerLeave={() => setModified(false)} onPointerDownCapture={event => {
    if (event.button === 0 && (event.metaKey || event.ctrlKey) && inlineTarget(event.target)) event.preventDefault();
  }} onClickCapture={copy}>
    {children}
    {feedback && createPortal(<div ref={tooltipRef} className={`inline-code-feedback ${feedback.success ? 'is-success' : 'is-error'}`} role="status" aria-live="polite" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>
      {feedback.success && <Check size={12} aria-hidden="true" />}{feedback.success ? '已复制' : '复制失败，请重试'}
    </div>, document.body)}
  </div>;
}
