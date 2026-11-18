import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Eye, Maximize2, Minimize2, RotateCcw } from 'snippet-manager/icons/ui';
import { LanguageIcon } from './LanguageIcon';
import { HtmlPreview, type HtmlPreviewHandle } from './HtmlPreview';

const noFiles: [] = [];
interface Props { index: number; code: string; language: string; sourceHtml: string }

export function HtmlCodeBlock({ index, code, language, sourceHtml }: Props) {
  const [preview, setPreview] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [height, setHeight] = useState(160);
  const dialog = useRef<HTMLDialogElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const runtime = useRef<HtmlPreviewHandle>(null);
  const entry = useMemo(() => ({ id: `markdown-html-${index}`, title: `代码块 ${index + 1}`, language, code }), [index, code, language]);

  function restore() {
    if (!dialog.current?.matches(':modal')) return;
    dialog.current.close();
    dialog.current.setAttribute('open', '');
    setFullscreen(false);
    expandButton.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!fullscreen) return;
    // Escape in the host document closes this dialog before an outer expanded editor.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation(); restore();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [fullscreen]);

  return <dialog ref={dialog} open className={`html-code-dialog ${fullscreen ? 'is-fullscreen' : ''}`} role={fullscreen ? 'dialog' : 'group'} aria-modal={fullscreen || undefined} aria-label={`HTML 代码块 ${index + 1}`} onCancel={event => { event.preventDefault(); restore(); }}>
    <div className="preview-code-header html-block-header">
      <LanguageIcon language={language} size={14} />
      <span className="preview-code-language">{language}</span>
      <button ref={previewButton} type="button" className="html-block-preview-toggle" aria-pressed={preview} title={preview ? '关闭预览，查看代码' : '开启预览'} onClick={() => {
        if (preview && fullscreen) { restore(); previewButton.current?.focus({ preventScroll: true }); }
        setPreview(value => !value);
      }}><Eye size={13} />预览</button>
      <div className="html-block-actions">
        {preview && <button type="button" title="重新运行" aria-label={`重新运行代码块 ${index + 1}`} onClick={() => runtime.current?.rerun()}><RotateCcw size={14} /></button>}
        {preview && <button ref={expandButton} type="button" title={fullscreen ? '退出全屏（Esc）' : '全屏'} aria-label={fullscreen ? `退出代码块 ${index + 1} 全屏` : `全屏代码块 ${index + 1}`} aria-pressed={fullscreen} onClick={() => {
          if (fullscreen) restore();
          else if (dialog.current) { dialog.current.close(); dialog.current.showModal(); setFullscreen(true); }
        }}>{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>}
        <button type="button" className="preview-copy" data-preview-copy={index} aria-label={`复制代码块 ${index + 1}`} title="复制代码"><Copy size={14} className="preview-copy-icon" /><Check size={14} className="preview-copy-check" /></button>
      </div>
    </div>
    <div className="preview-code-body html-block-source" hidden={preview} dangerouslySetInnerHTML={{ __html: sourceHtml }} />
    <div className="html-block-preview" hidden={!preview} style={{ height }}>
      <HtmlPreview ref={runtime} entry={entry} files={noFiles} standalone onHeight={setHeight} onEscape={restore} />
    </div>
  </dialog>;
}
