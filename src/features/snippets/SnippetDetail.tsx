import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, Copy, Eye, Maximize2, Minimize2, RotateCcw } from 'snippet-manager/icons/ui';
import type { Snippet } from '../../core/types';
import { languageName } from '../../core/language-name';
import { copyText } from '../../services/clipboard';
import { SnippetDescription } from './SnippetDescription';
import { LanguageIcon } from './LanguageIcon';
import { MarkdownPreview } from './MarkdownPreview';
import { MarkdownPreviewPlaceholder } from './MarkdownPreviewPlaceholder';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { parsePlaceholders, replacePlaceholders, type PlaceholderValues } from '../../core/placeholders';
import { PlaceholderInputs } from './PlaceholderInputs';
import { TabOutline } from './TabOutline';
import { useRenderedCode } from './useRenderedCode';
import { SnippetHeading } from './SnippetHeading';
import { TransformDetail } from '../transforms/TransformDetail';
import { HtmlPreview, type HtmlPreviewHandle } from './HtmlPreview';
import { useFullscreenShortcut } from './useFullscreenShortcut';
import { parameterHistoryGroups } from '../../core/input-history';
import { useInputHistory } from './useInputHistory';

interface Props { snippet: Snippet; initialTab?: string; showTitle?: boolean; notify(message: string): void }

export function SnippetDetail(props: Props) {
  return props.snippet.type === 'transform' ? <TransformDetail key={props.snippet.path} {...props} /> : <CodeSnippetDetail key={props.snippet.path} {...props} />;
}

function CodeSnippetDetail({ snippet, initialTab, showTitle = true, notify }: Props) {
  const [active, setActive] = useState(initialTab || snippet.subSnippets[0]?.id || '');
  const [showSource, setShowSource] = useState(false);
  const previewRef = useRef<CodeEditorHandle>(null);
  const htmlPreviewRef = useRef<HtmlPreviewHandle>(null);
  const [visitedHtml, setVisitedHtml] = useState<{ path: string; ids: Set<string> }>({ path: snippet.path, ids: new Set() });
  const modeViews = useRef<{ preview?: () => void; source?: () => void }>({});
  const [focused, setFocused] = useState(false);
  const editorRef = useRef<CodeEditorHandle>(null);
  const restoreEditor = useRef<(() => void) | undefined>(undefined);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const wasFocused = useRef(false);
  const [copied, setCopied] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const historyGroups = useMemo(() => parameterHistoryGroups(snippet.subSnippets), [snippet.subSnippets]);
  const history = useInputHistory(snippet.path, [...historyGroups.values()]);
  const parameters = useMemo<Record<string, PlaceholderValues>>(() => Object.fromEntries(snippet.subSnippets.map(part => [part.id, history.values[historyGroups.get(part.id)!.key] ?? {}])), [snippet.subSnippets, history.values, historyGroups]);
  useEffect(() => {
    setActive(initialTab || snippet.subSnippets[0]?.id || '');
  }, [snippet.path, initialTab]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const sub = snippet.subSnippets.find(part => part.id === active) ?? snippet.subSnippets[0];
  const template = useMemo(() => parsePlaceholders(sub?.code ?? ''), [sub?.code]);
  const values = parameters[sub?.id ?? ''] ?? {};
  const code = useMemo(() => replacePlaceholders(sub?.code ?? '', template, values), [sub?.code, template, values]);
  const { snippet: displaySub, error: renderError } = useRenderedCode(sub, code);
  function changeParameter(name: string, value: string) {
    if (!sub) return;
    history.change(historyGroups.get(sub.id)!, name, value);
  }
  function resetParameters() {
    if (!sub) return;
    history.clear(historyGroups.get(sub.id)!);
  }
  const isMarkdown = Boolean(sub?.markdownPreview);
  const isHtml = !!sub && ['html', 'html5', 'htm'].includes(sub.language.trim().toLowerCase());
  const isPreviewable = isMarkdown || isHtml;
  const isPreview = isPreviewable && !showSource;
  const previewFiles = useMemo(() => snippet.subSnippets.map(part => ({
    id: part.id, title: part.title, language: part.language,
    code: replacePlaceholders(part.code, parsePlaceholders(part.code), parameters[part.id] ?? {}),
  })), [snippet, parameters]);
  useLayoutEffect(() => {
    if (isHtml && sub && (visitedHtml.path !== snippet.path || !visitedHtml.ids.has(sub.id))) {
      setVisitedHtml(previous => ({ path: snippet.path, ids: new Set([...(previous.path === snippet.path ? previous.ids : []), sub.id]) }));
    }
  }, [isHtml, sub?.id, snippet.path, visitedHtml]);
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
        if (document.querySelector('.html-code-dialog:modal')) return;
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
    const restorePreview = (isHtml ? htmlPreviewRef.current : previewRef.current)?.saveViewState();
    return () => { restoreSource?.(); restorePreview?.(); };
  }
  useLayoutEffect(() => {
    if (showSource) modeViews.current.source?.();
    else modeViews.current.preview?.();
  }, [showSource]);
  function toggleSource() {
    if (showSource) modeViews.current.source = editorRef.current?.saveViewState();
    else modeViews.current.preview = (isHtml ? htmlPreviewRef.current : previewRef.current)?.saveViewState();
    setShowSource(value => !value);
  }
  function toggleFocus() {
    restoreEditor.current = saveCodeViewState();
    setFocused(value => !value);
  }
  useFullscreenShortcut(toggleFocus, { enabled: Boolean(sub) });
  async function copy(value: string, message: string, code = false) {
    try {
      await copyText(value); notify(message);
      if (code) { setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1800); }
      return true;
    } catch { notify('复制失败，请手动选择并复制内容'); return false; }
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
            <span className="code-window-title">{isHtml ? 'HTML' : 'Markdown'} 预览</span>
          </>}
          <button ref={expandButtonRef} type="button" className="icon-button code-expand" aria-label={focused ? '恢复正文' : '展开代码'} title={focused ? '恢复正文（Ctrl+Shift+F / Esc）' : '展开代码（Ctrl+Shift+F）'} aria-keyshortcuts="Control+Shift+F Meta+Shift+F" aria-pressed={focused} aria-controls="code-panel" onClick={toggleFocus}>
            {focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
        <div className="code-views">
          <div className={`code-view ${isPreviewable && !showSource ? 'is-inactive' : ''}`}>
            <CodeEditor ref={editorRef} key={`${snippet.path}:${sub.id}`} snippet={displaySub!} copyEnabled={!isPreview} onCopy={() => copy(code, '代码已复制', true)} />
          </div>
          {isMarkdown && <div className={`code-view ${showSource ? 'is-inactive' : ''}`}>
            {displaySub?.markdownPreview ? <MarkdownPreview ref={previewRef} key={`${snippet.path}:${sub.id}`} preview={displaySub.markdownPreview} notify={notify} /> : <MarkdownPreviewPlaceholder key={`${snippet.path}:${sub.id}`} error={renderError} />}
          </div>}
          {previewFiles.filter(file => ['html', 'html5', 'htm'].includes(file.language.trim().toLowerCase()) && ((visitedHtml.path === snippet.path && visitedHtml.ids.has(file.id)) || file.id === sub.id)).map(file => <div key={`${snippet.path}:${file.id}`} className={`code-view ${!isHtml || file.id !== sub.id || showSource ? 'is-inactive' : ''}`}>
            <HtmlPreview ref={file.id === sub.id ? htmlPreviewRef : undefined} entry={file} files={previewFiles} onEscape={() => setFocused(false)} onToggleFullscreen={() => { if (isHtml && file.id === sub.id && !showSource) toggleFocus(); }} />
          </div>)}
        </div>
        <footer className="code-statusbar" aria-label="当前代码状态栏">
          <button className={`copy-code ${copied ? 'copied' : ''}`} onClick={() => void copy(code, '代码已复制', true)}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制' : isHtml ? '复制 HTML' : isMarkdown ? '复制 Markdown' : '复制当前代码'}</button>
          <div className="code-statusbar-controls">
            {isHtml && <button type="button" className="code-view-toggle" aria-label="重新运行 HTML" onClick={() => htmlPreviewRef.current?.rerun()}><RotateCcw size={15} />重新运行</button>}
            {isPreviewable && <button type="button" className="code-view-toggle" aria-label={showSource ? '切换到预览' : '查看源代码'} onClick={toggleSource}>
              {showSource ? <Eye size={16} /> : <Code2 size={16} />}{showSource ? '预览' : '源代码'}
            </button>}
            <span className="language"><LanguageIcon language={sub.language} size={16} />{languageName(sub.language)}</span>
          </div>
        </footer>
      </div>
    </section> : <div className="empty-code"><Code2 size={28} /><h3>这个片段还没有代码块</h3><p>说明内容仍可阅读和复制。添加代码块后，这里会显示代码。</p></div>}
    </article>
    </div>
  </div>;
}
