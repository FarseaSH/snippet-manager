import { useLayoutEffect, useState, type RefObject } from 'react';

export function useToastPlacement(anchor: RefObject<HTMLElement | null>, enabled: boolean, message: string) {
  const [position, setPosition] = useState({ left: innerWidth / 2, maxWidth: Math.max(0, innerWidth - 32) });
  useLayoutEffect(() => {
    const target = anchor.current;
    let frame = 0;
    function measure() {
      let left = 0, right = innerWidth;
      if (enabled && target?.isConnected && getComputedStyle(target).visibility !== 'hidden') {
        const rect = target.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth) {
          left = Math.max(0, rect.left); right = Math.min(innerWidth, rect.right);
        }
      }
      const next = { left: (left + right) / 2, maxWidth: Math.max(0, right - left - 32) };
      setPosition(previous => previous.left === next.left && previous.maxWidth === next.maxWidth ? previous : next);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); });
    }
    measure();
    const observer = new ResizeObserver(schedule);
    if (target) observer.observe(target);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    target?.addEventListener('animationend', schedule);
    target?.addEventListener('transitionend', schedule);
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      target?.removeEventListener('animationend', schedule);
      target?.removeEventListener('transitionend', schedule);
    };
  }, [anchor, enabled, message]);
  return position;
}
