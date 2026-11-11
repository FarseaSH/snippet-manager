import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import type { SubSnippet } from '../../core/types';

export interface CodeEditorHandle { saveViewState(): () => void }
interface Props { snippet: SubSnippet; ref?: Ref<CodeEditorHandle>; editable?: boolean; onChange?(value: string): void; ariaLabel?: string; invalid?: boolean; describedBy?: string }
const touchQuery = '(max-width: 700px), (pointer: coarse)';

export function CodeEditor({ snippet, ref, editable = false, onChange, ariaLabel, invalid, describedBy }: Props) {
  const [touch, setTouch] = useState(() => window.matchMedia(touchQuery).matches);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const hostRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const codeRef = useRef(snippet.code);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useLayoutEffect(() => {
    const input = editorRef.current?.getDomNode()?.querySelector('textarea');
    if (!input) return;
    if (invalid !== undefined) input.setAttribute('aria-invalid', String(invalid));
    if (describedBy) input.setAttribute('aria-describedby', describedBy); else input.removeAttribute('aria-describedby');
  }, [invalid, describedBy, status]);
  useLayoutEffect(() => { codeRef.current = snippet.code; }, [snippet.code]);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const current = model.getValue();
    const next = snippet.code.replace(/\r\n|\r|\n/g, model.getEOL());
    if (current === next) return;
    const state = editor.saveViewState();
    let start = 0;
    let end = 0;
    while (start < current.length && start < next.length && current[start] === next[start]) start++;
    while (end < current.length - start && end < next.length - start && current[current.length - end - 1] === next[next.length - end - 1]) end++;
    const from = model.getPositionAt(start);
    const to = model.getPositionAt(current.length - end);
    model.applyEdits([{ range: { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column }, text: next.slice(start, next.length - end) }]);
    if (state) editor.restoreViewState(state);
  }, [snippet.code, status]);
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
      const model = monaco.editor.createModel(codeRef.current, editorLanguage(snippet.language));
      dispose = () => model.dispose();
      const editor = monaco.editor.create(hostRef.current, {
        model, theme: 'tomorrow', readOnly: !editable, domReadOnly: !editable,
        ariaLabel: ariaLabel || `${snippet.title}，只读代码编辑器`, tabFocusMode: true, editContext: false,
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
      const listener = editable ? editor.onDidChangeModelContent(() => onChangeRef.current?.(model.getValue())) : undefined;
      const observer = new ResizeObserver(() => editor.layout());
      observer.observe(hostRef.current);
      dispose = () => { editorRef.current = null; listener?.dispose(); observer.disconnect(); editor.dispose(); model.dispose(); };
      editor.layout();
      setStatus('ready');
    }).catch(() => { dispose?.(); dispose = undefined; if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; dispose?.(); };
  }, [touch, snippet.language, snippet.title, editable, ariaLabel]);

  if ((touch || status === 'error') && editable) return <textarea className="transform-textarea" aria-label={ariaLabel} aria-invalid={invalid} aria-describedby={describedBy} value={snippet.code} onChange={event => onChange?.(event.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" />;
  if (touch || status === 'error') return <div className="code-fallback highlighted-code" ref={fallbackRef} role={ariaLabel ? 'textbox' : undefined} aria-label={ariaLabel} aria-readonly={ariaLabel ? true : undefined} aria-multiline={ariaLabel ? true : undefined}>
    <div className="code-content">
      <div className="line-numbers" aria-hidden="true">{snippet.code.split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}</div>
      {snippet.codeHtml ? <div className="code-source" dangerouslySetInnerHTML={{ __html: snippet.codeHtml }} /> : <div className="code-source"><pre><code>{snippet.code}</code></pre></div>}
    </div>
  </div>;

  return <div className="code-editor highlighted-code" data-state={status}>
    <div className="editor-host" ref={hostRef} />
    {status === 'loading' && <div className="editor-loading" role="status">正在加载代码编辑器…</div>}
  </div>;
}
