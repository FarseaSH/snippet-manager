import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props { snippetPath: string; html: string; selectTab(id: string): void }

export function SnippetDescription({ snippetPath, html, selectTab }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  useLayoutEffect(() => { setExpanded(false); }, [snippetPath]);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const measure = () => {
      const previewHeight = Number.parseFloat(getComputedStyle(viewport).lineHeight) * 5;
      setOverflows(content.getBoundingClientRect().height > previewHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [html]);

  return <section className={`description ${overflows ? 'can-toggle' : ''} ${overflows && expanded ? 'is-expanded' : ''}`} aria-label="说明" onClick={event => {
    if (!overflows || (event.target as HTMLElement).closest('a, button, input, textarea, select, summary, [data-tab-id]')) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.anchorNode && event.currentTarget.contains(selection.anchorNode)) return;
    setExpanded(value => !value);
  }}>
    {overflows && <button className="description-disclosure" aria-label={expanded ? '收起说明' : '展开说明'} aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)} />}
    <div id={contentId} ref={viewportRef} className={`description-content ${overflows && !expanded ? 'collapsed' : ''}`} onFocusCapture={event => {
      // Keyboard navigation reveals links or summary buttons beyond the preview.
      if (!expanded && overflows && event.target.getBoundingClientRect().bottom > viewportRef.current!.getBoundingClientRect().bottom) setExpanded(true);
    }}>
      <div ref={contentRef} className="markdown" onClick={event => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tab-id]');
        if (button?.dataset.tabId) selectTab(button.dataset.tabId);
      }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
    {overflows && !expanded && <div className="description-overflow-hint" aria-hidden="true"><ChevronDown className="description-overflow-arrow" size={16} /></div>}
    {overflows && expanded && <ChevronUp className="description-overflow-arrow description-collapse-arrow" size={16} aria-hidden="true" />}
  </section>;
}
