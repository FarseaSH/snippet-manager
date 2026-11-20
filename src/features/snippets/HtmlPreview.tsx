import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import type { PreviewFile } from './html-project';
import type { CodeEditorHandle } from './CodeEditor';

export interface HtmlPreviewHandle extends CodeEditorHandle { rerun(): void }
interface Props { entry: PreviewFile; files: PreviewFile[]; onEscape(): void; onToggleFullscreen?(): void; onHeight?(height: number): void; standalone?: boolean; ref?: Ref<HtmlPreviewHandle> }

export function HtmlPreview({ entry, files, onEscape, onToggleFullscreen, onHeight, standalone = false, ref }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [rendered, setRendered] = useState<{ html: string; token: string }>();
  const [errors, setErrors] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const signature = useRef('');
  const previousRevision = useRef(revision);
  const position = useRef({ x: 0, y: 0 });
  const escape = useRef(onEscape);
  const height = useRef(onHeight);
  const fullscreen = useRef(onToggleFullscreen);
  useLayoutEffect(() => { escape.current = onEscape; height.current = onHeight; fullscreen.current = onToggleFullscreen; }, [onEscape, onHeight, onToggleFullscreen]);
  useEffect(() => {
    let cancelled = false;
    const immediate = !signature.current || previousRevision.current !== revision;
    previousRevision.current = revision;
    const timer = setTimeout(() => {
      Promise.all([import('./html-project'), import('./html-frame')]).then(async ([compiler, frame]) => {
        const project = await compiler.buildHtmlProject(entry, files);
        if (cancelled) return;
        const next = `${revision}:${JSON.stringify(project)}`;
        if (next === signature.current) return;
        signature.current = next;
        const token = crypto.randomUUID();
        position.current = { x: 0, y: 0 };
        setReady(false); setErrors([]);
        setRendered({ html: frame.htmlFrameDocument(project, token, standalone), token });
      }).catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        if (!cancelled) { signature.current = ''; setRendered(undefined); setErrors([standalone ? message.replace('找不到同组文件：', '独立 HTML 代码块仅支持内联内容或远程资源，无法加载本地资源：') : message]); }
      });
    }, immediate ? 0 : 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [entry, files, revision, standalone]);
  useLayoutEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.data?.channel !== 'snippet-html' || event.data.token !== rendered?.token) return;
      const data = event.data;
      if (data.type === 'ready') setReady(true);
      if (data.type === 'escape') escape.current();
      if (data.type === 'toggle-fullscreen') fullscreen.current?.();
      if (data.type === 'height' && Number.isFinite(data.height) && data.height > 0) height.current?.(Math.max(120, Math.min(480, data.height)));
      if (data.type === 'scroll' && Number.isFinite(data.x) && Number.isFinite(data.y)) position.current = { x: data.x, y: data.y };
      if (data.type === 'error' && typeof data.message === 'string') setErrors(previous => previous.includes(data.message) ? previous : [...previous, data.message].slice(0, 20));
    };
    addEventListener('message', message);
    return () => removeEventListener('message', message);
  }, [rendered?.token]);
  useImperativeHandle(ref, () => ({
    rerun() { setRevision(value => value + 1); },
    saveViewState() {
      const saved = { ...position.current };
      const token = rendered?.token;
      return () => iframe.current?.contentWindow?.postMessage({ type: 'restore-scroll', token, ...saved }, '*');
    },
  }), [rendered?.token]);
  return <div className="html-preview" role="region" aria-label="HTML 预览">
    {errors.length > 0 && <div className="html-preview-errors" role="alert">{errors.map(error => <p key={error}>{error}</p>)}</div>}
    {!rendered && !errors.length && <span className="html-preview-loading" role="status">正在准备预览…</span>}
    {rendered && <iframe ref={iframe} title={`${entry.title} HTML 预览`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={rendered.html} aria-busy={!ready} />}
  </div>;
}
