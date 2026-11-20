import { useEffect, useRef, useState } from 'react';
import type { MarkdownPreviewData, SubSnippet } from '../../core/types';

interface Rendered { source: SubSnippet; code: string; html: string; preview?: MarkdownPreviewData; error?: string }

export function useRenderedCode(source: SubSnippet | undefined, code: string, enabled = true) {
  const [rendered, setRendered] = useState<Rendered>();
  const successful = useRef(new WeakMap<SubSnippet, Rendered>());
  const isMarkdown = !!source && ['md', 'markdown'].includes(source.language.trim().toLowerCase());
  const needsRendering = !!source && (code !== source.code || (isMarkdown && !source.markdownPreview));
  useEffect(() => {
    if (!source) return;
    if (!enabled) { successful.current.delete(source); setRendered(undefined); return; }
    if (!needsRendering) {
      successful.current.set(source, { source, code, html: source.codeHtml, preview: source.markdownPreview });
      return;
    }
    if (successful.current.get(source)?.code === code) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      import('../../core/code-rendering').then(async renderer => {
        if (cancelled) return;
        const [html, preview] = await Promise.all([
          renderer.highlightedCode(code, source.language),
          isMarkdown ? renderer.renderMarkdownPreview(code, (url, kind) => source.markdownPreview?.urls?.[`${kind}:${url}`] ?? url) : undefined,
        ]);
        if (!cancelled) {
          const next = { source, code, html, preview };
          successful.current.set(source, next);
          setRendered(next);
        }
      }).catch(() => {
        if (!cancelled) setRendered({ source, code, html: '', error: isMarkdown && successful.current.get(source)?.preview
          ? '预览更新失败，已保留上次内容，可查看或复制当前源代码。'
          : '代码高亮或预览更新失败，仍可查看和复制当前源代码。' });
      });
    }, isMarkdown ? 250 : 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source, code, isMarkdown, needsRendering, enabled]);
  if (!source) return { snippet: undefined, error: undefined };
  if (!enabled) return { snippet: { ...source, code, codeHtml: '', markdownPreview: undefined }, error: undefined };
  if (!needsRendering) return { snippet: source, error: undefined };
  const previous = successful.current.get(source);
  const current = rendered?.source === source && rendered.code === code ? rendered : previous?.code === code ? previous : undefined;
  return { snippet: { ...source, code, codeHtml: current?.html ?? '', markdownPreview: previous?.preview }, error: current?.error };
}
