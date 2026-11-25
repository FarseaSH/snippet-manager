import { ChevronDown, ChevronRight, ChevronUp, Library } from 'snippet-manager/icons/ui';
import type { Folder } from '../../core/types';
import { FolderIcon } from './FolderIcon';
import { useScrollActivity } from '../../hooks/useScrollActivity';

interface Props { root: Folder; selected: string; expanded: Set<string>; onExpand(path: string): void; onExpandAll(paths: string[]): void; onSelect(path: string): void }

export function FolderTree({ root, selected, expanded, onExpand, onExpandAll, onSelect }: Props) {
  const [scrolling, handleScroll] = useScrollActivity();
  const parents: string[] = [];
  function collect(folder: Folder) {
    if (folder.children.length) { if (folder.path) parents.push(folder.path); folder.children.forEach(collect); }
  }
  collect(root);
  // A closed root hides its descendants even if their individual flags remain set.
  const anyOpen = root.children.some(folder => folder.children.length && expanded.has(folder.path));
  const actionLabel = anyOpen ? '全部折叠' : '全部展开';
  function row(folder: Folder, depth: number) {
    const open = expanded.has(folder.path);
    return <li key={folder.path}>
      <div className={`folder-row ${selected === folder.path ? 'selected' : ''}`} data-folder-path={folder.path} style={{ paddingInlineStart: `min(calc(6px + ${depth} * var(--folder-indent, 16px)), 32%)` }}>
        {folder.children.length ? <button className="tree-toggle" aria-label={`${open ? '收起' : '展开'} ${folder.name}`} aria-expanded={open} onClick={() => onExpand(folder.path)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="tree-spacer" />}
        <button className="folder-select" title={folder.name} onClick={() => onSelect(folder.path)} aria-current={selected === folder.path ? 'page' : undefined}>
          <FolderIcon icon={folder.icon} /><span>{folder.name}</span><span className="folder-count">{folder.count}</span>
        </button>
      </div>
      {open && folder.children.length > 0 && <ul>{folder.children.map(child => row(child, depth + 1))}</ul>}
    </li>;
  }
  return <nav aria-label="文件夹导航" className="folder-tree">
    <div className="folder-tree-fixed">
      <div className="sidebar-label">个人收藏</div>
      <button className={`all-folder ${selected === '' ? 'selected' : ''}`} aria-current={selected === '' ? 'page' : undefined} onClick={() => onSelect('')}><Library size={17} /><span>全部片段</span><span className="folder-count">{root.count}</span></button>
      <div className="folder-tree-heading"><span className="sidebar-label">文件夹</span><button type="button" className="folder-tree-toggle-all" disabled={!parents.length} aria-label={actionLabel} title={actionLabel} onClick={() => onExpandAll(anyOpen ? [] : parents)}><span className="folder-tree-toggle-icon" aria-hidden="true">{anyOpen ? <><ChevronDown size={14} /><ChevronUp size={14} /></> : <><ChevronUp size={14} /><ChevronDown size={14} /></>}</span></button></div>
    </div>
    <div className={`folder-tree-scroll${scrolling ? ' is-scrolling' : ''}`} onScroll={handleScroll}>
      <ul>{root.children.map(folder => row(folder, 0))}</ul>
      {!root.count && <p className="folder-help">在 snippets/ 中添加 Markdown，即可建立你的内容库。</p>}
    </div>
  </nav>;
}
