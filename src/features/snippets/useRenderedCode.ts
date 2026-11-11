import { useEffect, useState } from 'react';
import type { MarkdownPreviewData, SubSnippet } from '../../core/types';

interface Rendered { source: SubSnippet; code: string; html: string; preview?: MarkdownPreviewData; error?: string }

export function useRenderedCode(source: SubSnippet | undefined, code: string) {
  const [rendered, setRendered] = useState<Rendered>();
  useEffect(() => {
    if (!source || code === source.code) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      import('../../core/code-rendering').then(async renderer => {
        const [html, preview] = await Promise.all([
          renderer.highlightedCode(code, source.language),
          source.markdownPreview ? renderer.renderMarkdownPreview(code, (url, kind) => source.markdownPreview?.urls?.[`${kind}:${url}`] ?? url) : undefined,
        ]);
        if (!cancelled) setRendered({ source, code, html, preview });
      }).catch(() => {
        if (!cancelled) setRendered({ source, code, html: '', error: '代码高亮或预览更新失败，仍可查看和复制当前源代码。' });
      });
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source, code]);
  if (!source) return { snippet: undefined, error: undefined };
  if (code === source.code) return { snippet: source, error: undefined };
  const current = rendered?.source === source && rendered.code === code ? rendered : undefined;
  return { snippet: { ...source, code, codeHtml: current?.html ?? '', markdownPreview: current?.preview }, error: current?.error };
}
