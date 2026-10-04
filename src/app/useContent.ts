import { useCallback, useEffect, useState } from 'react';
import { loadLibrary } from '../services/library';
import type { Library, SearchEntry } from '../core/types';

export function useContent() {
  const [data, setData] = useState<{ library: Library; search: SearchEntry[] }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    loadLibrary(controller.signal).then(setData).catch(reason => { if (!controller.signal.aborted) setError((reason as Error).message); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (import.meta.hot) {
      import.meta.hot.on('content:updated', retry);
      return () => import.meta.hot?.off('content:updated', retry);
    }
  }, [retry]);
  return { data, error, retry };
}
