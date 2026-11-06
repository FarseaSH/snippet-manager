import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { SubSnippet } from '../../core/types';

export interface CodeEditorHandle { saveViewState(): () => void }
interface Props { snippet: SubSnippet; ref?: Ref<CodeEditorHandle> }
const touchQuery = '(max-width: 700px), (pointer: coarse)';

export function CodeEditor({ snippet, ref }: Props) {
  const [touch, setTouch] = useState(() => window.matchMedia(touchQuery).matches);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const hostRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  useImperativeHandle(ref, () => ({
    saveViewState() {
      const editor = editorRef.current;
      const state = editor?.saveViewState();
      const fallback = fallbackRef.current;
      const top = fallback?.scrollTop ?? 0;
      const left = fallback?.scrollLeft ?? 0;
      return () => {
        if (editor && editorRef.current === editor && state) { editor.layout(); editor.restoreViewState(state); }
        if (fallback && fallbackRef.current === fallback) { fallback.scrollTop = top; fallback.scrollLeft = left; }
      };
    },
  }), []);

  useEffect(() => {
    const media = window.matchMedia(touchQuery);
    const update = () => setTouch(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (touch) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    setStatus('loading');
    import('./monaco-runtime').then(({ monaco, editorLanguage }) => {
      if (cancelled || !hostRef.current) return;
      const model = monaco.editor.createModel(snippet.code, editorLanguage(snippet.language));
      dispose = () => model.dispose();
      const editor = monaco.editor.create(hostRef.current, {
        model, theme: 'tomorrow', readOnly: true, domReadOnly: true,
        ariaLabel: `${snippet.title}，只读代码编辑器`, tabFocusMode: true, editContext: false,
        fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-code').trim(),
        fontSize: 13, lineHeight: 22, fontLigatures: false, tabSize: 4,
        minimap: { enabled: false }, lineNumbers: 'on', lineNumbersMinChars: 3,
        folding: true, showFoldingControls: 'always', glyphMargin: false,
        guides: { indentation: true, bracketPairs: true }, matchBrackets: 'always',
        scrollBeyondLastLine: false, wordWrap: 'off', renderWhitespace: 'selection',
        renderLineHighlight: 'all', renderLineHighlightOnlyWhenFocus: true,
        renderValidationDecorations: 'off', padding: { top: 16, bottom: 16 },
        scrollbar: { alwaysConsumeMouseWheel: false, verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        overviewRulerLanes: 0, hideCursorInOverviewRuler: true,
        hover: { enabled: 'off' }, contextmenu: true,
      });
      editorRef.current = editor;
      const observer = new ResizeObserver(() => editor.layout());
      observer.observe(hostRef.current);
      dispose = () => { editorRef.current = null; observer.disconnect(); editor.dispose(); model.dispose(); };
      editor.layout();
      setStatus('ready');
    }).catch(() => { dispose?.(); dispose = undefined; if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; dispose?.(); };
  }, [touch, snippet.code, snippet.language, snippet.title]);

  if (touch || status === 'error') return <div className="code-fallback highlighted-code" ref={fallbackRef}>
    <div className="code-content">
      <div className="line-numbers" aria-hidden="true">{snippet.code.split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}</div>
      <div className="code-source" dangerouslySetInnerHTML={{ __html: snippet.codeHtml }} />
    </div>
  </div>;

  return <div className="code-editor highlighted-code" data-state={status}>
    <div className="editor-host" ref={hostRef} />
    {status === 'loading' && <div className="editor-loading" role="status">正在加载代码编辑器…</div>}
  </div>;
}
