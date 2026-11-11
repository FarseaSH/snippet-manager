import { ArrowLeftRight, FileCode2, FileText, Link } from 'lucide-react';
import type { Snippet } from '../../core/types';
import { encodePath, pagePath } from '../../core/paths';
import { copyText } from '../../services/clipboard';

interface Props { snippet: Snippet; showTitle?: boolean; notify(message: string): void }

export function SnippetHeading({ snippet, showTitle = true, notify }: Props) {
  const absolute = (route: string) => new URL(import.meta.env.BASE_URL + route.replace(/^\//, ''), window.location.origin).href;
  async function copy(value: string, message: string) {
    try { await copyText(value); notify(message); } catch { notify('复制失败，请手动选择并复制内容'); }
  }
  return <>
    <div className="detail-title-row">{showTitle && <h1>{snippet.name}</h1>}<div className="snippet-actions" role="group" aria-label="片段操作">
      <button onClick={() => void copy(absolute(pagePath(snippet.path)), '页面链接已复制')}><Link size={14} />复制页面链接</button>
      <button onClick={() => void copy(absolute(`/raw/${encodePath(snippet.path)}`), 'Markdown 地址已复制')}><FileCode2 size={14} />复制 Markdown URL</button>
      <button onClick={() => void copy(snippet.raw, '完整 Markdown 已复制')}><FileText size={14} />复制 Markdown</button>
    </div></div>
    <div className="detail-tags">{snippet.type === 'transform' && <span className="snippet-type-badge"><ArrowLeftRight size={12} />转换</span>}{snippet.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}</div>
  </>;
}
