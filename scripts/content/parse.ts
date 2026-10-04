import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { parse as parseYaml } from 'yaml';
import { codeToHtml, bundledLanguages } from 'shiki';
import { getLanguageIcon } from '../../src/core/language-icons.ts';
import type { Root, RootContent, Code } from 'mdast';
import type { Snippet, SubSnippet, Diagnostic } from '../../src/core/types.ts';

type Part = { sub: SubSnippet; nodes: RootContent[] };
type Retained = { order: number; nodes: RootContent[] };
type ResolveLink = (url: string, kind: 'link' | 'image') => string;
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

export function plainText(node: unknown): string {
  const value = node as { value?: string; alt?: string; children?: unknown[] };
  return value.value ?? value.alt ?? value.children?.map(plainText).join(' ') ?? '';
}

function previewText(node: unknown): string {
  const value = node as { type?: string; value?: string; alt?: string; children?: unknown[] };
  if (value.type === 'code') return '';
  return value.value ?? value.alt ?? value.children?.map(previewText).join(' ') ?? '';
}

async function render(nodes: RootContent[], resolve: ResolveLink): Promise<string> {
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
  return processor.stringify(await processor.run(tree));
}

async function highlighted(code: string, language: string): Promise<string> {
  const aliases: Record<string, string> = { shell: 'bash', sh: 'bash', js: 'javascript', ts: 'typescript', py: 'python', yml: 'yaml' };
  const lang = aliases[language.toLowerCase()] ?? language.toLowerCase();
  return codeToHtml(code, { lang: Object.hasOwn(bundledLanguages, lang) ? lang as keyof typeof bundledLanguages : 'text', theme: 'github-light' });
}

export function validateMetadata(raw: string): { body: string; name: string; tags: string[] } {
  const front = /^(?:\uFEFF)?---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw);
  if (!front) throw new Error('缺少有效 Front Matter（---）');
  let metadata: any;
  try { metadata = parseYaml(front[1], { uniqueKeys: true }); }
  catch (error) { throw new Error(`Front Matter 无法解析：${(error as Error).message.split('\n')[0]}`); }
  if (!metadata || typeof metadata.snippet_name !== 'string' || !metadata.snippet_name.trim()) throw new Error('snippet_name 必须是非空字符串');
  if (!Array.isArray(metadata.snippet_tags) || !metadata.snippet_tags.every((tag: unknown) => typeof tag === 'string')) throw new Error('snippet_tags 必须是字符串数组（允许 []）');
  return { body: raw.slice(front[0].length), name: metadata.snippet_name.trim(), tags: [...new Set<string>(metadata.snippet_tags)] };
}

export async function parseSnippet(raw: string, path: string, diagnostics: Diagnostic[] = [], resolve: ResolveLink = url => url): Promise<Snippet> {
  const { body, name, tags } = validateMetadata(raw);
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const definitions = tree.children.filter(node => node.type === 'definition');
  const renderNodes = (nodes: RootContent[]) => render([...nodes, ...definitions.filter(node => !nodes.includes(node))], resolve);
  const main: RootContent[] = [];
  const parts: Part[] = [];
  const retained: Retained[] = [];
  let section: { heading: RootContent; title: string; order: number; before: RootContent[]; part?: Part } | undefined;
  let untitled = 0;
  const source = (nodes: RootContent[]) => nodes.map(node => body.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0)).join('\n\n');
  const finish = () => {
    if (section && !section.part) retained.push({ order: section.order, nodes: [section.heading, ...section.before] });
  };
  for (const [order, node] of tree.children.entries()) {
    if (node.type === 'heading' && node.depth === 1) {
      finish();
      section = { heading: node, title: plainText(node).trim() || 'Untitled', order, before: [] };
    } else if (node.type === 'code' && /^ {0,3}(`{3,}|~{3,})/.test(body.slice(node.position?.start.offset ?? 0))) {
      const codeNode = node as Code;
      const named = section && !section.part;
      const title = named ? section!.title : (++untitled === 1 ? 'Untitled' : `Untitled ${untitled}`);
      const sub: SubSnippet = { id: `block-${parts.length + 1}`, title, sourceOrder: named ? section!.order : order, sourceDescription: '', language: codeNode.lang || 'text', code: codeNode.value, codeHtml: '' };
      const part: Part = { sub, nodes: named ? section!.before : [] };
      parts.push(part);
      if (section) section.part = part;
    } else if (!section) main.push(node);
    else if (section.part) section.part.nodes.push(node);
    else section.before.push(node);
  }
  finish();
  for (const part of parts) {
    part.sub.sourceDescription = source(part.nodes);
    part.sub.codeHtml = await highlighted(part.sub.code, part.sub.language);
  }
  if (parts.length) for (const item of retained) diagnostics.push({ level: 'warning', path, message: `一级标题“${plainText(item.nodes[0])}”没有关联代码块，已保留正文` });
  let descriptionHtml = '';
  if (!parts.length) descriptionHtml = await renderNodes(tree.children);
  else {
    descriptionHtml = await renderNodes(main);
    const rest = [
      ...retained.map(item => ({ order: item.order, retained: item.nodes, part: undefined as Part | undefined })),
      ...parts.map(part => ({ order: part.sub.sourceOrder, retained: undefined as RootContent[] | undefined, part })),
    ].sort((a, b) => a.order - b.order);
    for (const item of rest) {
      if (item.retained) descriptionHtml += await renderNodes(item.retained);
      else if (item.part) {
        const html = await renderNodes(item.part.nodes);
        if (parts.length === 1) descriptionHtml += html;
        else {
          const languageIcon = getLanguageIcon(item.part.sub.language);
          const logo = languageIcon
            ? `<svg width="16" height="16" viewBox="0 0 24 24" ${languageIcon.stroke ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' : 'fill="currentColor"'} data-language-icon="${languageIcon.slug}"><path d="${languageIcon.path}" /></svg>`
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-language-icon="fallback"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/><path d="m14 2-4 20"/></svg>';
          const icon = `<span class="sub-summary-icon" aria-hidden="true">${logo}</span>`;
          const name = `<button type="button" class="summary-tab" data-tab-id="${item.part.sub.id}">${icon}<span class="summary-tab-name">${escape(item.part.sub.title)}</span></button>`;
          const simple = item.part.nodes.length === 1 && item.part.nodes[0].type === 'paragraph';
          descriptionHtml += `<div class="sub-summary"><div class="sub-summary-body">${name}${simple ? `：${html.replace(/^<p>|<\/p>$/g, '')}` : html ? `<div class="sub-description">${html}</div>` : ''}</div></div>`;
        }
      }
    }
  }
  const allDescriptionNodes = tree.children.filter(node => !(node.type === 'code' && /^ {0,3}(`{3,}|~{3,})/.test(body.slice(node.position?.start.offset ?? 0))));
  const descriptionText = allDescriptionNodes.map(plainText).join('\n');
  const summaryText = main.map(previewText).join(' ').trim() || allDescriptionNodes.map(previewText).join(' ');
  return {
    path, folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', name, tags, raw,
    mainDescription: source(main), descriptionHtml, descriptionText, summary: summaryText.replace(/\s+/g, ' ').trim(), subSnippets: parts.map(part => part.sub),
  };
}
