import { ChevronDown, ChevronRight, Library } from 'lucide-react';
import type { Folder } from '../../core/types';
import { FolderIcon } from './FolderIcon';

interface Props { root: Folder; selected: string; expanded: Set<string>; onExpand(path: string): void; onSelect(path: string): void }

export function FolderTree({ root, selected, expanded, onExpand, onSelect }: Props) {
  function row(folder: Folder, depth: number) {
    const open = expanded.has(folder.path);
    return <li key={folder.path}>
      <div className={`folder-row ${selected === folder.path ? 'selected' : ''}`} data-folder-path={folder.path} style={{ paddingLeft: 10 + depth * 16 }}>
        {folder.children.length ? <button className="tree-toggle" aria-label={`${open ? '收起' : '展开'} ${folder.name}`} aria-expanded={open} onClick={() => onExpand(folder.path)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="tree-spacer" />}
        <button className="folder-select" onClick={() => onSelect(folder.path)} aria-current={selected === folder.path ? 'page' : undefined}>
          <FolderIcon icon={folder.icon} /><span>{folder.name}</span><span className="folder-count">{folder.count}</span>
        </button>
      </div>
      {open && folder.children.length > 0 && <ul>{folder.children.map(child => row(child, depth + 1))}</ul>}
    </li>;
  }
  return <nav aria-label="文件夹导航" className="folder-tree">
    <button className={`all-folder ${selected === '' ? 'selected' : ''}`} aria-current={selected === '' ? 'page' : undefined} onClick={() => onSelect('')}><Library size={17} /><span>全部片段</span><span className="folder-count">{root.count}</span></button>
    <div className="sidebar-label">文件夹 <span>{root.children.length}</span></div>
    <ul>{root.children.map(folder => row(folder, 0))}</ul>
    {!root.count && <p className="folder-help">在 snippets/ 中添加 Markdown，即可建立你的内容库。</p>}
  </nav>;
}
