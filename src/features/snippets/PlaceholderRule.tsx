import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function PlaceholderRule({ name, pattern }: { name: string; pattern: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const open = hovered || focused || pinned;
  const rule = `/${pattern}/`;

  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (!trigger.current || !tooltip.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const bubble = tooltip.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(anchor.left, innerWidth - bubble.width - 8));
      const top = Math.max(8, Math.min(anchor.bottom + 6 + bubble.height <= innerHeight - 8 ? anchor.bottom + 6 : anchor.top - bubble.height - 6, innerHeight - bubble.height - 8));
      setPosition({ left, top });
    }
    function dismiss(event: Event) {
      if (event instanceof KeyboardEvent ? event.key !== 'Escape' : trigger.current?.contains(event.target as Node) || tooltip.current?.contains(event.target as Node)) return;
      setHovered(false); setFocused(false); setPinned(false);
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, [open, rule]);

  function enter() { clearTimeout(timer.current); setHovered(true); }
  function leave() { timer.current = setTimeout(() => setHovered(false), 150); }

  if (pattern.length <= 24) return <span className="placeholder-rule">{rule}</span>;
  return <>
    <button ref={trigger} type="button" className="placeholder-rule placeholder-rule-trigger" aria-label={`查看 ${name} 的完整规则`} aria-expanded={open} aria-describedby={open ? id : undefined}
      onMouseEnter={enter} onMouseLeave={leave} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onClick={() => setPinned(value => !value)}>/ … /</button>
    {open && createPortal(<div ref={tooltip} id={id} role="tooltip" className="placeholder-rule-tooltip" onMouseEnter={enter} onMouseLeave={leave}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>{rule}</div>, document.body)}
  </>;
}
