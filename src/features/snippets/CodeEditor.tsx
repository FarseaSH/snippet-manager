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
  const editorRef = useRef<import('@codemirror/view').EditorView | null>(null);
  const runtimeRef = useRef<typeof import('./codemirror-runtime')>(undefined);
  const codeRef = useRef(snippet.code);
  const languageRef = useRef(snippet.language);
  const editableRef = useRef(editable);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useLayoutEffect(() => {
    const view = editorRef.current;
    const input = view?.contentDOM;
    if (!input) return;
    input.setAttribute('aria-label', ariaLabel || `${snippet.title}，只读代码编辑器`);
    input.setAttribute('aria-readonly', String(!editable));
    if (invalid !== undefined) input.setAttribute('aria-invalid', String(invalid)); else input.removeAttribute('aria-invalid');
    if (describedBy) input.setAttribute('aria-describedby', describedBy); else input.removeAttribute('aria-describedby');
    runtimeRef.current?.setEditable(view!, editable);
  }, [invalid, describedBy, status, ariaLabel, snippet.title, editable]);
  useLayoutEffect(() => { codeRef.current = snippet.code; }, [snippet.code]);
  useLayoutEffect(() => { languageRef.current = snippet.language; editableRef.current = editable; }, [snippet.language, editable]);
  useLayoutEffect(() => {
    if (editorRef.current) runtimeRef.current?.replaceCode(editorRef.current, snippet.code);
  }, [snippet.code, status]);
  useEffect(() => {
    const view = editorRef.current;
    if (view) runtimeRef.current?.setLanguage(view, snippet.language).catch(() => {
      if (editorRef.current === view) runtimeRef.current?.setLanguage(view, 'text');
    });
  }, [snippet.language, status]);
  useImperativeHandle(ref, () => ({
    saveViewState() {
      const editor = editorRef.current;
      const restore = editor && runtimeRef.current?.saveViewState(editor);
      const fallback = fallbackRef.current;
      const top = fallback?.scrollTop ?? 0;
      const left = fallback?.scrollLeft ?? 0;
      return () => {
        if (editor && editorRef.current === editor) restore?.();
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
    import('./codemirror-runtime').then(async runtime => {
      if (cancelled || !hostRef.current) return;
      runtimeRef.current = runtime;
      const editor = runtime.createEditor(hostRef.current, codeRef.current, editableRef.current, value => {
        if (editableRef.current) onChangeRef.current?.(value);
      });
      editorRef.current = editor;
      const observer = new ResizeObserver(() => editor.requestMeasure());
      observer.observe(hostRef.current);
      dispose = () => { if (editorRef.current === editor) editorRef.current = null; observer.disconnect(); runtime.destroyEditor(editor); };
      await runtime.setLanguage(editor, languageRef.current).catch(() => runtime.setLanguage(editor, 'text'));
      if (!cancelled) setStatus('ready');
    }).catch(() => { dispose?.(); dispose = undefined; if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; dispose?.(); };
  }, [touch]);

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
