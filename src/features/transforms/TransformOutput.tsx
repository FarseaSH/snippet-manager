import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, Copy, Eye, Maximize2, Minimize2 } from 'snippet-manager/icons/ui';
import type { SubSnippet } from '../../core/types';
import { languageName } from '../../core/language-name';
import { resolveTransformLanguage } from '../../core/transform';
import { copyText } from '../../services/clipboard';
import { CodeEditor, type CodeEditorHandle } from '../snippets/CodeEditor';
import { LanguageIcon } from '../snippets/LanguageIcon';
import { MarkdownPreview } from '../snippets/MarkdownPreview';
import { MarkdownPreviewPlaceholder } from '../snippets/MarkdownPreviewPlaceholder';
import { useRenderedCode } from '../snippets/useRenderedCode';
import type { TransformState } from './useLiveTransform';
import { useFullscreenShortcut } from '../snippets/useFullscreenShortcut';

interface Props { result: TransformState; fallbackLanguage: string; notify(message: string): void; focused: boolean; active: boolean; onToggleFocus(): void }

export function TransformOutput({ result, fallbackLanguage, notify, focused, active, onToggleFocus }: Props) {
  const [lastLanguage, setLastLanguage] = useState(() => resolveTransformLanguage(undefined, fallbackLanguage));
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editorRef = useRef<CodeEditorHandle>(null);
  const previewRef = useRef<CodeEditorHandle>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const restoreView = useRef<(() => void) | undefined>(undefined);
  const wasFocused = useRef(false);
  const previousSuccess = useRef<Extract<TransformState, { status: 'success' }>>(undefined);
  const pending = result.status === 'waiting' || result.status === 'running';
  const retained = pending && previousSuccess.current && resolveTransformLanguage(previousSuccess.current.language, fallbackLanguage) === 'markdown' ? previousSuccess.current : undefined;
  const displayed = result.status === 'success' ? result : retained;
  const language = displayed ? resolveTransformLanguage(displayed.language, fallbackLanguage) : lastLanguage;
  const output = displayed?.output ?? '';
  const isMarkdown = language === 'markdown';
  const isPreview = isMarkdown && !(showSource && language === lastLanguage);
  const source = useMemo<SubSnippet>(() => ({ id: 'transform-output', title: '转换输出', language, code: '', codeHtml: '', sourceOrder: 0, sourceDescription: '', descriptionHtml: '' }), [language]);
  const { snippet, error } = useRenderedCode(source, output, Boolean(displayed));
  useLayoutEffect(() => {
    if (result.status === 'success') previousSuccess.current = result;
    else if (!pending) previousSuccess.current = undefined;
  }, [result, pending]);
  // Pending runs keep the previous language and view choice; a new format starts in preview.
  useLayoutEffect(() => {
    if (language === lastLanguage) return;
    setLastLanguage(language);
    setShowSource(false);
  }, [language, lastLanguage]);
  useEffect(() => { setCopied(false); clearTimeout(copyTimer.current); }, [output, language, result.status]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useLayoutEffect(() => {
    restoreView.current?.(); restoreView.current = undefined;
    if (!focused && wasFocused.current) expandRef.current?.focus({ preventScroll: true });
    wasFocused.current = focused;
  }, [focused]);
  function toggleFocus() {
    const restoreCode = editorRef.current?.saveViewState();
    const restorePreview = previewRef.current?.saveViewState();
    restoreView.current = () => { restoreCode?.(); restorePreview?.(); };
    onToggleFocus();
  }
  useFullscreenShortcut(toggleFocus, { enabled: active });
  useEffect(() => {
    if (!focused) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.html-code-dialog:modal')) { event.preventDefault(); toggleFocus(); }
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [focused, onToggleFocus]);
  async function copy() {
    try {
      await copyText(output); notify('转换结果已复制');
      clearTimeout(copyTimer.current); setCopied(true); copyTimer.current = setTimeout(() => setCopied(false), 1800);
      return true;
    } catch { notify('复制失败，请手动选择并复制内容'); return false; }
  }
  return <section className="transform-editor" aria-label="输出区">
    <div className="transform-editor-heading"><span>输出</span></div>
    <div id="transform-output" className={`transform-editor-body transform-output-body${isPreview ? ' markdown-window is-preview' : ''}`}>
      <div className={`code-window-bar${isPreview ? '' : ' is-floating'}`}>
        {isPreview && <>
        <div className="window-traffic-lights" aria-hidden="true"><span className="window-dot red" /><span className="window-dot yellow" /><span className="window-dot green" /></div>
        <span className="code-window-title">Markdown 预览</span>
        </>}
        <button ref={expandRef} type="button" className="icon-button code-expand" aria-label={focused ? '恢复正文' : '全屏输出'} title={focused ? '恢复正文（Ctrl+Shift+F / Esc）' : '全屏输出（Ctrl+Shift+F）'} aria-keyshortcuts="Control+Shift+F Meta+Shift+F" aria-pressed={focused} aria-controls="transform-output" onClick={toggleFocus}>{focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
      </div>
      <div className="code-views">
        <div className={`code-view${isPreview ? ' is-inactive' : ''}`}>
          <CodeEditor ref={editorRef} snippet={snippet!} ariaLabel="转换输出" copyEnabled={result.status === 'success' && !isPreview} onCopy={copy} />
        </div>
        {isMarkdown && <div className={`code-view${isPreview ? '' : ' is-inactive'}`}>
          {displayed && (snippet?.markdownPreview
            ? <MarkdownPreview ref={previewRef} preview={snippet.markdownPreview} notify={notify} />
            : <MarkdownPreviewPlaceholder error={error} />)}
        </div>}
        {!displayed && <span className="transform-placeholder" aria-hidden="true">{result.status === 'running' ? '正在转换…' : '转换结果将显示在这里'}</span>}
      </div>
      <footer className="code-statusbar" aria-label="转换输出状态栏">
        <button type="button" className={`copy-code${copied ? ' copied' : ''}`} disabled={result.status !== 'success'} onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制' : isMarkdown ? '复制 Markdown' : '复制结果'}</button>
        <div className="code-statusbar-controls">
          {isMarkdown && <button type="button" className="code-view-toggle" aria-label={isPreview ? '查看源代码' : '切换到预览'} onClick={() => setShowSource(!showSource)}>{isPreview ? <Code2 size={16} /> : <Eye size={16} />}{isPreview ? '源代码' : '预览'}</button>}
          <span className="language"><LanguageIcon language={language} size={16} /><span>{languageName(language)}</span></span>
        </div>
      </footer>
    </div>
    {error && result.status === 'success' && <p className="placeholder-render-error" role="alert">{error}</p>}
  </section>;
}
