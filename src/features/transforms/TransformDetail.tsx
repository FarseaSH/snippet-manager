import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Code2, Copy, Maximize2, Minimize2, Zap } from 'snippet-manager/icons/ui';
import type { Snippet, SubSnippet } from '../../core/types';
import { languageName } from '../../core/language-name';
import { copyText } from '../../services/clipboard';
import { CodeEditor, type CodeEditorHandle } from '../snippets/CodeEditor';
import { LanguageIcon } from '../snippets/LanguageIcon';
import { SnippetDescription } from '../snippets/SnippetDescription';
import { SnippetHeading } from '../snippets/SnippetHeading';
import { TabOutline } from '../snippets/TabOutline';
import { useLiveTransform } from './useLiveTransform';
import { TransformOutput } from './TransformOutput';
import { useFullscreenShortcut } from '../snippets/useFullscreenShortcut';
import { useInputHistory } from '../snippets/useInputHistory';
import { CodeWrapButton, useCodeWrapping } from '../snippets/CodeWrapping';

interface Props { snippet: Snippet; initialTab?: string; showTitle?: boolean; notify(message: string): void }
const tabs = [{ id: 'transform', title: '转换' }, { id: 'transform-code', title: '转换代码' }];
const textSnippet = (id: string, title: string, language: string, code: string): SubSnippet => ({ id, title, language, code, codeHtml: '', sourceOrder: 0, sourceDescription: '', descriptionHtml: '' });
const inputGroup = { key: 'transform', fields: ['input'], persistent: true };

export function TransformDetail({ snippet, initialTab, showTitle, notify }: Props) {
  const [active, setActive] = useState(initialTab === 'transform-code' ? initialTab : 'transform');
  const history = useInputHistory(snippet.path, [inputGroup]);
  const input = history.values[inputGroup.key]?.input ?? '';
  const setInput = (value: string) => history.change(inputGroup, 'input', value);
  const [visitedCode, setVisitedCode] = useState(initialTab === 'transform-code');
  const [wrapping, toggleWrapping] = useCodeWrapping();
  const [focused, setFocused] = useState<'input' | 'source' | 'output'>();
  const activePane = useRef<'input' | 'output' | undefined>(undefined);
  const inputRef = useRef<CodeEditorHandle>(null);
  const outputRef = useRef<CodeEditorHandle>(null);
  const sourceRef = useRef<CodeEditorHandle>(null);
  const inputExpandRef = useRef<HTMLButtonElement>(null);
  const restoreView = useRef<(() => void) | undefined>(undefined);
  const [copied, setCopied] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rowRef = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const source = snippet.subSnippets[0];
  const config = snippet.transform!;
  const result = useLiveTransform(source.code, input);
  const inputSnippet = useMemo(() => textSnippet('transform-input', '转换输入', config.inputLanguage, input), [input, config.inputLanguage]);
  const invalid = result.status === 'invalid';
  const status = result.status === 'idle' ? '待输入' : result.status === 'waiting' ? '等待转换…' : result.status === 'running' ? '正在转换…' : result.status === 'success' ? '转换成功' : result.status === 'invalid' ? '输入需要修正' : '转换执行失败';
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => { setCopied(''); clearTimeout(copyTimer.current); }, [input, source.code]);
  useEffect(() => {
    if (initialTab) selectTab(initialTab);
  }, [initialTab]);
  useLayoutEffect(() => { restoreView.current?.(); restoreView.current = undefined; }, [focused]);
  useEffect(() => {
    const track = (event: Event) => {
      const pane = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-transform-pane]') : null;
      activePane.current = pane?.dataset.transformPane === 'input' ? 'input' : pane?.dataset.transformPane === 'output' ? 'output' : undefined;
    };
    document.addEventListener('pointerdown', track, true); document.addEventListener('focusin', track, true);
    return () => { document.removeEventListener('pointerdown', track, true); document.removeEventListener('focusin', track, true); };
  }, []);
  useEffect(() => {
    if (!focused) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('.html-code-dialog:modal') || (event.target instanceof Element && event.target.closest('.html-code-dialog'))) return;
      const editor = focused === 'input' ? inputRef.current : focused === 'source' ? sourceRef.current : outputRef.current;
      event.preventDefault(); event.stopPropagation();
      if (!editor?.closeSearch?.()) toggleFocus();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [focused]);
  function selectTab(id: string) {
    if (!tabs.some(tab => tab.id === id)) return;
    setActive(id); setFocused(undefined); activePane.current = undefined;
    if (id === 'transform-code') setVisitedCode(true);
    rowRef.current?.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function toggleFocus(target?: 'input' | 'output' | 'source') {
    const restores = [inputRef.current, outputRef.current, sourceRef.current].map(editor => editor?.saveViewState());
    const previous = focused;
    const next = previous ? undefined : target ?? (active === 'transform-code' ? 'source' : activePane.current ?? 'input');
    const inSearch = document.activeElement instanceof Element && Boolean(document.activeElement.closest('.cm-search'));
    restoreView.current = () => {
      restores.forEach(restore => restore?.());
      if ((next === 'input' && !inSearch) || previous === 'input') inputRef.current?.focus?.();
      else if (previous === 'source') expandRef.current?.focus({ preventScroll: true });
    };
    setFocused(next);
  }
  useFullscreenShortcut(() => toggleFocus());
  async function copy(value: string, key: string) {
    try {
      await copyText(value); notify(key === 'output' ? '转换结果已复制' : '代码已复制');
      clearTimeout(copyTimer.current); setCopied(key); copyTimer.current = setTimeout(() => setCopied(''), 1800);
      return true;
    } catch { notify('复制失败，请手动选择并复制内容'); return false; }
  }
  return <div className={`snippet-detail-layout${focused === 'input' ? ' input-focused' : focused === 'output' ? ' output-focused' : focused === 'source' ? ' code-focused' : ''}`}>
    <div className="snippet-detail-scroll">
      <article className="snippet-detail transform-detail" aria-label="片段详情">
        <SnippetHeading snippet={snippet} showTitle={showTitle} notify={notify} />
        {snippet.descriptionHtml && <SnippetDescription snippetPath={snippet.path} html={snippet.descriptionHtml} selectTab={selectTab} />}
        <section className="code-section transform-section">
          <div className="tabs" role="tablist" aria-label="转换片段" ref={rowRef} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : active === 'transform' ? 1 : 0;
            selectTab(tabs[index].id); rowRef.current?.querySelector<HTMLButtonElement>(`[data-id="${tabs[index].id}"]`)?.focus();
          }}>
            <TabOutline active={active} />
            {tabs.map(tab => <button key={tab.id} type="button" id={`tab-${tab.id}`} data-id={tab.id} className={`tab${active === tab.id ? ' active' : ''}`} role="tab" aria-selected={active === tab.id} aria-controls={`panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1} onClick={() => selectTab(tab.id)}>{tab.id === 'transform' ? <ArrowLeftRight size={15} /> : <Code2 size={15} />}{tab.title}</button>)}
          </div>
          <div id="panel-transform" className="transform-panel" role="tabpanel" aria-labelledby="tab-transform" hidden={active !== 'transform'}>
            <div className="transform-editors">
              <section className="transform-editor transform-input-editor" data-transform-pane="input" aria-label="输入区">
                <div className="transform-editor-heading"><span>输入 <span className="transform-language">{languageName(config.inputLanguage)}</span></span><div>
                  {config.example !== undefined && <button type="button" onClick={() => { setInput(config.example!); inputRef.current?.focus?.(); }}>填入示例</button>}
                  <button type="button" onClick={() => { setInput(''); inputRef.current?.focus?.(); }}>清空</button>
                </div></div>
                <div className={`transform-editor-body transform-input-body${invalid ? ' is-invalid' : ''}`}>
                  <div className="code-window-bar is-floating">
                    <div className="code-wrap-floating"><CodeWrapButton enabled={wrapping} onToggle={toggleWrapping} /></div>
                    <button ref={inputExpandRef} type="button" className="icon-button code-expand" aria-label={focused === 'input' ? '恢复正文' : '全屏输入'} title={focused === 'input' ? '恢复正文（Ctrl+Shift+F / Esc）' : '全屏输入（Ctrl+Shift+F）'} aria-keyshortcuts="Control+Shift+F Meta+Shift+F" aria-pressed={focused === 'input'} onClick={() => toggleFocus('input')}>{focused === 'input' ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
                  </div>
                  <CodeEditor ref={inputRef} snippet={inputSnippet} wrapping={wrapping} editable onChange={setInput} ariaLabel="转换输入" invalid={invalid} describedBy={invalid ? 'transform-input-error' : undefined} />
                  {input === '' && <span className="transform-placeholder" aria-hidden="true">输入或粘贴待转换的文本</span>}
                </div>
                <div className="transform-input-error" id="transform-input-error" role="alert">{invalid ? result.message : ''}</div>
                {focused === 'input' && <footer className="transform-input-status"><div className="transform-status-row"><span><Zap size={13} />停止输入 500ms 后自动转换</span><span role="status">{status}</span></div>{result.status === 'error' && <p className="transform-runtime-error" role="alert">{result.message}</p>}</footer>}
              </section>
              <TransformOutput ref={outputRef} result={result} fallbackLanguage={config.outputLanguage} notify={notify} focused={focused === 'output'} active={active === 'transform'} onToggleFocus={() => toggleFocus('output')} />
            </div>
            <div className="transform-status-row"><span><Zap size={13} />停止输入 500ms 后自动转换</span><span role="status" aria-live="polite">{status}</span></div>
            {result.status === 'error' && <p className="transform-runtime-error" role="alert">{result.message}</p>}
          </div>
          <div id="panel-transform-code" className="transform-source-panel" role="tabpanel" aria-labelledby="tab-transform-code" hidden={active !== 'transform-code'}>
            <div className="code-card">
              <div className="code-wrap-floating"><CodeWrapButton enabled={wrapping} onToggle={toggleWrapping} /></div>
              <button ref={expandRef} type="button" className="icon-button code-expand" aria-label={focused === 'source' ? '恢复正文' : '展开代码'} title={focused === 'source' ? '恢复正文（Ctrl+Shift+F / Esc）' : '展开代码（Ctrl+Shift+F）'} aria-keyshortcuts="Control+Shift+F Meta+Shift+F" aria-pressed={focused === 'source'} onClick={() => toggleFocus('source')}>{focused === 'source' ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
              {visitedCode && <CodeEditor ref={sourceRef} snippet={source} wrapping={wrapping} copyEnabled={active === 'transform-code'} onCopy={() => copy(source.code, 'code')} />}
              <footer className="code-statusbar">
                <button type="button" className="copy-code" onClick={() => void copy(source.code, 'code')}>{copied === 'code' ? <Check size={16} /> : <Copy size={16} />}{copied === 'code' ? '已复制' : '复制当前代码'}</button>
                <div className="code-statusbar-controls"><span className="language"><LanguageIcon language={source.language} size={16} />{languageName(source.language)}</span></div>
              </footer>
            </div>
          </div>
        </section>
      </article>
    </div>
  </div>;
}
