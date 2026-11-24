import { useCallback, useEffect, useSyncExternalStore } from 'react';

type Modifiers = { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };
const subscribers = new Set<() => void>();
let modified = false;
let inlineModified = false;
let composing = false;
let resetVersion = 0;

export const copyModifierName = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl';
export const isCopyModifier = (event: Modifiers) => !composing && (copyModifierName() === '⌘' ? event.metaKey : event.ctrlKey) && !event.altKey && !event.shiftKey;
export const isInlineCopyModifier = (event: Modifiers) => !composing && (event.metaKey || event.ctrlKey);
function update(next: boolean, nextInline: boolean) {
  if (next === modified && nextInline === inlineModified) return;
  modified = next; inlineModified = nextInline;
  subscribers.forEach(notify => notify());
}
export function syncCopyModifier(event: Modifiers) { update(isCopyModifier(event), isInlineCopyModifier(event)); }
function reset() { composing = false; modified = false; inlineModified = false; resetVersion++; subscribers.forEach(notify => notify()); }
function visibility() { if (document.hidden) reset(); }
function compositionStart() { composing = true; update(false, false); }
function compositionEnd() { composing = false; }
function subscribe(notify: () => void) {
  subscribers.add(notify);
  if (subscribers.size === 1) {
    window.addEventListener('keydown', syncCopyModifier, true);
    window.addEventListener('keyup', syncCopyModifier, true);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('compositionstart', compositionStart, true);
    document.addEventListener('compositionend', compositionEnd, true);
  }
  return () => {
    subscribers.delete(notify);
    if (subscribers.size) return;
    window.removeEventListener('keydown', syncCopyModifier, true);
    window.removeEventListener('keyup', syncCopyModifier, true);
    window.removeEventListener('blur', reset);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('compositionstart', compositionStart, true);
    document.removeEventListener('compositionend', compositionEnd, true);
    reset();
  };
}
export function useCopyModifier(mode: 'platform' | 'either' = 'platform') { return useSyncExternalStore(subscribe, () => mode === 'either' ? inlineModified : modified, () => false); }
export function useCopyResetVersion() { return useSyncExternalStore(subscribe, () => resetVersion, () => 0); }
// Keep tracking keys during initial content loading and between snippet mounts,
// without rerendering App on every modifier change.
export function useCopyModifierListener() { useEffect(() => subscribe(() => {}), []); }

// Scroll and resize measurements share one animation-frame notification too.
const geometrySubscribers = new Set<() => void>();
let geometryVersion = 0;
let frame = 0;
function invalidateGeometry() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; geometryVersion++; geometrySubscribers.forEach(notify => notify()); });
}
export function useCopyGeometry(enabled: boolean) {
  const subscribeGeometry = useCallback((notify: () => void) => {
    if (!enabled) return () => {};
    geometrySubscribers.add(notify);
    if (geometrySubscribers.size === 1) {
      window.addEventListener('scroll', invalidateGeometry, true);
      window.addEventListener('resize', invalidateGeometry);
    }
    return () => {
      geometrySubscribers.delete(notify);
      if (geometrySubscribers.size) return;
      window.removeEventListener('scroll', invalidateGeometry, true);
      window.removeEventListener('resize', invalidateGeometry);
      cancelAnimationFrame(frame); frame = 0;
    };
  }, [enabled]);
  return useSyncExternalStore(subscribeGeometry, () => geometryVersion, () => 0);
}
