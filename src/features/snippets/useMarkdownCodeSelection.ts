import { useLayoutEffect } from 'react';

// One frame and one set of document listeners for all preview code blocks.
const listeners = new Set<() => void>();
let frame = 0;
let focused = true;
function schedule() {
  if (!frame) frame = requestAnimationFrame(() => {
    frame = 0;
    listeners.forEach(update => update());
  });
}
function pointer(event: Event) {
  focused = event.target instanceof Element && Boolean(event.target.closest('pre.preview-selection-ready'));
  schedule();
}
function blur() { focused = false; schedule(); }
function focus() { focused = true; schedule(); }
function subscribe(update: () => void) {
  listeners.add(update);
  if (listeners.size === 1) {
    document.addEventListener('selectionchange', schedule);
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('focusin', pointer, true);
    document.addEventListener('transitionend', schedule, true);
    document.addEventListener('animationend', schedule, true);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    document.fonts.addEventListener('loadingdone', schedule);
  }
  return () => {
    listeners.delete(update);
    if (listeners.size) return;
    document.removeEventListener('selectionchange', schedule);
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('focusin', pointer, true);
    document.removeEventListener('transitionend', schedule, true);
    document.removeEventListener('animationend', schedule, true);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
    document.fonts.removeEventListener('loadingdone', schedule);
    cancelAnimationFrame(frame); frame = 0; focused = true;
  };
}

interface TextPart { node: Text; start: number; end: number }
interface Box { left: number; top: number; right: number; bottom: number }
function clientBox(node: HTMLElement): Box {
  const rect = node.getBoundingClientRect();
  const left = rect.left + node.clientLeft, top = rect.top + node.clientTop;
  return { left, top, right: left + node.clientWidth, bottom: top + node.clientHeight };
}

export function useMarkdownCodeSelection(host: HTMLElement | null, enabled: boolean, version: unknown) {
  useLayoutEffect(() => {
    const pre = host?.querySelector<HTMLElement>('pre');
    const code = pre?.querySelector('code');
    if (!enabled || !host || !pre || !code) return;
    const text = code.textContent ?? '';
    const parts: TextPart[] = [];
    const offsets = new WeakMap<Node, TextPart>();
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const part = { node: node as Text, start: offset, end: offset + node.textContent!.length };
      parts.push(part); offsets.set(node, part); offset = part.end;
    }
    offset = 0;
    const lines = text.split('\n').map(value => {
      const start = offset; offset += value.length + 1;
      return { start, end: start + value.length };
    });
    const lineElements = Array.from(code.querySelectorAll<HTMLElement>(':scope > .line'));
    // Source offsets, including empty lines, come from text nodes rather than
    // decorations. Never insert glyphs into the highlighted code itself.
    const background = document.createElement('div');
    const whitespace = document.createElement('div');
    background.className = 'preview-selection-layer';
    whitespace.className = 'preview-whitespace-layer';
    for (const layer of [background, whitespace]) { layer.setAttribute('aria-hidden', 'true'); pre.append(layer); }
    const colored = [pre, ...code.querySelectorAll<HTMLElement>('[style]')];
    colored.forEach(node => {
      const color = node === pre ? getComputedStyle(pre).color : node.style.color;
      if (color) node.style.setProperty('--preview-token-color', color);
    });
    pre.classList.add('preview-selection-ready');

    function point(pos: number, end: boolean): [Node, number] {
      let low = 0, high = parts.length - 1;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (parts[middle].end < pos || (!end && parts[middle].end === pos)) low = middle + 1;
        else high = middle;
      }
      const part = parts[low];
      return part ? [part.node, Math.max(0, Math.min(pos - part.start, part.end - part.start))] : [code!, 0];
    }
    function range(from: number, to: number) {
      const result = document.createRange();
      result.setStart(...point(from, false)); result.setEnd(...point(to, true));
      return result;
    }
    function boundary(node: Node, position: number) {
      const part = offsets.get(node);
      if (part) return part.start + position;
      const prefix = document.createRange();
      prefix.selectNodeContents(code!); prefix.setEnd(node, position);
      return prefix.toString().length;
    }
    function update() {
      background.replaceChildren(); whitespace.replaceChildren();
      const selection = window.getSelection();
      if (!pre!.isConnected || !pre!.getClientRects().length || getComputedStyle(pre!).visibility === 'hidden' || !selection || selection.isCollapsed) return;
      const ranges: { from: number; to: number }[] = [];
      for (let index = 0; index < selection.rangeCount; index++) {
        const selected = selection.getRangeAt(index);
        if (!selected.intersectsNode(code!)) continue;
        const local = document.createRange(); local.selectNodeContents(code!);
        if (local.comparePoint(selected.startContainer, selected.startOffset) === 0) local.setStart(selected.startContainer, selected.startOffset);
        if (local.comparePoint(selected.endContainer, selected.endOffset) === 0) local.setEnd(selected.endContainer, selected.endOffset);
        const from = boundary(local.startContainer, local.startOffset), to = boundary(local.endContainer, local.endOffset);
        if (from < to) ranges.push({ from, to });
      }
      if (!ranges.length) return;
      const origin = clientBox(pre!);
      const clip = { ...origin };
      for (let parent = pre!.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const box = clientBox(parent);
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) { clip.left = Math.max(clip.left, box.left); clip.right = Math.min(clip.right, box.right); }
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) { clip.top = Math.max(clip.top, box.top); clip.bottom = Math.min(clip.bottom, box.bottom); }
      }
      clip.left = Math.max(0, clip.left); clip.top = Math.max(0, clip.top);
      clip.right = Math.min(innerWidth, clip.right); clip.bottom = Math.min(innerHeight, clip.bottom);
      if (clip.left >= clip.right || clip.top >= clip.bottom) return;
      const style = getComputedStyle(pre!);
      const lineHeight = parseFloat(style.lineHeight);
      const left = origin.left + parseFloat(style.paddingLeft) - pre!.scrollLeft;
      const top = origin.top + parseFloat(style.paddingTop) - pre!.scrollTop;
      const canvas = document.createElement('canvas').getContext('2d')!;
      canvas.font = `${style.fontSize} ${style.fontFamily}`;
      const cell = canvas.measureText(' ').width;
      background.dataset.active = String(focused && document.hasFocus());
      const backgroundNodes = document.createDocumentFragment();
      const whitespaceNodes = document.createDocumentFragment();
      function append(layer: HTMLElement, x: number, y: number, width: number, symbol?: string) {
        const x1 = Math.max(x, clip.left), x2 = Math.min(x + width, clip.right);
        const y1 = Math.max(y, clip.top), y2 = Math.min(y + lineHeight, clip.bottom);
        if (!Number.isFinite(x1) || !Number.isFinite(x2) || x1 >= x2 || y1 >= y2) return;
        const node = document.createElement('span');
        // Keep the full glyph box when partly clipped, so a Tab marker does not
        // shift sideways as its cell scrolls out of view. Ancestors do the clipping.
        Object.assign(node.style, { left: `${x - origin.left + pre!.scrollLeft}px`, top: `${y - origin.top + pre!.scrollTop}px`, width: `${width}px`, height: `${lineHeight}px` });
        if (symbol) node.dataset.symbol = symbol;
        (layer === background ? backgroundNodes : whitespaceNodes).append(node);
      }
      for (const selected of ranges) {
        function lineBox(index: number) {
          const rects = lineElements[index]?.getClientRects();
          if (!rects?.length) return { top: top + index * lineHeight, bottom: top + (index + 1) * lineHeight, glyphTop: top + index * lineHeight };
          const first = rects[0], last = rects[rects.length - 1];
          const y = first.top - (lineHeight - first.height) / 2;
          return { top: y, bottom: last.bottom + (lineHeight - last.height) / 2, glyphTop: first.top };
        }
        // Binary search actual logical-line boxes: their heights vary when wrapped.
        let low = 0, high = lines.length;
        while (low < high) { const middle = (low + high) >>> 1; if (lineBox(middle).bottom <= clip.top) low = middle + 1; else high = middle; }
        for (let index = low; index < lines.length; index++) {
          const line = lines[index], box = lineBox(index);
          if (box.top >= clip.bottom) break;
          const from = Math.max(line.start, selected.from), to = Math.min(line.end, selected.to);
          if (from < to) {
            let visibleFrom = from, visibleTo = to;
            const hit = document as Document & { caretRangeFromPoint?(x: number, y: number): Range | null };
            const firstRow = Math.max(0, Math.floor((clip.top - box.top) / lineHeight));
            const lastRow = Math.max(0, Math.floor((Math.min(clip.bottom, box.bottom) - box.top - .5) / lineHeight));
            const edges = [[clip.left + .5, box.top + firstRow * lineHeight + lineHeight / 2], [clip.right - .5, box.top + lastRow * lineHeight + lineHeight / 2]].map(([x, y]) => {
              const caret = hit.caretRangeFromPoint?.(x, Math.max(clip.top + .5, Math.min(y, clip.bottom - .5)));
              return caret && code!.contains(caret.startContainer) ? boundary(caret.startContainer, caret.startOffset) : undefined;
            });
            if (edges.every((edge): edge is number => edge !== undefined && edge >= line.start && edge <= line.end)) {
              visibleFrom = Math.max(from, Math.min(...edges) - 1);
              visibleTo = Math.min(to, Math.max(...edges) + 1);
            }
            const rows = new Map<number, DOMRect[]>();
            if (visibleFrom < visibleTo) for (const rect of range(visibleFrom, visibleTo).getClientRects()) {
              const row = Math.round((rect.top - box.glyphTop) / lineHeight);
              const existing = rows.get(row) ?? []; existing.push(rect); rows.set(row, existing);
            }
            for (const [row, rects] of rows) {
              let start = Infinity, end = -Infinity;
              const y = box.top + row * lineHeight;
              for (const rect of rects.sort((a, b) => a.left - b.left)) {
                if (rect.left > end + .5) { append(background, start, y, end - start); start = rect.left; }
                start = Math.min(start, rect.left); end = Math.max(end, rect.right);
              }
              append(background, start, y, end - start);
            }
            for (const match of text.slice(visibleFrom, visibleTo).matchAll(/[ \t]/g)) {
              const pos = visibleFrom + match.index;
              const rect = range(pos, pos + 1).getBoundingClientRect();
              append(whitespace, rect.left, box.top + Math.round((rect.top - box.glyphTop) / lineHeight) * lineHeight, rect.width, match[0] === '\t' ? '⇥' : '·');
            }
          }
          if (line.end < text.length && selected.from <= line.end && selected.to > line.end) {
            const last = line.start === line.end ? undefined : range(line.end - 1, line.end).getBoundingClientRect();
            const x = last?.right ?? left, y = last ? box.top + Math.round((last.top - box.glyphTop) / lineHeight) * lineHeight : box.top;
            append(background, x, y, cell); append(whitespace, x, y, cell, '↵');
          }
        }
      }
      // Commit after every range measurement, avoiding a layout flush for each
      // whitespace cell while dragging or scrolling a large selection.
      background.replaceChildren(backgroundNodes); whitespace.replaceChildren(whitespaceNodes);
    }
    const unsubscribe = subscribe(update);
    const observer = new ResizeObserver(schedule); observer.observe(pre); observer.observe(host);
    schedule();
    return () => {
      unsubscribe(); observer.disconnect(); background.remove(); whitespace.remove();
      pre.classList.remove('preview-selection-ready');
      colored.forEach(node => node.style.removeProperty('--preview-token-color'));
    };
  }, [host, enabled, version]);
}
