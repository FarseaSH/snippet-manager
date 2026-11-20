import { useEffect, useRef, useState } from 'react';
import type { InputHistoryGroup } from '../../core/input-history';
import type { PlaceholderValues } from '../../core/placeholders';
import { flushInputHistory, readInputHistory, resetInputHistory, scheduleInputHistory } from '../../services/input-history';

export function useInputHistory(path: string, groups: InputHistoryGroup[]) {
  const scope = import.meta.env.BASE_URL;
  const [values, setValues] = useState<Record<string, PlaceholderValues>>({});
  const touched = useRef(new Set<string>());
  const reset = useRef(new Set<string>());
  const schema = JSON.stringify(groups);

  useEffect(() => {
    let active = true;
    const allowed = new Map((JSON.parse(schema) as InputHistoryGroup[]).filter(group => group.persistent && group.fields.length).map(group => [group.key, new Set(group.fields)]));
    if (allowed.size) void readInputHistory(scope, path).then(records => {
      if (!active || !records) return;
      setValues(previous => {
        const next = { ...previous };
        for (const record of records) {
          if (!allowed.get(record.group)?.has(record.name) || reset.current.has(record.group) || touched.current.has(JSON.stringify([record.group, record.name]))) continue;
          next[record.group] = { ...next[record.group], [record.name]: record.value };
        }
        return next;
      });
    });
    function flush() { void flushInputHistory(); }
    function hide() { if (document.visibilityState === 'hidden') flush(); }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hide);
    document.addEventListener('focusout', flush);
    return () => {
      active = false;
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hide);
      document.removeEventListener('focusout', flush);
    };
  }, [scope, path, schema]);

  function change(group: InputHistoryGroup, name: string, value: string) {
    touched.current.add(JSON.stringify([group.key, name]));
    setValues(previous => ({ ...previous, [group.key]: { ...previous[group.key], [name]: value } }));
    if (group.persistent) scheduleInputHistory(scope, path, group.key, name, value);
  }

  function clear(group: InputHistoryGroup) {
    reset.current.add(group.key);
    setValues(previous => ({ ...previous, [group.key]: {} }));
    if (group.persistent) resetInputHistory(scope, path, group.key);
  }

  return { values, change, clear };
}
