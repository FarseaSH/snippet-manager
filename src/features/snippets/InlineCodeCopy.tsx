import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy } from 'snippet-manager/icons/ui';
import { copyText } from '../../services/clipboard';
import { isInlineCopyModifier, syncCopyModifier, useCopyModifier, useCopyResetVersion } from './useCopyModifier';

interface Feedback { target: HTMLElement; success: boolean }
interface Props { children: ReactNode; resetKey?: string }

export function InlineCodeCopy({ children, resetKey }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef(0);
  const modified = useCopyModifier('either');
  const resetVersion = useCopyResetVersion();
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => () => { request.current++; clearTimeout(timer.current); }, []);
  useEffect(() => { request.current++; clearTimeout(timer.current); setFeedback(null); }, [resetKey, resetVersion]);
  useLayoutEffect(() => {
    const next = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('code') ?? []).filter(code => !code.closest('pre') && !code.closest('[data-tab-id]'));
    setTargets(previous => previous.length === next.length && previous.every((node, index) => node === next[index]) ? previous : next);
    if (feedback && !rootRef.current?.contains(feedback.target)) { request.current++; setFeedback(null); }
  }, [children, resetKey]);

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
  async function copy(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || !isInlineCopyModifier(event)) return;
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

  return <div ref={rootRef} className={`inline-code-copy ${modified ? 'is-modified' : ''}`} onPointerMove={syncCopyModifier} onPointerDownCapture={event => {
    if (event.button === 0 && isInlineCopyModifier(event) && inlineTarget(event.target)) event.preventDefault();
  }} onClickCapture={copy}>
    {children}
    {targets.map((target, index) => createPortal(<Copy className="inline-code-icon" size={12} aria-hidden="true" focusable="false" />, target, String(index)))}
    {feedback && createPortal(<div ref={tooltipRef} className={`inline-code-feedback ${feedback.success ? 'is-success' : 'is-error'}`} role="status" aria-live="polite" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>
      {feedback.success && <Check size={12} aria-hidden="true" />}{feedback.success ? '已复制' : '复制失败，请重试'}
    </div>, document.body)}
  </div>;
}
