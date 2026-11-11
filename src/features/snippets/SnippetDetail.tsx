import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, Copy, Eye, Maximize2, Minimize2 } from 'lucide-react';
import type { Snippet } from '../../core/types';
import { copyText } from '../../services/clipboard';
import { SnippetDescription } from './SnippetDescription';
import { LanguageIcon } from './LanguageIcon';
import { MarkdownPreview } from './MarkdownPreview';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { parsePlaceholders, replacePlaceholders, type PlaceholderValues } from '../../core/placeholders';
import { PlaceholderInputs } from './PlaceholderInputs';
import { TabOutline } from './TabOutline';
import { useRenderedCode } from './useRenderedCode';
import { SnippetHeading } from './SnippetHeading';
import { TransformDetail } from '../transforms/TransformDetail';

interface Props { snippet: Snippet; initialTab?: string; showTitle?: boolean; notify(message: string): void }

export function SnippetDetail(props: Props) {
  return props.snippet.type === 'transform' ? <TransformDetail key={props.snippet.path} {...props} /> : <CodeSnippetDetail {...props} />;
}

function CodeSnippetDetail({ snippet, initialTab, showTitle = true, notify }: Props) {
  const [active, setActive] = useState(initialTab || snippet.subSnippets[0]?.id || '');
  const [showSource, setShowSource] = useState(false);
  const previewRef = useRef<CodeEditorHandle>(null);
  const modeViews = useRef<{ preview?: () => void; source?: () => void }>({});
  const [focused, setFocused] = useState(false);
  const editorRef = useRef<CodeEditorHandle>(null);
  const restoreEditor = useRef<(() => void) | undefined>(undefined);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const wasFocused = useRef(false);
  const [copied, setCopied] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [parameters, setParameters] = useState<{ path: string; tabs: Record<string, PlaceholderValues> }>({ path: snippet.path, tabs: {} });
  useEffect(() => {
    setActive(initialTab || snippet.subSnippets[0]?.id || '');
  }, [snippet.path, initialTab]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const sub = snippet.subSnippets.find(part => part.id === active) ?? snippet.subSnippets[0];
  const template = useMemo(() => parsePlaceholders(sub?.code ?? ''), [sub?.code]);
  const values = parameters.path === snippet.path ? parameters.tabs[sub?.id ?? ''] ?? {} : {};
  const code = useMemo(() => replacePlaceholders(sub?.code ?? '', template, values), [sub?.code, template, values]);
  const { snippet: displaySub, error: renderError } = useRenderedCode(sub, code);
  function changeParameter(name: string, value: string) {
    if (!sub) return;
    setParameters(previous => {
      const tabs = previous.path === snippet.path ? previous.tabs : {};
      return { path: snippet.path, tabs: { ...tabs, [sub.id]: { ...tabs[sub.id], [name]: value } } };
    });
  }
  function resetParameters() {
    if (!sub) return;
    setParameters(previous => ({ path: snippet.path, tabs: { ...(previous.path === snippet.path ? previous.tabs : {}), [sub.id]: {} } }));
  }
  useEffect(() => { setParameters({ path: snippet.path, tabs: {} }); }, [snippet.path]);
  const isMarkdown = Boolean(sub?.markdownPreview);
  const isPreview = isMarkdown && !showSource;
  const hasTabs = snippet.subSnippets.length > 1;
  useEffect(() => { setCopied(false); clearTimeout(copyTimer.current); }, [sub?.id, code]);
  useLayoutEffect(() => { setFocused(false); setShowSource(false); modeViews.current = {}; restoreEditor.current = undefined; }, [snippet.path, sub?.id]);
  useLayoutEffect(() => {
    restoreEditor.current?.(); restoreEditor.current = undefined;
    if (!focused && wasFocused.current) expandButtonRef.current?.focus({ preventScroll: true });
    wasFocused.current = focused;
  }, [focused]);
  useEffect(() => {
    if (!focused) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restoreEditor.current = saveCodeViewState();
        setFocused(false);
      }
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [focused, sub?.id]);
  function saveCodeViewState() {
    const restoreSource = editorRef.current?.saveViewState();
    const restorePreview = previewRef.current?.saveViewState();
    return () => { restoreSource?.(); restorePreview?.(); };
  }
  useLayoutEffect(() => {
    if (showSource) modeViews.current.source?.();
    else modeViews.current.preview?.();
  }, [showSource]);
  function toggleSource() {
    if (showSource) modeViews.current.source = editorRef.current?.saveViewState();
    else modeViews.current.preview = previewRef.current?.saveViewState();
    setShowSource(value => !value);
  }
  function toggleFocus() {
    restoreEditor.current = saveCodeViewState();
    setFocused(value => !value);
  }
  async function copy(value: string, message: string, code = false) {
    try {
      await copyText(value); notify(message);
      if (code) { setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1800); }
    } catch { notify('复制失败，请手动选择并复制内容'); }
  }
  function selectTab(id: string) {
    if (!snippet.subSnippets.some(part => part.id === id)) return;
    setActive(id);
    tabsRef.current?.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  return <div className={`snippet-detail-layout ${focused ? 'code-focused' : ''}`}>
    <div className="snippet-detail-scroll">
    <article className="snippet-detail" aria-label="片段详情">
    <SnippetHeading snippet={snippet} showTitle={showTitle} notify={notify} />
    {snippet.descriptionHtml && <SnippetDescription snippetPath={snippet.path} html={snippet.descriptionHtml} selectTab={selectTab} />}
    {sub ? <section className="code-section">
      {hasTabs && <div className="tabs" role="tablist" aria-label="子片段" ref={tabsRef} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = snippet.subSnippets.findIndex(part => part.id === sub.id);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? snippet.subSnippets.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + snippet.subSnippets.length) % snippet.subSnippets.length;
        const target = snippet.subSnippets[index];
        setActive(target.id); tabsRef.current?.querySelector<HTMLButtonElement>(`[data-id="${target.id}"]`)?.focus();
      }}>
        <TabOutline key={`${snippet.path}:${snippet.subSnippets.map(part => part.id).join(',')}`} active={sub.id} />
        {snippet.subSnippets.map(part => <button key={part.id} data-id={part.id} id={`tab-${part.id}`} className={`tab ${part.id === sub.id ? 'active' : ''}`} role="tab" tabIndex={part.id === sub.id ? 0 : -1} aria-selected={part.id === sub.id} aria-controls="code-panel" onClick={() => setActive(part.id)}><LanguageIcon language={part.language} />{part.title}</button>)}
      </div>}
      <SnippetDescription snippetPath={snippet.path} descriptionKey={sub.id} className="tab-description" label="当前 Tab 说明" html={sub.descriptionHtml} selectTab={selectTab} />
      <PlaceholderInputs template={template} values={values} onChange={changeParameter} onReset={resetParameters} />
      {renderError && <p className="placeholder-render-error" role="alert">{renderError}</p>}
      <div className={`code-card ${isPreview ? 'markdown-window is-preview' : ''}`} role={hasTabs && !focused ? 'tabpanel' : 'region'} id="code-panel" aria-labelledby={hasTabs && !focused ? `tab-${sub.id}` : undefined} aria-label={hasTabs && !focused ? undefined : '代码'}>
        <div className={`code-window-bar ${isPreview ? '' : 'is-floating'}`}>
          {isPreview && <>
            <div className="window-traffic-lights" aria-hidden="true"><span className="window-dot red" /><span className="window-dot yellow" /><span className="window-dot green" /></div>
            <span className="code-window-title">Markdown 预览</span>
          </>}
          <button ref={expandButtonRef} type="button" className="icon-button code-expand" aria-label={focused ? '恢复正文' : '展开代码'} title={focused ? '恢复正文（Esc）' : '展开代码'} aria-pressed={focused} aria-controls="code-panel" onClick={toggleFocus}>
            {focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
        <div className="code-views">
          <div className={`code-view ${isMarkdown && !showSource ? 'is-inactive' : ''}`}>
            <CodeEditor ref={editorRef} key={`${snippet.path}:${sub.id}`} snippet={displaySub!} />
          </div>
          {isMarkdown && <div className={`code-view ${showSource ? 'is-inactive' : ''}`}>
            {displaySub?.markdownPreview ? <MarkdownPreview ref={previewRef} key={`${snippet.path}:${sub.id}`} preview={displaySub.markdownPreview} notify={notify} /> : <div className="markdown-preview" role="status">{renderError ? '预览暂不可用，请查看源代码。' : '正在更新预览…'}</div>}
          </div>}
        </div>
        <footer className="code-statusbar" aria-label="当前代码状态栏">
          <span className="language"><LanguageIcon language={sub.language} size={16} />{isMarkdown ? 'Markdown' : sub.language === 'text' ? 'Plain Text' : sub.language}</span>
          {isMarkdown && <button type="button" className="code-view-toggle" aria-label={showSource ? '切换到预览' : '查看源代码'} onClick={toggleSource}>
            {showSource ? <Eye size={16} /> : <Code2 size={16} />}{showSource ? '预览' : '源代码'}
          </button>}
          <button className={`copy-code ${copied ? 'copied' : ''}`} onClick={() => void copy(code, '代码已复制', true)}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制' : isMarkdown ? '复制 Markdown' : '复制当前代码'}</button>
        </footer>
      </div>
    </section> : <div className="empty-code"><Code2 size={28} /><h3>这个片段还没有代码块</h3><p>说明内容仍可阅读和复制。添加代码块后，这里会显示代码。</p></div>}
    </article>
    </div>
  </div>;
}
