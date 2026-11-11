import { useLayoutEffect, useRef, useState } from 'react';

interface Bounds { width: number; height: number; left: number; right: number; radius: number; topRadius: number }
interface Props { active: string }

export function TabOutline({ active }: Props) {
  const outlineRef = useRef<SVGSVGElement>(null);
  const [bounds, setBounds] = useState<Bounds>();
  useLayoutEffect(() => {
    // The SVG's own ref is attached before this effect; its parent's ref may not be yet.
    const row = outlineRef.current?.parentElement;
    if (!row) return;
    const tabs = [...row.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const selected = tabs.find(tab => tab.dataset.id === active);
    if (!selected) return;
    const measure = () => {
      const rowRect = row.getBoundingClientRect();
      const tabRect = selected.getBoundingClientRect();
      const lastRect = tabs.at(-1)!.getBoundingClientRect();
      const style = getComputedStyle(row);
      const radius = parseFloat(style.getPropertyValue('--tab-radius')) || 8;
      const topRadius = parseFloat(style.getPropertyValue('--tab-top-radius')) || 5;
      const next = {
        width: Math.max(rowRect.width, lastRect.right - rowRect.left + row.scrollLeft + radius),
        height: rowRect.height,
        left: tabRect.left - rowRect.left + row.scrollLeft + 0.5,
        right: tabRect.right - rowRect.left + row.scrollLeft - 0.5,
        radius,
        topRadius,
      };
      setBounds(previous => previous && Object.keys(next).every(key => previous[key as keyof Bounds] === next[key as keyof Bounds]) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    tabs.forEach(tab => observer.observe(tab));
    return () => observer.disconnect();
  }, [active]);
  if (!bounds) return <svg ref={outlineRef} className="tab-outline" width={0} height={0} aria-hidden="true" />;
  const { width, height, left, right, radius: r, topRadius: t } = bounds;
  // Leave room for the full 2px accent stroke inside the SVG viewport.
  const top = 1;
  const bottom = height - 0.5;
  // Cover only the upper 45 degrees of each top corner.
  const diagonal = t * Math.SQRT1_2;
  const accent = `M${left + t - diagonal} ${top + t - diagonal} A${t} ${t} 0 0 1 ${left + t} ${top} H${right - t} A${t} ${t} 0 0 1 ${right - t + diagonal} ${top + t - diagonal}`;
  // One path shares the baseline, feet and side coordinates at every display scale.
  const outline = `M0 ${bottom} H${left - r} A${r} ${r} 0 0 0 ${left} ${bottom - r} V${top + t} A${t} ${t} 0 0 1 ${left + t} ${top} H${right - t} A${t} ${t} 0 0 1 ${right} ${top + t} V${bottom - r} A${r} ${r} 0 0 0 ${right + r} ${bottom} H${width}`;
  return <svg ref={outlineRef} className="tab-outline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <path className="tab-outline-border" d={outline} />
    <path className="tab-outline-accent" d={accent} />
  </svg>;
}
