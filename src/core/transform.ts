import type { TransformResult } from './types';

export type TransformExecution = { status: 'success'; output: string } | { status: 'invalid'; message: string } | { status: 'error'; message: string };

export function interpretTransformResult(value: unknown): TransformExecution {
  const result = value as Partial<TransformResult> | null;
  if (result?.ok === true && typeof result.output === 'string') return { status: 'success', output: result.output };
  if (result?.ok === false && result.error && typeof result.error.message === 'string' && result.error.message.trim()) return { status: 'invalid', message: result.error.message };
  return { status: 'error', message: '转换函数返回格式无效，请返回 { ok: true, output: 字符串 } 或 { ok: false, error: { message: 字符串 } }。' };
}
