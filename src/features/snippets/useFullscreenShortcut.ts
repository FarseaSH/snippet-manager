import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface Options { enabled?: boolean; scope?: RefObject<HTMLElement | null> }

export function useFullscreenShortcut(toggle: () => void, { enabled = true, scope }: Options = {}) {
  const action = useRef(toggle);
  useLayoutEffect(() => { action.current = toggle; }, [toggle]);
  useEffect(() => {
    if (!enabled) return;
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || !event.shiftKey || (event.code !== 'KeyF' && event.key.toLowerCase() !== 'f')) return;
      const target = event.target;
      const modal = document.querySelector('dialog:modal');
      // Embedded previews own shortcuts inside their dialog, including when an outer pane is expanded.
      if (modal && !scope?.current?.contains(modal)) return;
      if (scope) {
        if (!(target instanceof Node) || !scope.current?.contains(target)) return;
      } else if (target instanceof Element && target.closest('.html-code-dialog')) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) action.current();
    };
    window.addEventListener('keydown', shortcut, true);
    return () => window.removeEventListener('keydown', shortcut, true);
  }, [enabled, scope]);
}
