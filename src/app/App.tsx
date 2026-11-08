import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Braces, Check, Code2, FileText, Folder as FolderGlyph, LoaderCircle, Search, SearchX, Settings, WifiOff, X } from 'lucide-react';
import { useContent } from './useContent';
import { ResizablePanes } from './ResizablePanes';
import { usePwa } from '../pwa/usePwa';
import { FolderTree } from '../features/folders/FolderTree';
import { FolderIcon } from '../features/folders/FolderIcon';
import { SnippetDetail } from '../features/snippets/SnippetDetail';
import { belongsTo, compareNames, folderLabel, folderPath, pagePath, SETTINGS_PATH } from '../core/paths';
import { searchSnippets } from '../core/search';
import { readPreference, savePreference } from '../services/clipboard';
import type { Folder } from '../core/types';

interface NavigationState { query: string; expanded: Set<string>; tab?: string; tabPath?: string }
type Action = { type: 'query'; value: string } | { type: 'expand'; path: string } | { type: 'reveal'; path: string } | { type: 'tab'; path: string; tab?: string };
function reducer(state: NavigationState, action: Action): NavigationState {
  if (action.type === 'query') return { ...state, query: action.value };
  if (action.type === 'tab') return { ...state, tab: action.tab, tabPath: action.path };
  const expanded = new Set(state.expanded);
  if (action.type === 'expand') { if (expanded.has(action.path)) expanded.delete(action.path); else expanded.add(action.path); }
  else { const parts = action.path.split('/'); for (let index = 1; index <= parts.length; index++) expanded.add(parts.slice(0, index).join('/')); }
  return { ...state, expanded };
}

export function App() {
  const { data, error, retry } = useContent();
  const pwa = usePwa();
  const [state, dispatch] = useReducer(reducer, { query: '', expanded: new Set<string>() });
  const [toast, setToast] = useState('');
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 1100px)').matches);
  const searchRef = useRef<HTMLInputElement>(null);
  const drawerBackRef = useRef<HTMLButtonElement>(null);
  const drawerOpener = useRef<HTMLButtonElement | null>(null);
  const restoreDone = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const location = useLocation();
  const navigate = useNavigate();
  let pathname = location.pathname.replace(/\/$/, '') || '/';
  try { pathname = decodeURIComponent(pathname); } catch { pathname = '/invalid-url'; }
  const isSettings = pathname === SETTINGS_PATH;
  const snippetPath = pathname.startsWith('/snippet/') ? pathname.slice(9) : undefined;
  const drawerOpen = isNarrow && Boolean(data) && snippetPath !== undefined;
  const mobileDrawer = drawerOpen && isMobile;
  const listDepth = location.state?.listDepth as number | undefined;
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
    else document.title = isSettings ? '设置 · Snippet Manager' : 'Snippet Manager';
    dispatch({ type: 'reveal', path: folder });
  }, [selected?.path, selected?.name, folder, isSettings]);
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 700px)');
    const narrow = window.matchMedia('(max-width: 1100px)');
    const update = () => { setIsMobile(mobile.matches); setIsNarrow(narrow.matches); };
    mobile.addEventListener('change', update);
    narrow.addEventListener('change', update);
    return () => {
      mobile.removeEventListener('change', update);
      narrow.removeEventListener('change', update);
    };
  }, []);
  const closeDrawer = useCallback(() => {
    if (listDepth) navigate(-listDepth);
    else navigate(folderPath(folder), { replace: true });
  }, [folder, listDepth, navigate]);
  useLayoutEffect(() => {
    if (!drawerOpen) return;
    drawerBackRef.current?.focus({ preventScroll: true });
    return () => {
      // The underlying list stays mounted. Restore focus without moving its scroll position.
      const opener = drawerOpener.current;
      requestAnimationFrame(() => {
        if (drawerBackRef.current) return;
        const target = opener?.isConnected ? opener : searchRef.current;
        target?.focus({ preventScroll: true });
      });
    };
  }, [drawerOpen]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (drawerOpen) {
        if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); }
        return;
      }
      const target = event.target as HTMLElement;
      if (searchRef.current && event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !target.closest('input, textarea, [contenteditable="true"]')) { event.preventDefault(); searchRef.current.focus(); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [closeDrawer, drawerOpen]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function notify(message: string) { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2200); }
  function goHome() {
    restoreDone.current = true;
    dispatch({ type: 'query', value: '' });
    navigate('/');
  }
  function selectFolder(path: string) { dispatch({ type: 'query', value: '' }); navigate(folderPath(path)); }
  function openSnippet(route: string) {
    const depth = snippetPath === undefined ? 1 : listDepth && listDepth + 1;
    navigate(route, { state: { listFolder: folder, listDepth: depth } });
  }
  function selectSnippet(opener: HTMLButtonElement, path: string, tab?: string) {
    drawerOpener.current = opener;
    dispatch({ type: 'tab', path, tab });
    openSnippet(pagePath(path));
  }
  function followDrawerLink(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    const base = import.meta.env.BASE_URL;
    if (url.origin !== window.location.origin || !url.pathname.startsWith(`${base}snippet/`) || url.pathname === window.location.pathname) return;
    event.preventDefault();
    openSnippet(`/${url.pathname.slice(base.length)}${url.search}${url.hash}`);
  }
  const cacheText = !pwa.online ? '离线模式' : pwa.cache === 'dev' ? '内容实时更新' : pwa.cache === 'ready' ? '全库可离线使用' : pwa.cache === 'error' ? '离线准备失败 · 重试' : '正在准备离线内容';
  const treeProps = { selected: folder, expanded: state.expanded, onExpand: (path: string) => dispatch({ type: 'expand', path }), onSelect: selectFolder };
  const unknown = (snippetPath !== undefined && !selected) || (pathname.startsWith('/folder') && data && !folders.has(folder)) || (!['/', '/folder'].includes(pathname) && !pathname.startsWith('/snippet/') && !pathname.startsWith('/folder/'));
  const searchField = <div className="global-search"><Search size={17} /><input ref={searchRef} aria-label="搜索代码片段" placeholder="搜索名称、标签或代码…" value={state.query} onChange={event => dispatch({ type: 'query', value: event.target.value })} />{state.query ? <button className="clear-search" aria-label="清空搜索" onClick={() => dispatch({ type: 'query', value: '' })}><X size={15} /></button> : <kbd>/</kbd>}</div>;
  return <div className="app">
    <nav className="activity-bar" aria-label="活动栏" inert={mobileDrawer}>
      <button className="activity-button activity-home" type="button" title="返回首页" aria-label="首页" onClick={goHome}>
        <span className="activity-logo">
          <Braces size={24} aria-hidden="true">
            <path d="m14.5 7.5-5 9" stroke="#fb923c" />
          </Braces>
        </span>
      </button>
      <button className="activity-button" title="全部片段" aria-label="全部片段" onClick={() => selectFolder('')}>
        <FileText size={21} />
      </button>
      <button className="activity-button activity-settings" title="设置" aria-label="设置" onClick={() => navigate(SETTINGS_PATH)}>
        <Settings size={21} />
      </button>
    </nav>
    {isSettings ? <main className="settings-page" aria-label="设置" /> : !data ? <main className="loading-state">{error ? <><WifiOff size={36} /><h1>暂时无法加载内容库</h1><p>{error}。请检查网络后重试。</p><button className="primary-button" onClick={retry}>重新加载</button></> : <><LoaderCircle className="spin" size={28} /><p>正在打开你的内容库…</p></>}</main> : <ResizablePanes narrow={isNarrow} mobile={isMobile} drawerOpen={drawerOpen}
      sidebar={<aside id="folder-sidebar" className="sidebar" inert={drawerOpen}>
        <button className="sidebar-brand" type="button" title="返回首页" aria-label="Snippet Manager 首页" onClick={goHome}>
          Snippet Manager
        </button>
        <FolderTree root={data.library.folders} {...treeProps} />
      </aside>}
      list={<section id="snippet-list-panel" className="snippet-panel" aria-label="片段列表" inert={drawerOpen}>
        <div className="list-search">{searchField}</div>
        {query && <div className="list-header">
          <div className="list-eyebrow">SEARCH RESULTS</div><div className="list-title"><h2>搜索结果</h2><span>{visible.length}</span></div><p>匹配 “{query}”</p>
        </div>}
        <div className="snippet-list">
          {!visible.length && <div className="list-empty">{query ? <SearchX size={27} /> : <FolderGlyph size={27} />}<h3>{query ? '没有找到匹配片段' : '这个目录还没有片段'}</h3><p>{query ? '试试更短的关键词，或清空搜索。' : '当前目录与子目录都没有有效 Snippet。'}</p></div>}
          {visible.map((snippet, index) => <button key={snippet.path} className={`snippet-item ${selected?.path === snippet.path ? 'active' : ''}`} onClick={event => selectSnippet(event.currentTarget, snippet.path, query ? results[index]?.tabId : undefined)}>
            <div className="snippet-folder"><FolderIcon icon={folders.get(snippet.folder)?.icon} size={12} /><span>{folderLabel(snippet.folder)}</span></div>
            <div className="snippet-item-title"><strong>{snippet.name}</strong></div>
            <p>{snippet.summary || '暂无说明'}</p>
            <div className="snippet-item-bottom"><span>{snippet.tags.slice(0, 3).map(tag => <span className="list-tag" key={tag}>{tag}</span>)}</span></div>
            {query && results[index]?.tabTitle && <div className="matched-tab"><Code2 size={11} />{results[index].tabTitle}</div>}
          </button>)}
        </div>
      </section>}
      detail={<section className={`detail-region${drawerOpen ? ' detail-drawer' : ''}`} role={drawerOpen ? 'dialog' : undefined} aria-label={drawerOpen ? '片段详情' : undefined} aria-modal={mobileDrawer || undefined} onClick={drawerOpen ? followDrawerLink : undefined}>
        {drawerOpen && <div className="drawer-toolbar">
          <button type="button" ref={drawerBackRef} className="icon-button drawer-back" aria-label="返回" title="返回片段列表（Esc）" onClick={closeDrawer}><ArrowLeft size={20} /></button>
          {selected && <h1 className="drawer-title">{selected.name}</h1>}
        </div>}
        <div className="detail-panel">
          {selected ? <SnippetDetail snippet={selected} initialTab={state.tabPath === selected.path ? state.tab : undefined} showTitle={!drawerOpen} notify={notify} /> : <div className="folder-placeholder">
            <span className="brand-mark" aria-hidden="true"><Braces size={26} strokeWidth={2.2} /></span>
            {unknown ? <>
              <h1>这个位置没有找到内容</h1>
              <p>文件可能已经移动、删除，或因格式错误被跳过。</p>
              <button className="primary-button" onClick={() => selectFolder('')}>返回内容库<ArrowRight size={15} /></button>
            </> : <p>点击左侧列表中的代码片段，查看内容</p>}
          </div>}
        </div>
      </section>}
    />}
    {!isSettings && <div className="mobile-cache" inert={mobileDrawer}>{!pwa.online ? <WifiOff size={12} /> : <span className="status-dot" />}{cacheText}{pwa.canInstall && <button onClick={() => void pwa.install()}>安装</button>}{pwa.cache === 'error' && <button onClick={pwa.retry}>重试</button>}</div>}
    {pwa.updateReady && <div className="update-banner" role="status" inert={mobileDrawer}><ArrowDownToLine size={16} /><span>新版本已完整准备好</span><button onClick={pwa.update}>刷新更新</button></div>}
    <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast && <><Check size={15} />{toast}</>}</div>
  </div>;
}
