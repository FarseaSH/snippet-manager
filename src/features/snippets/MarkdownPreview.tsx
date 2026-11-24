import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import type { MarkdownPreviewData } from '../../core/types';
import { copyText } from '../../services/clipboard';
import type { CodeEditorHandle } from './CodeEditor';
import { InlineCodeCopy } from './InlineCodeCopy';
import { createPortal } from 'react-dom';
import { HtmlCodeBlock } from './HtmlCodeBlock';
import { MarkdownCodeCopyOverlay } from './MarkdownCodeCopyOverlay';
import { syncCopyModifier } from './useCopyModifier';

interface Props { preview: MarkdownPreviewData; notify(message: string): void; active?: boolean; ref?: Ref<CodeEditorHandle> }

export function MarkdownPreview({ preview, notify, active = true, ref }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scroll = useRef({ top: 0, left: 0 });
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [copiedBlocks, setCopiedBlocks] = useState<Set<number>>(new Set());
  const [htmlBlocks, setHtmlBlocks] = useState<{ host: HTMLElement; index: number; sourceHtml: string }[]>([]);
  const [codeBlocks, setCodeBlocks] = useState<{ host: HTMLElement; index: number }[]>([]);
  const currentPreview = useRef(preview);
  const pending = useRef(new Map<number, MarkdownPreviewData>());
  useLayoutEffect(() => { currentPreview.current = preview; }, [preview]);
  // Retain the generated, escaped Shiki markup when Strict Mode repeats setup.
  // Portals let interactive blocks live inside arbitrary Markdown lists/quotes.
  const sourceCache = useRef(new WeakMap<HTMLElement, string>());
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = scroll.current.top;
      viewport.scrollLeft = scroll.current.left;
    }
  }, [preview.html]);
  useLayoutEffect(() => {
    const hosts = viewportRef.current?.querySelectorAll<HTMLElement>('[data-preview-html]') ?? [];
    setCodeBlocks(Array.from(viewportRef.current?.querySelectorAll<HTMLElement>('.preview-code-block:not([data-preview-html])') ?? []).flatMap(block => {
      const host = block.querySelector<HTMLElement>('.preview-code-body');
      const index = Number(block.querySelector<HTMLElement>('[data-preview-copy]')?.dataset.previewCopy);
      return host && Number.isInteger(index) ? [{ host, index }] : [];
    }));
    setHtmlBlocks(Array.from(hosts, host => {
      const cached = sourceCache.current.get(host);
      const sourceHtml = cached ?? host.querySelector('.preview-code-body')?.innerHTML ?? '';
      if (cached === undefined) { sourceCache.current.set(host, sourceHtml); host.replaceChildren(); }
      return { host, index: Number(host.dataset.previewHtml), sourceHtml };
    }));
  }, [preview.html]);
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
  const copyBlock = useCallback(async (index: number): Promise<boolean> => {
    const block = preview.codeBlocks[index];
    if (!block || currentPreview.current !== preview || pending.current.get(index) === preview) return false;
    pending.current.set(index, preview);
    try {
      await copyText(block.code);
      if (!viewportRef.current || currentPreview.current !== preview) return false;
      notify('代码块已复制');
      clearTimeout(timers.current.get(index));
      setCopiedBlocks(current => new Set(current).add(index));
      timers.current.set(index, setTimeout(() => {
        setCopiedBlocks(current => { const next = new Set(current); next.delete(index); return next; });
        timers.current.delete(index);
      }, 1800));
      return true;
    } catch {
      if (viewportRef.current && currentPreview.current === preview) notify('复制失败，请手动选择并复制内容');
      return false;
    } finally { if (pending.current.get(index) === preview) pending.current.delete(index); }
  }, [preview, notify]);
  return <div ref={viewportRef} className="markdown-preview" role="region" aria-label="Markdown 预览" onPointerMove={syncCopyModifier} onScroll={event => {
    scroll.current = { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft };
  }} onClick={event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-preview-copy]');
    if (!button || !event.currentTarget.contains(button)) return;
    const index = Number(button.dataset.previewCopy);
    void copyBlock(index);
  }}>
    <InlineCodeCopy><div className="markdown markdown-preview-content" dangerouslySetInnerHTML={{ __html: preview.html }} /></InlineCodeCopy>
    {codeBlocks.map(({ host, index }) => <MarkdownCodeCopyOverlay key={index} host={host} enabled={active} version={preview} onCopy={() => copyBlock(index)} />)}
    {htmlBlocks.map(({ host, index, sourceHtml }) => {
      const block = preview.codeBlocks[index];
      return block && createPortal(<HtmlCodeBlock index={index} code={block.code} language={block.language} sourceHtml={sourceHtml} copyEnabled={active} copyVersion={preview} onCopy={() => copyBlock(index)} />, host, String(index));
    })}
  </div>;
}
