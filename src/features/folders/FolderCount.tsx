import { useLayoutEffect, useRef, useState } from 'react';

export function FolderCount({ count, expanded }: { count: number; expanded: boolean }) {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const incomingRef = useRef<HTMLSpanElement>(null);
  const outgoingRef = useRef<HTMLSpanElement>(null);
  const previousCount = useRef(count);
  const [numbers, setNumbers] = useState({ current: count, previous: count });

  useLayoutEffect(() => {
    const previous = previousCount.current;
    previousCount.current = count;
    if (previous === count) return;
    // Keep the last number in place while the whole badge fades to zero.
    if (count > 0) setNumbers({ current: count, previous });
    if (!previous || !count || !badgeRef.current?.closest('.folder-tree.is-ready') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const offset = expanded ? 3 : -3;
    const options = { duration: 250, easing: 'ease-in-out' };
    const incoming = incomingRef.current?.animate([
      { opacity: 0, transform: `translateY(${offset}px)` },
      { opacity: 1, transform: 'translateY(0px)' },
    ], options);
    const outgoing = outgoingRef.current?.animate([
      { opacity: 1, transform: 'translateY(0px)' },
      { opacity: 0, transform: `translateY(${-offset}px)` },
    ], options);
    // A new target cancels the previous animation instead of queuing changes.
    return () => { incoming?.cancel(); outgoing?.cancel(); };
  }, [count, expanded]);

  const hint = `${expanded ? '当前文件夹' : '包含子文件夹'}：${count} 个片段`;
  const digits = String(count || numbers.current).length;
  return <span ref={badgeRef} className={`folder-count folder-count-animated${count === 0 ? ' is-hidden' : ''}`} title={hint} aria-label={hint} aria-hidden={count === 0 || undefined} style={{ width: `max(22px, calc(${digits}ch + 12px))` }}>
    <span className="folder-count-numbers" aria-hidden="true">
      <span ref={incomingRef} className="folder-count-current">{numbers.current}</span>
      <span ref={outgoingRef} className="folder-count-previous">{numbers.previous}</span>
    </span>
  </span>;
}
