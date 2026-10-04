export interface SubSnippet {
  id: string;
  title: string;
  sourceOrder: number;
  sourceDescription: string;
  language: string;
  code: string;
  codeHtml: string;
}

export interface Snippet {
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
