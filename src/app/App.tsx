import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Braces, Check, ChevronDown, Code2, FileCode2, Folder as FolderGlyph, LoaderCircle, Search, SearchX, WifiOff, X } from 'lucide-react';
import { useContent } from './useContent';
import { usePwa } from '../pwa/usePwa';
import { FolderTree } from '../features/folders/FolderTree';
import { FolderIcon } from '../features/folders/FolderIcon';
import { SnippetDetail } from '../features/snippets/SnippetDetail';
import { belongsTo, compareNames, folderLabel, folderPath, pagePath } from '../core/paths';
import { searchSnippets } from '../core/search';
import { readPreference, savePreference } from '../services/clipboard';
import type { Folder } from '../core/types';

interface NavigationState { query: string; expanded: Set<string>; tab?: string; tabPath?: string; showResults: boolean }
type Action = { type: 'query'; value: string } | { type: 'expand'; path: string } | { type: 'reveal'; path: string } | { type: 'tab'; path: string; tab?: string };
function reducer(state: NavigationState, action: Action): NavigationState {
  if (action.type === 'query') return { ...state, query: action.value, showResults: Boolean(action.value.trim()) };
  if (action.type === 'tab') return { ...state, tab: action.tab, tabPath: action.path, showResults: false };
  const expanded = new Set(state.expanded);
  if (action.type === 'expand') { if (expanded.has(action.path)) expanded.delete(action.path); else expanded.add(action.path); }
  else { const parts = action.path.split('/'); for (let index = 1; index <= parts.length; index++) expanded.add(parts.slice(0, index).join('/')); }
  return { ...state, expanded };
}

export function App() {
  const { data, error, retry } = useContent();
  const pwa = usePwa();
  const [state, dispatch] = useReducer(reducer, { query: '', expanded: new Set<string>(), showResults: false });
  const [toast, setToast] = useState('');
  const [picker, setPicker] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const searchRef = useRef<HTMLInputElement>(null);
  const restoreDone = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const location = useLocation();
  const navigate = useNavigate();
  let pathname = location.pathname.replace(/\/$/, '') || '/';
  try { pathname = decodeURIComponent(pathname); } catch { pathname = '/invalid-url'; }
  const snippetPath = pathname.startsWith('/snippet/') ? pathname.slice(9) : undefined;
  const selected = data?.library.snippets.find(snippet => snippet.path.replace(/\.md$/i, '') === snippetPath);
  const folder = selected
    ? (typeof location.state?.listFolder === 'string' ? location.state.listFolder : selected.folder)
    : (pathname === '/folder' ? '' : pathname.startsWith('/folder/') ? pathname.slice(8) : '');
  const query = state.query.trim();
  const folders = useMemo(() => {
    const values = new Map<string, Folder>();
    if (data) { const visit = (node: Folder) => { values.set(node.path, node); node.children.forEach(visit); }; visit(data.library.folders); }
    return values;
  }, [data]);
  const results = useMemo(() => data && query ? searchSnippets(data.search, query) : [], [data, query]);
  const visible = useMemo(() => {
    if (!data) return [];
    if (query) { const byPath = new Map(data.library.snippets.map(snippet => [snippet.path, snippet])); return results.map(result => byPath.get(result.path)!); }
    return data.library.snippets.filter(snippet => belongsTo(snippet.path, folder)).sort(compareNames);
  }, [data, query, results, folder]);
  useEffect(() => {
    if (!data || restoreDone.current) return;
    restoreDone.current = true;
    if (pathname !== '/') return;
    const previous = readPreference('snippet-manager:last');
    if (previous && data.library.snippets.some(snippet => snippet.path === previous)) navigate(pagePath(previous), { replace: true });
  }, [data, pathname, navigate]);
  useEffect(() => {
    if (selected) { savePreference('snippet-manager:last', selected.path); document.title = `${selected.name} · Snippet Manager`; }
    else document.title = 'Snippet Manager';
    dispatch({ type: 'reveal', path: folder });
  }, [selected?.path, selected?.name, folder]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !target.closest('input, textarea, [contenteditable="true"]')) { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function notify(message: string) { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2200); }
  function selectFolder(path: string) { dispatch({ type: 'query', value: '' }); setPicker(false); navigate(folderPath(path)); }
  function selectSnippet(path: string, tab?: string) {
    dispatch({ type: 'tab', path, tab }); navigate(pagePath(path), { state: { listFolder: folder } });
  }
  const mobileView = query && (state.showResults || !selected) ? 'list' : pathname.startsWith('/snippet/') ? 'detail' : pathname.startsWith('/folder') ? 'list' : 'home';
  const cacheText = !pwa.online ? '离线模式' : pwa.cache === 'dev' ? '内容实时更新' : pwa.cache === 'ready' ? '全库可离线使用' : pwa.cache === 'error' ? '离线准备失败 · 重试' : '正在准备离线内容';
  const tree = data && <FolderTree root={data.library.folders} selected={folder} expanded={state.expanded} onExpand={path => dispatch({ type: 'expand', path })} onSelect={selectFolder} />;
  const unknown = (snippetPath !== undefined && !selected) || (pathname.startsWith('/folder') && data && !folders.has(folder)) || (!['/', '/folder'].includes(pathname) && !pathname.startsWith('/snippet/') && !pathname.startsWith('/folder/'));
  const searchField = <div className="global-search"><Search size={17} /><input ref={searchRef} aria-label="搜索代码片段" placeholder="搜索名称、标签或代码…" value={state.query} onChange={event => dispatch({ type: 'query', value: event.target.value })} />{state.query ? <button className="clear-search" aria-label="清空搜索" onClick={() => dispatch({ type: 'query', value: '' })}><X size={15} /></button> : <kbd>/</kbd>}</div>;
  return <div className={`app mobile-${mobileView}`}>
    {isMobile && <div className="mobile-controls">
        {mobileView !== 'home' && <button className="mobile-back icon-button" aria-label="返回" onClick={() => { if (mobileView === 'detail') navigate(folderPath(folder)); else { dispatch({ type: 'query', value: '' }); const parent = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : ''; navigate(folder ? folderPath(parent) : '/'); } }}><ArrowLeft size={20} /></button>}
        {searchField}
    </div>}
    {!data ? <main className="loading-state">{error ? <><WifiOff size={36} /><h1>暂时无法加载内容库</h1><p>{error}。请检查网络后重试。</p><button className="primary-button" onClick={retry}>重新加载</button></> : <><LoaderCircle className="spin" size={28} /><p>正在打开你的内容库…</p></>}</main> : <main className="app-body">
      <aside className="sidebar">
        <div className="sidebar-brand"><button className="brand" onClick={() => { dispatch({ type: 'query', value: '' }); navigate('/'); }}><span className="brand-mark"><Braces size={21} strokeWidth={2.2} /></span><span>Snippet Manager<small>YOUR PERSONAL CODE LIBRARY</small></span></button></div>
        <div className="sidebar-heading">内容库<span className="small-badge">{data.library.snippets.length}</span></div>
        {tree}
      </aside>
      <section className="snippet-panel" aria-label="片段列表">
        {!isMobile && <div className="list-search">{searchField}</div>}
        <div className={`list-header ${query ? 'search-mode' : 'folder-mode'}`}>
          {query && <><div className="list-eyebrow">SEARCH RESULTS</div><div className="list-title"><h2>搜索结果</h2><span>{visible.length}</span></div><p>匹配 “{query}”</p></>}
          <div className="folder-picker-row">
            <button className="folder-picker-button" aria-label={`选择文件夹：${folderLabel(folder)}`} title={folderLabel(folder)} aria-expanded={picker} aria-controls="folder-picker" onClick={() => setPicker(!picker)}><FolderIcon icon={folders.get(folder)?.icon} size={15} /><span>{folderLabel(folder)}</span><ChevronDown size={13} /></button>
            {!query && <span className="folder-list-count">{visible.length}</span>}
          </div>
          {picker && <div className="folder-picker" id="folder-picker">{tree}</div>}
        </div>
        <div className="snippet-list">
          <div className="mobile-subfolders">{!query && folders.get(folder)?.children.map(child => <button key={child.path} onClick={() => selectFolder(child.path)}><FolderIcon icon={child.icon} /><span>{child.name}</span><span>{child.count}</span><ChevronDown size={14} className="turn-left" /></button>)}</div>
          {!visible.length && <div className="list-empty">{query ? <SearchX size={27} /> : <FolderGlyph size={27} />}<h3>{query ? '没有找到匹配片段' : '这个目录还没有片段'}</h3><p>{query ? '试试更短的关键词，或清空搜索。' : '当前目录与子目录都没有有效 Snippet。'}</p></div>}
          {visible.map((snippet, index) => <button key={snippet.path} className={`snippet-item ${selected?.path === snippet.path ? 'active' : ''}`} onClick={() => selectSnippet(snippet.path, query ? results[index]?.tabId : undefined)}>
            <div className="snippet-folder"><FolderIcon icon={folders.get(snippet.folder)?.icon} size={12} /><span>{folderLabel(snippet.folder)}</span></div>
            <div className="snippet-item-title"><strong>{snippet.name}</strong>{selected?.path === snippet.path && <span className="selected-dot" />}</div>
            <p>{snippet.summary || '暂无说明'}</p>
            <div className="snippet-item-bottom"><span>{snippet.tags.slice(0, 3).map(tag => <span className="list-tag" key={tag}>{tag}</span>)}</span></div>
            {query && results[index]?.tabTitle && <div className="matched-tab"><Code2 size={11} />{results[index].tabTitle}</div>}
          </button>)}
        </div>
      </section>
      <section className="detail-panel">
        {selected ? <SnippetDetail snippet={selected} initialTab={state.tabPath === selected.path ? state.tab : undefined} notify={notify} /> : <div className="welcome">
          <div className="welcome-symbol"><Braces size={40} strokeWidth={1.5} /></div>
          <span className="welcome-eyebrow">A LITTLE LIBRARY. A LOT OF POSSIBILITIES.</span>
          <h1>{unknown ? '这个位置没有找到内容' : pathname === '/' ? '好代码，随手可得。' : `浏览 ${folders.get(folder)?.name || '内容库'}`}</h1>
          <p>{unknown ? '文件可能已经移动、删除，或因格式错误被跳过。' : '把常用写法放进 Markdown，\n下一次需要时，找到它、读懂它、一键复制。'}</p>
          <div className="welcome-stats"><div><FileCode2 size={18} /><strong>{data.library.snippets.length}</strong><span>代码片段</span></div><div><FolderGlyph size={18} /><strong>{folders.size - 1}</strong><span>文件夹</span></div><div><BookOpen size={18} /><strong>100%</strong><span>Markdown</span></div></div>
          <button className="primary-button" onClick={() => { if (unknown) selectFolder(''); else if (window.matchMedia('(max-width: 700px)').matches) selectFolder(folder); else searchRef.current?.focus(); }}>{unknown ? '返回内容库' : '开始查找'}<ArrowRight size={15} /></button>
          <div className="welcome-tip">按 <kbd>/</kbd> 开始搜索，或从文件夹浏览</div>
          <div className="welcome-features"><span><Search size={13} />全文搜索</span><span><Code2 size={13} />一键复制</span><span><WifiOff size={13} />离线可用</span></div>
        </div>}
      </section>
    </main>}
    <div className="mobile-cache">{!pwa.online ? <WifiOff size={12} /> : <span className="status-dot" />}{cacheText}{pwa.canInstall && <button onClick={() => void pwa.install()}>安装</button>}{pwa.cache === 'error' && <button onClick={pwa.retry}>重试</button>}</div>
    {pwa.updateReady && <div className="update-banner" role="status"><ArrowDownToLine size={16} /><span>新版本已完整准备好</span><button onClick={pwa.update}>刷新更新</button></div>}
    <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast && <><Check size={15} />{toast}</>}</div>
  </div>;
}
