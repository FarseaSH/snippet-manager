import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import type { MarkdownPreviewData } from '../../core/types';
import { copyText } from '../../services/clipboard';
import type { CodeEditorHandle } from './CodeEditor';
import { InlineCodeCopy } from './InlineCodeCopy';

interface Props { preview: MarkdownPreviewData; notify(message: string): void; ref?: Ref<CodeEditorHandle> }

export function MarkdownPreview({ preview, notify, ref }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [copiedBlocks, setCopiedBlocks] = useState<Set<number>>(new Set());
  // Keep feedback in sync when React refreshes the generated preview HTML.
  useLayoutEffect(() => {
    viewportRef.current?.querySelectorAll<HTMLButtonElement>('button[data-preview-copy]').forEach(button => {
      const copied = copiedBlocks.has(Number(button.dataset.previewCopy));
      button.classList.toggle('copied', copied);
      button.title = copied ? '已复制' : '复制代码';
    });
  });
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);
  useEffect(() => { timers.current.forEach(clearTimeout); timers.current.clear(); setCopiedBlocks(new Set()); }, [preview]);
  useImperativeHandle(ref, () => ({
    saveViewState() {
      const viewport = viewportRef.current;
      const top = viewport?.scrollTop ?? 0;
      const left = viewport?.scrollLeft ?? 0;
      return () => { if (viewport) { viewport.scrollTop = top; viewport.scrollLeft = left; } };
    },
  }), []);
  return <div ref={viewportRef} className="markdown-preview" role="region" aria-label="Markdown 预览" onClick={async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-preview-copy]');
    if (!button || !event.currentTarget.contains(button)) return;
    const index = Number(button.dataset.previewCopy);
    const block = preview.codeBlocks[index];
    if (!block) return;
    try {
      await copyText(block.code);
      notify('代码块已复制');
      if (!viewportRef.current) return;
      clearTimeout(timers.current.get(index));
      setCopiedBlocks(current => new Set(current).add(index));
      timers.current.set(index, setTimeout(() => {
        setCopiedBlocks(current => { const next = new Set(current); next.delete(index); return next; });
        timers.current.delete(index);
      }, 1800));
    } catch { notify('复制失败，请手动选择并复制内容'); }
  }}>
    <InlineCodeCopy><div className="markdown markdown-preview-content" dangerouslySetInnerHTML={{ __html: preview.html }} /></InlineCodeCopy>
  </div>;
}
