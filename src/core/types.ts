export interface MarkdownPreviewData {
  html: string;
  codeBlocks: { code: string; language: string }[];
  urls?: Record<string, string>;
}

export interface SubSnippet {
  id: string;
  title: string;
  sourceOrder: number;
  sourceDescription: string;
  descriptionHtml: string;
  language: string;
  code: string;
  codeHtml: string;
  markdownPreview?: MarkdownPreviewData;
}

export interface Snippet {
  type?: 'code' | 'transform';
  transform?: TransformConfig;
  path: string;
  folder: string;
  name: string;
  tags: string[];
  raw: string;
  mainDescription: string;
  descriptionHtml: string;
  descriptionText: string;
  summary: string;
  subSnippets: SubSnippet[];
}

export interface TransformConfig {
  inputLanguage: string;
  outputLanguage: string;
  example?: string;
}

export type TransformResult = { ok: true; output: string } | { ok: false; error: { message: string } };

export interface Folder {
  name: string;
  path: string;
  icon?: string;
  children: Folder[];
  snippets: string[];
  count: number;
}

export interface Diagnostic {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export interface Library {
  version: string;
  folders: Folder;
  snippets: Snippet[];
}

export interface SearchEntry {
  path: string;
  name: string;
  tags: string[];
  folder: string;
  description: string;
  parts: { id: string; title: string; description: string; code: string }[];
}

export interface SearchResult {
  path: string;
  score: number;
  tabId?: string;
  tabTitle?: string;
  excerpt: string;
}

export interface VersionManifest {
  version: string;
  library: string;
  search: string;
}
