import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { InlineCodeCopy } from './InlineCodeCopy';

interface Props { snippetPath: string; html: string; selectTab(id: string): void; descriptionKey?: string; className?: string; label?: string }

export function SnippetDescription({ snippetPath, html, selectTab, descriptionKey = 'main', className = '', label = '说明' }: Props) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const expanded = expandedKeys.has(descriptionKey);
  function setExpanded(value: boolean) {
    setExpandedKeys(current => {
      const next = new Set(current);
      if (value) next.add(descriptionKey);
      else next.delete(descriptionKey);
      return next;
    });
  }
  const [overflows, setOverflows] = useState(false);
  const frameRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  useLayoutEffect(() => { setExpandedKeys(new Set()); }, [snippetPath]);
  useLayoutEffect(() => { if (frameRef.current) frameRef.current.scrollTop = 0; }, [snippetPath, descriptionKey]);
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

  return <section ref={frameRef} hidden={!html} className={`description ${className} ${overflows ? 'can-toggle' : ''} ${overflows && expanded ? 'is-expanded' : ''}`} aria-label={label} onClick={event => {
    if (!overflows || expanded || (event.target as HTMLElement).closest('a, button, input, textarea, select, summary, [data-tab-id]')) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.anchorNode && event.currentTarget.contains(selection.anchorNode)) return;
    setExpanded(true);
  }}>
    <div id={contentId} ref={viewportRef} className={`description-content ${overflows && !expanded ? 'collapsed' : ''}`} onFocusCapture={event => {
      // Keyboard navigation reveals links or summary buttons beyond the preview.
      if (!expanded && overflows && event.target.getBoundingClientRect().bottom > viewportRef.current!.getBoundingClientRect().bottom) setExpanded(true);
    }}>
      <InlineCodeCopy resetKey={`${snippetPath}:${descriptionKey}`}><div ref={contentRef} className="markdown" onClick={event => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tab-id]');
        if (button?.dataset.tabId) selectTab(button.dataset.tabId);
      }} dangerouslySetInnerHTML={{ __html: html }} /></InlineCodeCopy>
    </div>
    {overflows && !expanded && <div className="description-overflow-hint" aria-hidden="true"><ChevronDown className="description-overflow-arrow" size={16} /></div>}
    {overflows && <div className={expanded ? 'description-footer' : undefined}>
      <button type="button" className={`description-disclosure ${expanded ? 'description-collapse' : ''}`} aria-label={expanded ? '收起说明' : '展开说明'} aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>
        {expanded && <><ChevronUp className="description-collapse-arrow" size={16} aria-hidden="true" /><span>收起</span></>}
      </button>
    </div>}
  </section>;
}
