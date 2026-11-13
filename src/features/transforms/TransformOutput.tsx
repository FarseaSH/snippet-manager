import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, Copy, Eye, Maximize2, Minimize2 } from 'lucide-react';
import type { SubSnippet } from '../../core/types';
import { resolveTransformLanguage } from '../../core/transform';
import { copyText } from '../../services/clipboard';
import { CodeEditor, type CodeEditorHandle } from '../snippets/CodeEditor';
import { LanguageIcon } from '../snippets/LanguageIcon';
import { MarkdownPreview } from '../snippets/MarkdownPreview';
import { useRenderedCode } from '../snippets/useRenderedCode';
import type { TransformState } from './useLiveTransform';

interface Props { result: TransformState; fallbackLanguage: string; notify(message: string): void; focused: boolean; onToggleFocus(): void }

export function TransformOutput({ result, fallbackLanguage, notify, focused, onToggleFocus }: Props) {
  const [lastLanguage, setLastLanguage] = useState(() => resolveTransformLanguage(undefined, fallbackLanguage));
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editorRef = useRef<CodeEditorHandle>(null);
  const previewRef = useRef<CodeEditorHandle>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const restoreView = useRef<(() => void) | undefined>(undefined);
  const wasFocused = useRef(false);
  const language = result.status === 'success' ? resolveTransformLanguage(result.language, fallbackLanguage) : lastLanguage;
  const output = result.status === 'success' ? result.output : '';
  const isMarkdown = language === 'markdown';
  const isPreview = isMarkdown && !(showSource && language === lastLanguage);
  const source = useMemo<SubSnippet>(() => ({ id: 'transform-output', title: '转换输出', language, code: '', codeHtml: '', sourceOrder: 0, sourceDescription: '', descriptionHtml: '' }), [language]);
  const { snippet, error } = useRenderedCode(source, output);
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
  useEffect(() => {
    if (!focused) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); toggleFocus(); }
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [focused, onToggleFocus]);
  async function copy() {
    try {
      await copyText(output); notify('转换结果已复制');
      clearTimeout(copyTimer.current); setCopied(true); copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch { notify('复制失败，请手动选择并复制内容'); }
  }
  return <section className="transform-editor" aria-label="输出区">
    <div className="transform-editor-heading"><span>输出</span></div>
    <div id="transform-output" className={`transform-editor-body transform-output-body${isPreview ? ' markdown-window is-preview' : ''}`}>
      <div className={`code-window-bar${isPreview ? '' : ' is-floating'}`}>
        {isPreview && <>
        <div className="window-traffic-lights" aria-hidden="true"><span className="window-dot red" /><span className="window-dot yellow" /><span className="window-dot green" /></div>
        <span className="code-window-title">Markdown 预览</span>
        </>}
        <button ref={expandRef} type="button" className="icon-button code-expand" aria-label={focused ? '恢复正文' : '全屏输出'} title={focused ? '恢复正文（Esc）' : '全屏输出'} aria-pressed={focused} aria-controls="transform-output" onClick={toggleFocus}>{focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
      </div>
      <div className="code-views">
        <div className={`code-view${isPreview ? ' is-inactive' : ''}`}>
          <CodeEditor ref={editorRef} snippet={snippet!} ariaLabel="转换输出" />
        </div>
        {isMarkdown && <div className={`code-view${isPreview ? '' : ' is-inactive'}`}>
          {result.status === 'success' && (snippet?.markdownPreview
            ? <MarkdownPreview ref={previewRef} preview={snippet.markdownPreview} notify={notify} />
            : <div className="markdown-preview" role="status">{error ? '预览暂不可用，请查看源代码。' : '正在更新预览…'}</div>)}
        </div>}
        {result.status !== 'success' && <span className="transform-placeholder" aria-hidden="true">{result.status === 'running' ? '正在转换…' : '转换结果将显示在这里'}</span>}
      </div>
      <footer className="code-statusbar" aria-label="转换输出状态栏">
        <span className="language"><LanguageIcon language={language} size={16} /><span>{isMarkdown ? 'Markdown' : language === 'text' ? 'Plain Text' : language}</span></span>
        {isMarkdown && <button type="button" className="code-view-toggle" aria-label={isPreview ? '查看源代码' : '切换到预览'} onClick={() => setShowSource(!showSource)}>{isPreview ? <Code2 size={16} /> : <Eye size={16} />}{isPreview ? '源代码' : '预览'}</button>}
        <button type="button" className={`copy-code${copied ? ' copied' : ''}`} disabled={result.status !== 'success'} onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制' : isMarkdown ? '复制 Markdown' : '复制结果'}</button>
      </footer>
    </div>
    {error && result.status === 'success' && <p className="placeholder-render-error" role="alert">{error}</p>}
  </section>;
}
