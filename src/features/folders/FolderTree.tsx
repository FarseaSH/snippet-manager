import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight, Library } from 'snippet-manager/icons/ui';
import type { Folder } from '../../core/types';
import { FolderIcon } from './FolderIcon';
import { useScrollActivity } from '../../hooks/useScrollActivity';

interface Props { root: Folder; selected: string; expanded: Set<string>; onExpand(path: string): void; onExpandAll(paths: string[]): void; onSelect(path: string, collapse?: boolean): void }

type FolderItemProps = Pick<Props, 'selected' | 'expanded' | 'onExpand' | 'onSelect'> & { folder: Folder; depth: number };

function FolderItem({ folder, depth, selected, expanded, onExpand, onSelect }: FolderItemProps) {
  const open = expanded.has(folder.path);
  const hideCount = open && folder.children.length > 0;
  const [retainChildren, setRetainChildren] = useState(open);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const childrenRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open && childrenRef.current?.contains(document.activeElement)) toggleRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (open) { setRetainChildren(true); return; }
    if (!retainChildren) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setRetainChildren(false); return; }
    // Also clean up if the transition is suppressed or its end event is missed.
    const timer = setTimeout(() => setRetainChildren(false), 300);
    return () => clearTimeout(timer);
  }, [open, retainChildren]);

  return <li>
    <div className={`folder-row ${selected === folder.path ? 'selected' : ''}`} data-folder-path={folder.path} style={{ paddingInlineStart: `min(calc(6px + ${depth} * var(--folder-indent, 16px)), 32%)` }}>
      {folder.children.length ? <button ref={toggleRef} type="button" className="tree-toggle" aria-label={`${open ? '收起' : '展开'} ${folder.name}`} aria-expanded={open} onClick={() => onExpand(folder.path)}><ChevronRight size={13} aria-hidden="true" /></button> : <span className="tree-spacer" />}
      <button className="folder-select" title={folder.name} onClick={() => onSelect(folder.path, Boolean(folder.children.length && open))} aria-current={selected === folder.path ? 'page' : undefined}>
        <FolderIcon icon={folder.icon} /><span>{folder.name}</span><span className={`folder-count${hideCount ? ' is-hidden' : ''}`} aria-hidden={hideCount || undefined}>{folder.count}</span>
      </button>
    </div>
    {folder.children.length > 0 && <div ref={childrenRef} className={`folder-children${open ? ' is-open' : ''}`} inert={!open} aria-hidden={!open} onTransitionEnd={event => {
      if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows' && !open) setRetainChildren(false);
    }}>
      <ul className="folder-children-list">{(open || retainChildren) && folder.children.map(child => <FolderItem key={child.path} folder={child} depth={depth + 1} selected={selected} expanded={expanded} onExpand={onExpand} onSelect={onSelect} />)}</ul>
    </div>}
  </li>;
}

export function FolderTree({ root, selected, expanded, onExpand, onExpandAll, onSelect }: Props) {
  const [scrolling, handleScroll] = useScrollActivity();
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    // Let the initial route reveal its directories before enabling transitions.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setAnimate(true)); });
    return () => cancelAnimationFrame(frame);
  }, []);
  const parents: string[] = [];
  function collect(folder: Folder) {
    if (folder.children.length) { if (folder.path) parents.push(folder.path); folder.children.forEach(collect); }
  }
  collect(root);
  // A closed root hides its descendants even if their individual flags remain set.
  const anyOpen = root.children.some(folder => folder.children.length && expanded.has(folder.path));
  const actionLabel = anyOpen ? '全部折叠' : '全部展开';
  return <nav aria-label="文件夹导航" className={`folder-tree${animate ? ' is-ready' : ''}`}>
    <div className="folder-tree-fixed">
      <div className="sidebar-label">个人收藏</div>
      <button className={`all-folder ${selected === '' ? 'selected' : ''}`} aria-current={selected === '' ? 'page' : undefined} onClick={() => onSelect('')}><Library size={17} /><span>全部片段</span><span className="folder-count">{root.count}</span></button>
      <div className="folder-tree-heading"><span className="sidebar-label">文件夹</span><button type="button" className="folder-tree-toggle-all" disabled={!parents.length} aria-label={actionLabel} title={actionLabel} onClick={() => onExpandAll(anyOpen ? [] : parents)}>
        <svg className={`folder-tree-toggle-icon${anyOpen ? ' is-open' : ''}`} width="14" height="20" viewBox="0 0 24 34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path className="toggle-arrow-top" d={anyOpen ? 'M6 9 L12 15 L18 9' : 'M6 15 L12 9 L18 15'} />
          <path className="toggle-arrow-bottom" d={anyOpen ? 'M6 25 L12 19 L18 25' : 'M6 19 L12 25 L18 19'} />
        </svg>
      </button></div>
    </div>
    <div className={`folder-tree-scroll${scrolling ? ' is-scrolling' : ''}`} onScroll={handleScroll}>
      <ul>{root.children.map(folder => <FolderItem key={folder.path} folder={folder} depth={0} selected={selected} expanded={expanded} onExpand={onExpand} onSelect={onSelect} />)}</ul>
      {!root.count && <p className="folder-help">在 snippets/ 中添加 Markdown，即可建立你的内容库。</p>}
    </div>
  </nav>;
}
