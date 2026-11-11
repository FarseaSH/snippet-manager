import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { createBundledHighlighter, createSingletonShorthands } from 'shiki/core';
import { bundledLanguages } from 'shiki/langs';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import tomorrowTheme from './tomorrow.json' with { type: 'json' };
import { getLanguageIcon } from './language-icons.ts';
import type { Root, RootContent } from 'mdast';
import type { Element, Root as HastRoot, RootContent as HastContent } from 'hast';
import type { SubSnippet, MarkdownPreviewData } from './types.ts';

type ResolveLink = (url: string, kind: 'link' | 'image') => string;
type ResolveTab = (title: string) => SubSnippet | undefined;

// Shiki normalizes theme rules in place. Keep Monaco's shared JSON untouched.
const highlightTheme = { ...structuredClone(tomorrowTheme), type: 'light' as const };

// Reuse the app's theme without shipping Shiki's unused theme collection.
const { codeToHtml, codeToHast } = createSingletonShorthands(createBundledHighlighter({
  langs: bundledLanguages, themes: {}, engine: () => createOnigurumaEngine(import('shiki/wasm')),
}));

function tabReference(sub: SubSnippet): Element {
  const icon = getLanguageIcon(sub.language);
  return {
    type: 'element', tagName: 'button', properties: { type: 'button', className: ['tab-reference'], dataTabId: sub.id },
    children: [
      { type: 'element', tagName: 'span', properties: { className: ['tab-reference-icon'], ariaHidden: 'true' }, children: [
        { type: 'element', tagName: 'svg', properties: {
          width: 16, height: 16, viewBox: '0 0 24 24', dataLanguageIcon: icon?.slug ?? 'fallback',
          fill: !icon || icon.stroke ? 'none' : icon.hex ? `#${icon.hex}` : 'currentColor',
          ...(!icon || icon.stroke ? { stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' } : {}),
        }, children: [{ type: 'element', tagName: 'path', properties: { d: icon?.path ?? 'm16 18 6-6-6-6M8 6l-6 6 6 6m6-16-4 20' }, children: [] }] },
      ] },
      { type: 'element', tagName: 'span', properties: { className: ['tab-reference-name'] }, children: [{ type: 'text', value: sub.title }] },
    ],
  };
}

export async function renderMarkdownNodes(nodes: RootContent[], resolve: ResolveLink, codeBlocks?: MarkdownPreviewData['codeBlocks'], resolveTab?: ResolveTab): Promise<string> {
  const tree = structuredClone({ type: 'root', children: nodes }) as Root;
  function visit(node: any) {
    if (node.type === 'html') node.type = 'text';
    if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
      node.url = resolve(node.url, node.type === 'image' ? 'image' : 'link');
    }
    node.children?.forEach(visit);
  }
  visit(tree);
  const processor = unified().use(remarkRehype).use(rehypeSanitize).use(rehypeStringify);
  const result = await processor.run(tree);
  // Only transform description inline code. Links and code examples keep their original behavior.
  if (resolveTab) {
    function references(parent: HastRoot | Element) {
      parent.children.forEach((child, index) => {
        if (child.type !== 'element' || ['a', 'pre'].includes(child.tagName)) return;
        if (child.tagName === 'code') {
          const value = child.children.map(node => node.type === 'text' ? node.value : '').join('');
          if (value.startsWith(':@')) {
            const sub = resolveTab!(value.slice(2).trim());
            if (sub) parent.children[index] = tabReference(sub);
          }
        } else references(child);
      });
    }
    references(result);
  }
  if (codeBlocks) {
    const blocks = codeBlocks;
    let index = 0;
    async function highlightBlocks(parent: HastRoot | Element) {
      for (let childIndex = 0; childIndex < parent.children.length; childIndex++) {
        const child = parent.children[childIndex];
        if (child.type !== 'element') continue;
        if (child.tagName === 'pre' && child.children[0]?.type === 'element' && child.children[0].tagName === 'code') {
          const blockIndex = index++;
          const block = blocks[blockIndex];
          const highlighted = await codeToHast(block.code, highlightOptions(block.language));
          const icon = getLanguageIcon(block.language);
          parent.children[childIndex] = {
            type: 'element', tagName: 'div', properties: { className: ['preview-code-block'] },
            children: [
              { type: 'element', tagName: 'div', properties: { className: ['preview-code-header'] }, children: [
                { type: 'element', tagName: 'svg', properties: {
                  className: ['preview-code-icon'], width: 14, height: 14, viewBox: '0 0 24 24', ariaHidden: 'true', focusable: 'false', dataLanguageIcon: icon?.slug ?? 'fallback',
                  fill: !icon || icon.stroke ? 'none' : icon.hex ? `#${icon.hex}` : 'currentColor',
                  ...(!icon || icon.stroke ? { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } : {}),
                }, children: [{ type: 'element', tagName: 'path', properties: { d: icon?.path ?? 'm16 18 6-6-6-6M8 6l-6 6 6 6m6-16-4 20' }, children: [] }] },
                { type: 'element', tagName: 'span', properties: { className: ['preview-code-language'] }, children: [{ type: 'text', value: block.language === 'text' ? 'Plain Text' : block.language }] },
              ] },
              {
                type: 'element', tagName: 'button', properties: { type: 'button', className: ['preview-copy'], dataPreviewCopy: String(blockIndex), ariaLabel: `复制代码块 ${blockIndex + 1}`, title: '复制代码' },
                children: [
                  { type: 'element', tagName: 'svg', properties: { className: ['preview-copy-icon'], width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ariaHidden: 'true' }, children: [
                    { type: 'element', tagName: 'rect', properties: { x: 9, y: 9, width: 13, height: 13, rx: 2 }, children: [] },
                    { type: 'element', tagName: 'path', properties: { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }, children: [] },
                  ] },
                  { type: 'element', tagName: 'svg', properties: { className: ['preview-copy-check'], width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ariaHidden: 'true' }, children: [
                    { type: 'element', tagName: 'path', properties: { d: 'm20 6-11 11-5-5' }, children: [] },
                  ] },
                ],
              },
              { type: 'element', tagName: 'div', properties: { className: ['preview-code-body'] }, children: [
                { type: 'element', tagName: 'div', properties: { className: ['preview-line-numbers'], ariaHidden: 'true' }, children: block.code.split('\n').map((_, lineIndex) => ({
                  type: 'element', tagName: 'span', properties: {}, children: [{ type: 'text', value: String(lineIndex + 1) }],
                })) },
                ...highlighted.children as HastContent[],
              ] },
            ],
          } as Element;
        } else await highlightBlocks(child);
      }
    }
    await highlightBlocks(result);
  }
  return processor.stringify(result);
}

function highlightOptions(language: string) {
  const aliases: Record<string, string> = { shell: 'bash', sh: 'bash', js: 'javascript', ts: 'typescript', py: 'python', yml: 'yaml', md: 'markdown' };
  const lang = aliases[language.trim().toLowerCase()] ?? language.trim().toLowerCase();
  return { lang: Object.hasOwn(bundledLanguages, lang) ? lang as keyof typeof bundledLanguages : 'text', theme: highlightTheme };
}

export async function highlightedCode(code: string, language: string): Promise<string> {
  return codeToHtml(code, highlightOptions(language));
}

export async function renderMarkdownPreview(code: string, resolve: ResolveLink = url => url): Promise<MarkdownPreviewData> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(code) as Root;
  const codeBlocks: MarkdownPreviewData['codeBlocks'] = [];
  function collect(node: Root | RootContent) {
    if (node.type === 'code') codeBlocks.push({ code: node.value, language: node.lang || 'text' });
    if ('children' in node) node.children.forEach(child => collect(child as RootContent));
  }
  collect(tree);
  const urls: Record<string, string> = {};
  const html = await renderMarkdownNodes(tree.children, (url, kind) => {
    const resolved = resolve(url, kind);
    if (url !== resolved) urls[`${kind}:${url}`] = resolved;
    return resolved;
  }, codeBlocks);
  return { html, codeBlocks, ...(Object.keys(urls).length ? { urls } : {}) };
}
