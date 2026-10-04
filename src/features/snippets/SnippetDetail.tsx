import { useEffect, useRef, useState } from 'react';
import { Check, Code2, Copy, FileCode2, FileText, Link } from 'lucide-react';
import type { Snippet } from '../../core/types';
import { encodePath, pagePath } from '../../core/paths';
import { copyText } from '../../services/clipboard';
import { SnippetDescription } from './SnippetDescription';
import { LanguageIcon } from './LanguageIcon';
import { CodeEditor } from './CodeEditor';

interface Props { snippet: Snippet; initialTab?: string; notify(message: string): void }

export function SnippetDetail({ snippet, initialTab, notify }: Props) {
  const [active, setActive] = useState(initialTab || snippet.subSnippets[0]?.id || '');
  const [copied, setCopied] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setActive(initialTab || snippet.subSnippets[0]?.id || '');
  }, [snippet.path, initialTab]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const sub = snippet.subSnippets.find(part => part.id === active) ?? snippet.subSnippets[0];
  const hasTabs = snippet.subSnippets.length > 1;
  useEffect(() => { setCopied(false); clearTimeout(copyTimer.current); }, [sub?.id, sub?.code]);
  async function copy(value: string, message: string, code = false) {
    try {
      await copyText(value); notify(message);
      if (code) { setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1800); }
    } catch { notify('复制失败，请手动选择并复制内容'); }
  }
  const absolute = (route: string) => new URL(import.meta.env.BASE_URL + route.replace(/^\//, ''), window.location.origin).href;
  return <div className="snippet-detail-layout">
    <div className="snippet-detail-scroll">
    <article className="snippet-detail" aria-label="片段详情">
    <div className="detail-title-row"><h1>{snippet.name}</h1><div className="snippet-actions" role="group" aria-label="片段操作">
      <button onClick={() => void copy(absolute(pagePath(snippet.path)), '页面链接已复制')}><Link size={14} />复制页面链接</button>
      <button onClick={() => void copy(absolute(`/raw/${encodePath(snippet.path)}`), 'Markdown 地址已复制')}><FileCode2 size={14} />复制 Markdown URL</button>
      <button onClick={() => void copy(snippet.raw, '完整 Markdown 已复制')}><FileText size={14} />复制 Markdown</button>
    </div></div>
    <div className="detail-tags">{snippet.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}</div>
    {snippet.descriptionHtml && <SnippetDescription snippetPath={snippet.path} html={snippet.descriptionHtml} selectTab={id => {
      if (snippet.subSnippets.some(part => part.id === id)) {
        setActive(id);
        tabsRef.current?.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }} />}
    {sub ? <section className="code-section">
      {hasTabs && <div className="tabs" role="tablist" aria-label="子片段" ref={tabsRef} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = snippet.subSnippets.findIndex(part => part.id === sub.id);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? snippet.subSnippets.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + snippet.subSnippets.length) % snippet.subSnippets.length;
        const target = snippet.subSnippets[index];
        setActive(target.id); tabsRef.current?.querySelector<HTMLButtonElement>(`[data-id="${target.id}"]`)?.focus();
      }}>
        {snippet.subSnippets.map(part => <button key={part.id} data-id={part.id} id={`tab-${part.id}`} className={`tab ${part.id === sub.id ? 'active' : ''}`} role="tab" tabIndex={part.id === sub.id ? 0 : -1} aria-selected={part.id === sub.id} aria-controls="code-panel" onClick={() => setActive(part.id)}><LanguageIcon language={part.language} />{part.title}</button>)}
      </div>}
      <div className="code-card" role={hasTabs ? 'tabpanel' : 'region'} id="code-panel" aria-labelledby={hasTabs ? `tab-${sub.id}` : undefined} aria-label={hasTabs ? undefined : '代码'}>
        <CodeEditor key={`${snippet.path}:${sub.id}`} snippet={sub} />
        <footer className="code-statusbar" aria-label="当前代码状态栏">
          <span className="language"><LanguageIcon language={sub.language} />{sub.language === 'text' ? 'Plain Text' : sub.language}</span>
          <span className="editor-mode">只读</span>
          <span className="line-count">{sub.code.split('\n').length} 行</span>
          <button className={`copy-code ${copied ? 'copied' : ''}`} onClick={() => void copy(sub.code, '代码已复制', true)}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制当前代码'}</button>
        </footer>
      </div>
    </section> : <div className="empty-code"><Code2 size={28} /><h3>这个片段还没有代码块</h3><p>说明内容仍可阅读和复制。添加代码块后，这里会显示代码。</p></div>}
    </article>
    </div>
  </div>;
}
