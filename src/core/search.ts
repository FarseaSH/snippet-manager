import type { SearchEntry, SearchResult } from './types';
import { compareNames } from './paths';

const contains = (text: string, term: string) => text.toLowerCase().includes(term);

function excerpt(text: string, terms: string[]): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  const at = terms.map(term => flattened.toLowerCase().indexOf(term)).filter(index => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 28);
  const end = Math.min(flattened.length, start + 120);
  return `${start ? '…' : ''}${flattened.slice(start, end)}${end < flattened.length ? '…' : ''}`;
}

export function searchSnippets(entries: SearchEntry[], query: string): SearchResult[] {
  const terms = [...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))];
  if (!terms.length) return [];
  const results: SearchResult[] = [];
  for (const entry of entries) {
    const fields = [entry.name, entry.tags.join(' '), entry.folder, entry.description, ...entry.parts.flatMap(part => [part.title, part.description, part.code])];
    if (!terms.every(term => fields.some(field => contains(field, term)))) continue;
    let score = 0;
    for (const term of terms) {
      score += contains(entry.name, term) ? 100 : entry.tags.some(tag => contains(tag, term)) ? 90 : entry.parts.some(part => contains(part.title, term)) ? 80 : contains(entry.folder, term) ? 30 : contains(entry.description, term) ? 20 : 10;
    }
    const candidates = entry.parts.map(part => ({ part, score: terms.reduce((sum, term) => sum + (contains(part.title, term) ? 8 : contains(part.description, term) ? 4 : contains(part.code, term) ? 2 : 0), 0) }));
    const candidate = candidates.sort((a, b) => b.score - a.score)[0];
    const match = candidate?.score ? candidate.part : undefined;
    const text = match && terms.some(term => contains(match.code, term)) ? match.code : match && terms.some(term => contains(match.description, term)) ? match.description : entry.description || entry.name;
    results.push({ path: entry.path, score, tabId: match?.id, tabTitle: match?.title, excerpt: excerpt(text, terms) });
  }
  const byPath = new Map(entries.map(entry => [entry.path, entry]));
  return results.sort((a, b) => b.score - a.score || compareNames(byPath.get(a.path)!, byPath.get(b.path)!));
}
