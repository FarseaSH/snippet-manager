import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { readPreference, savePreference } from '../services/clipboard';

type Layout = 'wide' | 'tablet' | 'phone';
type PaneWidths = { sidebar: number; list?: number };
type Preferences = Partial<Record<Layout, PaneWidths>>;

const preferenceKey = 'snippet-manager:pane-widths';

function readWidths(): Preferences {
  try { return JSON.parse(readPreference(preferenceKey) ?? '{}') ?? {}; }
  catch { return {}; }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface DividerProps {
  label: string;
  controls: string;
  className: string;
  value: number;
  min: number;
  max: number;
  onResize(value: number, commit: boolean): void;
}

function PaneDivider({ label, controls, className, value, min, max, onResize }: DividerProps) {
  const drag = useRef<{ pointer: number; x: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function move(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointer) return;
    const next = clamp(start.value + event.clientX - start.x, min, max);
    if (next !== value || (commit && next !== start.value)) onResize(next, commit);
  }

  return <div className={`pane-divider ${className}`} role="separator" tabIndex={0} aria-label={label}
    aria-controls={controls} aria-orientation="vertical" aria-valuenow={Math.round(value)} aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)}
    aria-valuetext={`${Math.round(value)} 像素`} data-dragging={dragging || undefined}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary || min === max) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, x: event.clientX, value };
      setDragging(true);
    }}
    onPointerMove={event => move(event, false)}
    onPointerUp={event => move(event, true)}
    onLostPointerCapture={() => {
      drag.current = null;
      setDragging(false);
    }}
    onKeyDown={event => {
      const values = { ArrowLeft: value - 16, ArrowRight: value + 16, Home: min, End: max };
      if (!Object.hasOwn(values, event.key)) return;
      event.preventDefault();
      const next = clamp(values[event.key as keyof typeof values], min, max);
      if (next !== value) onResize(next, true);
    }}
  />;
}

interface Props {
  narrow: boolean;
  mobile: boolean;
  drawerOpen: boolean;
  sidebar: ReactNode;
  list: ReactNode;
  detail: ReactNode;
}

export function ResizablePanes({ narrow, mobile, drawerOpen, sidebar, list, detail }: Props) {
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(window.innerWidth);
  const [preferences, setPreferences] = useState(readWidths);

  useLayoutEffect(() => {
    const pane = container.current!;
    const measure = () => setWidth(pane.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  const layout: Layout = mobile ? 'phone' : narrow ? 'tablet' : 'wide';
  const preferred = preferences[layout];
  const large = window.innerWidth >= 1450;
  const defaultSidebar = mobile ? clamp(width * .34, 112, 144) : narrow ? 176 : large ? 248 : 232;
  const defaultList = large ? 340 : 318;
  const minList = mobile ? 180 : 220;
  const minDetail = narrow ? 0 : 400;
  const maxSidebar = Math.max(0, width - minList - minDetail);
  const minSidebar = Math.min(maxSidebar, mobile ? 112 : narrow ? 128 : 160);
  const sidebarWidth = clamp(Number.isFinite(preferred?.sidebar) ? preferred!.sidebar : defaultSidebar, minSidebar, maxSidebar);
  const maxList = width - sidebarWidth - minDetail;
  const listWidth = narrow ? maxList : clamp(Number.isFinite(preferred?.list) ? preferred!.list! : defaultList, minList, maxList);
  const leftTotal = sidebarWidth + listWidth;

  function update(next: PaneWidths, commit: boolean) {
    const updated = { ...preferences, [layout]: next };
    setPreferences(updated);
    if (commit) savePreference(preferenceKey, JSON.stringify(updated));
  }

  const style = { '--sidebar-width': `${sidebarWidth}px`, '--list-width': `${listWidth}px` } as CSSProperties;
  return <main className="app-body" ref={container} style={style}>
    {sidebar}
    {!drawerOpen && <PaneDivider key={`${layout}-sidebar`} className="sidebar-divider" label="调整文件夹侧栏宽度" controls="folder-sidebar"
      value={sidebarWidth} min={minSidebar} max={Math.max(minSidebar, leftTotal - minList)}
      onResize={(value, commit) => update(narrow ? { sidebar: value } : { sidebar: value, list: leftTotal - value }, commit)} />}
    {list}
    {!narrow && <PaneDivider className="list-divider" label="调整片段列表宽度" controls="snippet-list-panel"
      value={listWidth} min={minList} max={maxList}
      onResize={(value, commit) => update({ sidebar: sidebarWidth, list: value }, commit)} />}
    {detail}
  </main>;
}
