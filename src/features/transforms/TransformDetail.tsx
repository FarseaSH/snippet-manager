import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Code2, Copy, Maximize2, Minimize2, Zap } from 'lucide-react';
import type { Snippet, SubSnippet } from '../../core/types';
import { copyText } from '../../services/clipboard';
import { CodeEditor } from '../snippets/CodeEditor';
import { LanguageIcon } from '../snippets/LanguageIcon';
import { SnippetDescription } from '../snippets/SnippetDescription';
import { SnippetHeading } from '../snippets/SnippetHeading';
import { TabOutline } from '../snippets/TabOutline';
import { useRenderedCode } from '../snippets/useRenderedCode';
import { useLiveTransform } from './useLiveTransform';

interface Props { snippet: Snippet; initialTab?: string; showTitle?: boolean; notify(message: string): void }
const tabs = [{ id: 'transform', title: '转换' }, { id: 'transform-code', title: '转换代码' }];
const textSnippet = (id: string, title: string, language: string, code: string): SubSnippet => ({ id, title, language, code, codeHtml: '', sourceOrder: 0, sourceDescription: '', descriptionHtml: '' });

export function TransformDetail({ snippet, initialTab, showTitle, notify }: Props) {
  const [active, setActive] = useState(initialTab === 'transform-code' ? initialTab : 'transform');
  const [input, setInput] = useState('');
  const [visitedCode, setVisitedCode] = useState(initialTab === 'transform-code');
  const [focused, setFocused] = useState(false);
  const [copied, setCopied] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rowRef = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const source = snippet.subSnippets[0];
  const config = snippet.transform!;
  const result = useLiveTransform(source.code, input);
  const inputSnippet = useMemo(() => textSnippet('transform-input', '转换输入', config.inputLanguage, input), [input, config.inputLanguage]);
  const outputSource = useMemo(() => textSnippet('transform-output', '转换输出', config.outputLanguage, ''), [config.outputLanguage]);
  const output = result.status === 'success' ? result.output : '';
  const { snippet: outputSnippet } = useRenderedCode(outputSource, output);
  const invalid = result.status === 'invalid';
  const status = result.status === 'idle' ? '待输入' : result.status === 'waiting' ? '等待转换…' : result.status === 'running' ? '正在转换…' : result.status === 'success' ? '转换成功' : result.status === 'invalid' ? '输入需要修正' : '转换执行失败';
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => { setCopied(''); clearTimeout(copyTimer.current); }, [input, source.code]);
  useEffect(() => {
    if (initialTab) selectTab(initialTab);
  }, [initialTab]);
  useEffect(() => {
    if (!focused) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setFocused(false); expandRef.current?.focus(); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [focused]);
  function selectTab(id: string) {
    if (!tabs.some(tab => tab.id === id)) return;
    setActive(id); setFocused(false);
    if (id === 'transform-code') setVisitedCode(true);
    rowRef.current?.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  async function copy(value: string, key: string) {
    try {
      await copyText(value); notify(key === 'output' ? '转换结果已复制' : '代码已复制');
      clearTimeout(copyTimer.current); setCopied(key); copyTimer.current = setTimeout(() => setCopied(''), 1800);
    } catch { notify('复制失败，请手动选择并复制内容'); }
  }
  return <div className={`snippet-detail-layout${focused ? ' code-focused' : ''}`}>
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
              <section className="transform-editor" aria-label="输入区">
                <div className="transform-editor-heading"><span>输入 <span className="transform-language">{config.inputLanguage}</span></span><div>
                  {config.example !== undefined && <button type="button" onClick={() => setInput(config.example!)}>填入示例</button>}
                  <button type="button" onClick={() => setInput('')}>清空</button>
                </div></div>
                <div className={`transform-editor-body${invalid ? ' is-invalid' : ''}`}>
                  <CodeEditor snippet={inputSnippet} editable onChange={setInput} ariaLabel="转换输入" invalid={invalid} describedBy={invalid ? 'transform-input-error' : undefined} />
                  {input === '' && <span className="transform-placeholder" aria-hidden="true">输入或粘贴待转换的文本</span>}
                </div>
                <div className="transform-input-error" id="transform-input-error" role="alert">{invalid ? result.message : ''}</div>
              </section>
              <section className="transform-editor" aria-label="输出区">
                <div className="transform-editor-heading"><span>输出 <span className="transform-language">{config.outputLanguage}</span></span><button type="button" disabled={result.status !== 'success'} onClick={() => void copy(output, 'output')}>{copied === 'output' ? <Check size={13} /> : <Copy size={13} />}{copied === 'output' ? '已复制' : '复制结果'}</button></div>
                <div className="transform-editor-body">
                  <CodeEditor snippet={outputSnippet!} ariaLabel="转换输出" />
                  {result.status !== 'success' && <span className="transform-placeholder" aria-hidden="true">{result.status === 'running' ? '正在转换…' : '转换结果将显示在这里'}</span>}
                </div>
              </section>
            </div>
            <div className="transform-status-row"><span><Zap size={13} />停止输入 500ms 后自动转换</span><span role="status" aria-live="polite">{status}</span></div>
            {result.status === 'error' && <p className="transform-runtime-error" role="alert">{result.message}</p>}
          </div>
          <div id="panel-transform-code" className="transform-source-panel" role="tabpanel" aria-labelledby="tab-transform-code" hidden={active !== 'transform-code'}>
            <div className="code-card">
              <button ref={expandRef} type="button" className="icon-button code-expand" aria-label={focused ? '恢复正文' : '展开代码'} onClick={() => setFocused(!focused)}>{focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
              {visitedCode && <CodeEditor snippet={source} />}
              <footer className="code-statusbar"><span className="language"><LanguageIcon language="javascript" size={16} />javascript</span><button type="button" className="copy-code" onClick={() => void copy(source.code, 'code')}>{copied === 'code' ? <Check size={16} /> : <Copy size={16} />}{copied === 'code' ? '已复制' : '复制当前代码'}</button></footer>
            </div>
          </div>
        </section>
      </article>
    </div>
  </div>;
}
