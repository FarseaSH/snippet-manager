import { useEffect, useLayoutEffect, useState } from 'react';
import type { TransformExecution } from '../../core/transform';
import { runTransform } from './transform-runtime';

type State = TransformExecution | { status: 'idle' | 'waiting' | 'running' };
interface Run { code: string; input: string; state: State }

export function useLiveTransform(code: string, input: string): State {
  const [run, setRun] = useState<Run>();
  useLayoutEffect(() => { setRun(undefined); }, [code, input]);
  useEffect(() => {
    if (input === '') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setRun({ code, input, state: { status: 'running' } });
      runTransform(code, input, controller.signal).then(state => {
        if (!controller.signal.aborted) setRun({ code, input, state });
      }).catch(error => {
        if (!controller.signal.aborted) setRun({ code, input, state: { status: 'error', message: error instanceof Error ? error.message : '转换执行失败。' } });
      });
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [code, input]);
  if (input === '') return { status: 'idle' };
  return run?.code === code && run.input === input ? run.state : { status: 'waiting' };
}
