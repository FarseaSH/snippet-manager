import { useLayoutEffect, useRef, useState } from 'react';
import { copyModifierName, isCopyModifier, syncCopyModifier, useCopyModifier } from './useCopyModifier';

interface CopyEvent {
  button: number; clientX: number; clientY: number; target: EventTarget | null;
  ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean;
  preventDefault(): void; stopPropagation(): void;
}
export function useCodeCopyAction(enabled: boolean, version: unknown, onCopy: (() => Promise<boolean>) | undefined, contains: (event: CopyEvent) => boolean) {
  const modified = useCopyModifier();
  const [feedback, setFeedback] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const request = useRef(0);
  const pending = useRef(false);
  const press = useRef<{ x: number; y: number } | undefined>(undefined);
  function reset() {
    request.current++; pending.current = false; press.current = undefined;
    clearTimeout(timer.current); setFeedback('idle');
  }
  useLayoutEffect(() => { reset(); return () => { request.current++; clearTimeout(timer.current); }; }, [version]);
  useLayoutEffect(() => { if (!enabled || !modified) reset(); }, [enabled, modified]);
  function pointerDown(event: CopyEvent) {
    if (!enabled || !onCopy || event.button !== 0 || !isCopyModifier(event) || !contains(event)) return;
    event.preventDefault(); event.stopPropagation(); syncCopyModifier(event);
    press.current = { x: event.clientX, y: event.clientY };
  }
  async function click(event: CopyEvent) {
    const start = press.current; press.current = undefined;
    if (!enabled || !onCopy || event.button !== 0 || !isCopyModifier(event) || !contains(event) || !start) return;
    event.preventDefault(); event.stopPropagation();
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5 || pending.current) return;
    const id = ++request.current;
    pending.current = true; clearTimeout(timer.current); setFeedback('copying');
    let success = false;
    try { success = await onCopy(); } catch { /* callers provide clipboard feedback */ }
    if (request.current !== id) return;
    pending.current = false; setFeedback(success ? 'copied' : 'error');
    timer.current = setTimeout(() => setFeedback('idle'), 1200);
  }
  const label = feedback === 'copied' ? '已复制代码' : feedback === 'error' ? '复制失败，请重试' : feedback === 'copying' ? '正在复制…' : `${copyModifierName()} + 单击复制代码`;
  return { modified, feedback, label, pointerDown, click, cancel: () => { press.current = undefined; } };
}
