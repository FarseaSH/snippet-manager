import { renderMarkdownNodes, highlightedCode, renderMarkdownPreview } from '../../src/core/code-rendering.ts';
import { parsePlaceholders } from '../../src/core/placeholders.ts';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { parse as parseYaml } from 'yaml';
import type { Root, RootContent, Code } from 'mdast';
import type { Snippet, SubSnippet, Diagnostic, TransformConfig } from '../../src/core/types.ts';

type Part = { sub: SubSnippet; nodes: RootContent[] };
type Retained = { order: number; nodes: RootContent[] };
type ResolveLink = (url: string, kind: 'link' | 'image') => string;
type ResolveTab = (title: string) => SubSnippet | undefined;

export function plainText(node: unknown): string {
  const value = node as { value?: string; alt?: string; children?: unknown[] };
  return value.value ?? value.alt ?? value.children?.map(plainText).join(' ') ?? '';
}

function previewText(node: unknown): string {
  const value = node as { type?: string; value?: string; alt?: string; children?: unknown[] };
  if (value.type === 'code') return '';
  return value.value ?? value.alt ?? value.children?.map(previewText).join(' ') ?? '';
}

export function validateMetadata(raw: string): { body: string; name: string; tags: string[]; type: 'code' | 'transform'; transform?: TransformConfig } {
  const front = /^(?:\uFEFF)?---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw);
  if (!front) throw new Error('缺少有效 Front Matter（---）');
  let metadata: any;
  try { metadata = parseYaml(front[1], { uniqueKeys: true }); }
  catch (error) { throw new Error(`Front Matter 无法解析：${(error as Error).message.split('\n')[0]}`); }
  if (!metadata || typeof metadata.snippet_name !== 'string' || !metadata.snippet_name.trim()) throw new Error('snippet_name 必须是非空字符串');
  if (!Array.isArray(metadata.snippet_tags) || !metadata.snippet_tags.every((tag: unknown) => typeof tag === 'string')) throw new Error('snippet_tags 必须是字符串数组（允许 []）');
  const type = metadata.snippet_type === undefined ? 'code' : metadata.snippet_type;
  if (type !== 'code' && type !== 'transform') throw new Error('snippet_type 仅支持 code 或 transform');
  let transform: TransformConfig | undefined;
  if (type === 'transform') {
    const config = metadata.transform === undefined ? {} : metadata.transform;
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('transform 必须是配置对象');
    for (const key of ['input_language', 'output_language', 'example']) {
      if (config[key] !== undefined && typeof config[key] !== 'string') throw new Error(`transform.${key} 必须是字符串`);
    }
    transform = { inputLanguage: config.input_language?.trim() || 'text', outputLanguage: config.output_language?.trim() || 'text', ...(config.example !== undefined ? { example: config.example } : {}) };
  }
  return { body: raw.slice(front[0].length), name: metadata.snippet_name.trim(), tags: [...new Set<string>(metadata.snippet_tags)], type, transform };
}

export async function parseSnippet(raw: string, path: string, diagnostics: Diagnostic[] = [], resolve: ResolveLink = url => url): Promise<Snippet> {
  const { body, name, tags, type, transform } = validateMetadata(raw);
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  if (type === 'transform') {
    const blocks = tree.children.filter((node): node is Code => node.type === 'code' && /^ {0,3}(`{3,}|~{3,})/.test(body.slice(node.position?.start.offset ?? 0)));
    if (blocks.length !== 1 || !['js', 'javascript'].includes(blocks[0].lang?.toLowerCase() || '')) throw new Error('转换 Snippet 必须包含且仅包含一个顶层 js 或 javascript 围栏代码块');
    const block = blocks[0];
    const sub: SubSnippet = { id: 'transform-code', title: '转换代码', sourceOrder: 0, sourceDescription: '', descriptionHtml: '', language: 'javascript', code: block.value, codeHtml: await highlightedCode(block.value, 'javascript') };
    const operation: SubSnippet = { ...sub, id: 'transform', title: '转换', language: 'text', code: '', codeHtml: '' };
    const nodes = tree.children.filter(node => node !== block && !(node.type === 'heading' && node.depth === 1 && plainText(node).trim() === '转换代码'));
    const reported = new Set<string>();
    const descriptionHtml = await renderMarkdownNodes(nodes, resolve, undefined, title => {
      const target = [operation, sub].find(item => item.title === title);
      if (!target && !reported.has(title)) { diagnostics.push({ level: 'warning', path, message: `Tab 引用“${title}”没有匹配目标，已保留原文` }); reported.add(title); }
      return target;
    });
    const descriptionText = nodes.map(plainText).join('\n');
    return { type, transform, path, folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', name, tags, raw, mainDescription: nodes.map(node => body.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0)).join('\n\n'), descriptionHtml, descriptionText, summary: nodes.map(previewText).join(' ').replace(/\s+/g, ' ').trim(), subSnippets: [sub] };
  }
  const definitions = tree.children.filter(node => node.type === 'definition');
  const tabsByTitle = new Map<string, SubSnippet[]>();
  const reportedReferences = new Set<string>();
  const resolveTab: ResolveTab = title => {
    const matches = tabsByTitle.get(title) ?? [];
    if (matches.length === 1) return matches[0];
    if (!reportedReferences.has(title)) {
      diagnostics.push({ level: 'warning', path, message: matches.length ? `Tab 引用“${title}”有多个同名目标，已保留原文` : `Tab 引用“${title}”没有匹配目标，已保留原文` });
      reportedReferences.add(title);
    }
  };
  const renderNodes = (nodes: RootContent[]) => renderMarkdownNodes([...nodes, ...definitions.filter(node => !nodes.includes(node))], resolve, undefined, resolveTab);
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
      const sub: SubSnippet = { id: `block-${parts.length + 1}`, title, sourceOrder: named ? section!.order : order, sourceDescription: '', descriptionHtml: '', language: codeNode.lang || 'text', code: codeNode.value, codeHtml: '' };
      const part: Part = { sub, nodes: named ? section!.before : [] };
      parts.push(part);
      if (section) section.part = part;
    } else if (!section) main.push(node);
    else if (section.part) section.part.nodes.push(node);
    else section.before.push(node);
  }
  finish();
  for (const { sub } of parts) tabsByTitle.set(sub.title, [...(tabsByTitle.get(sub.title) ?? []), sub]);
  for (const part of parts) {
    for (const issue of parsePlaceholders(part.sub.code).issues) diagnostics.push({ level: 'warning', path, message: `${part.sub.title}：${issue}` });
    part.sub.sourceDescription = source(part.nodes);
    part.sub.descriptionHtml = await renderNodes(part.nodes);
    part.sub.codeHtml = await highlightedCode(part.sub.code, part.sub.language);
    if (['md', 'markdown'].includes(part.sub.language.trim().toLowerCase())) part.sub.markdownPreview = await renderMarkdownPreview(part.sub.code, resolve);
  }
  if (parts.length) for (const item of retained) diagnostics.push({ level: 'warning', path, message: `一级标题“${plainText(item.nodes[0])}”没有关联代码块，已保留正文` });
  let descriptionHtml = '';
  if (!parts.length) descriptionHtml = await renderNodes(tree.children);
  else {
    descriptionHtml = await renderNodes(main);
    for (const item of retained) descriptionHtml += await renderNodes(item.nodes);
  }
  const allDescriptionNodes = tree.children.filter(node => !(node.type === 'code' && /^ {0,3}(`{3,}|~{3,})/.test(body.slice(node.position?.start.offset ?? 0))));
  const descriptionText = allDescriptionNodes.map(plainText).join('\n');
  const summaryText = main.map(previewText).join(' ').trim() || allDescriptionNodes.map(previewText).join(' ');
  return {
    path, folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', name, tags, raw,
    mainDescription: source(main), descriptionHtml, descriptionText, summary: summaryText.replace(/\s+/g, ' ').trim(), subSnippets: parts.map(part => part.sub),
  };
}
