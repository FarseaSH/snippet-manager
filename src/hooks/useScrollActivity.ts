import { useCallback, useEffect, useRef, useState } from 'react';

export function useScrollActivity() {
  const [scrolling, setScrolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onScroll = useCallback(() => {
    setScrolling(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setScrolling(false), 1000);
  }, []);
  return [scrolling, onScroll] as const;
}
