import type { TransformResult } from './types';

export type TransformExecution = { status: 'success'; output: string; language?: string } | { status: 'invalid'; message: string } | { status: 'error'; message: string };

export function resolveTransformLanguage(language?: string, fallback?: string): string {
  const value = (language?.trim() || fallback?.trim() || 'text').toLowerCase();
  const aliases: Record<string, string> = { md: 'markdown', py: 'python', js: 'javascript', ts: 'typescript', yml: 'yaml' };
  return Object.hasOwn(aliases, value) ? aliases[value] : value;
}

export function interpretTransformResult(value: unknown): TransformExecution {
  const result = value as Partial<TransformResult> | null;
  if (result?.ok === true && typeof result.output === 'string') {
    if (result.language !== undefined && typeof result.language !== 'string') return { status: 'error', message: '转换函数返回的 language 必须是字符串，例如 json、python 或 markdown。' };
    const language = result.language?.trim();
    return { status: 'success', output: result.output, ...(language ? { language } : {}) };
  }
  if (result?.ok === false && result.error && typeof result.error.message === 'string' && result.error.message.trim()) return { status: 'invalid', message: result.error.message };
  return { status: 'error', message: '转换函数返回格式无效，请返回 { ok: true, output: 字符串 } 或 { ok: false, error: { message: 字符串 } }。' };
}
