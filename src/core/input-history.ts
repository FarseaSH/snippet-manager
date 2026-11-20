import { parsePlaceholders } from './placeholders';
import type { SubSnippet } from './types';

export interface InputHistoryGroup {
  key: string;
  fields: string[];
  persistent: boolean;
}

function fingerprint(code: string) {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let index = 0; index < code.length; index++) {
    a = Math.imul(a ^ code.charCodeAt(index), 0x01000193);
    b = Math.imul(b ^ code.charCodeAt(index), 0x85ebca6b);
  }
  return `${code.length}:${a >>> 0}:${b >>> 0}`;
}

export function parameterHistoryGroups(parts: SubSnippet[]): Map<string, InputHistoryGroup> {
  const titles = new Map<string, number>();
  for (const part of parts) titles.set(part.title, (titles.get(part.title) ?? 0) + 1);
  const keys = parts.map(part => {
    const language = part.language.trim().toLowerCase();
    const named = titles.get(part.title) === 1 && !/^Untitled(?: \d+)?$/.test(part.title);
    return named ? JSON.stringify(['tab', part.title, language]) : JSON.stringify(['template', language, fingerprint(part.code)]);
  });
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return new Map(parts.map((part, index) => {
    const persistent = counts.get(keys[index]) === 1;
    return [part.id, {
      key: persistent ? keys[index] : JSON.stringify(['session', part.id, keys[index]]),
      fields: parsePlaceholders(part.code).fields.map(field => field.name),
      persistent,
    }];
  }));
}
