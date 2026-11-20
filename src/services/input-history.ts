export interface InputHistoryRecord {
  scope: string;
  path: string;
  group: string;
  name: string;
  value: string;
}

interface PendingGroup {
  scope: string; path: string; group: string;
  reset: boolean;
  values: Map<string, string>;
}

const databaseName = 'snippet-manager-inputs';
const storeName = 'inputs';
const timeout = 1000;
let database: IDBDatabase | undefined;
let opening: Promise<IDBDatabase | undefined> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<string, PendingGroup>();
let writing: Promise<unknown> = Promise.resolve();

function bounded<T>(work: Promise<T>, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const deadline = setTimeout(() => resolve(fallback), timeout);
    work.then(value => { clearTimeout(deadline); resolve(value); }, () => { clearTimeout(deadline); resolve(fallback); });
  });
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (database) return Promise.resolve(database);
  if (opening) return opening;
  opening = new Promise<IDBDatabase | undefined>(resolve => {
    let settled = false;
    const deadline = setTimeout(() => finish(), timeout);
    function finish(db?: IDBDatabase) {
      if (settled) { db?.close(); return; }
      settled = true;
      clearTimeout(deadline);
      if (db) {
        database = db;
        db.onversionchange = () => { db.close(); if (database === db) database = undefined; };
      }
      resolve(db);
    }
    try {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        if (settled) { request.transaction?.abort(); return; }
        const store = request.result.createObjectStore(storeName, { keyPath: ['scope', 'path', 'group', 'name'] });
        store.createIndex('snippet', ['scope', 'path']);
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = request.onblocked = () => finish();
    } catch { finish(); }
  }).finally(() => { opening = undefined; });
  return opening;
}

function transaction<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T | undefined> {
  return new Promise(resolve => {
    let tx: IDBTransaction | undefined;
    let value: T | undefined;
    let settled = false;
    const deadline = setTimeout(() => {
      try { tx?.abort(); } catch { /* already finished */ }
      finish();
    }, timeout);
    function finish(result?: T) {
      if (settled) return;
      settled = true; clearTimeout(deadline); resolve(result);
    }
    try {
      tx = db.transaction(storeName, mode);
      tx.oncomplete = () => finish(value);
      tx.onerror = tx.onabort = () => finish();
      work(tx.objectStore(storeName), result => { value = result; });
      if (mode === 'readwrite') tx.commit();
    } catch {
      try { tx?.abort(); } catch { /* storage is unavailable */ }
      finish();
    }
  });
}

export function scheduleInputHistory(scope: string, path: string, group: string, name: string, value: string) {
  const key = JSON.stringify([scope, path, group]);
  const entry = pending.get(key) ?? { scope, path, group, reset: false, values: new Map<string, string>() };
  entry.values.set(name, value);
  pending.set(key, entry);
  clearTimeout(timer);
  timer = setTimeout(() => { void flushInputHistory(); }, 300);
}

export function resetInputHistory(scope: string, path: string, group: string) {
  pending.set(JSON.stringify([scope, path, group]), { scope, path, group, reset: true, values: new Map() });
  void flushInputHistory();
}

export function flushInputHistory(): Promise<unknown> {
  clearTimeout(timer);
  if (!pending.size) return writing;
  const batch = [...pending.values()];
  pending.clear();
  // Start a ready connection's transaction synchronously, including pagehide.
  // IndexedDB serializes transactions on this store in their creation order;
  // callbacks waiting on the shared open promise keep that order too.
  const write = (db: IDBDatabase | undefined) => {
    if (!db) return Promise.resolve(undefined);
    return transaction(db, 'readwrite', (store, result) => {
      for (const entry of batch) {
        const { scope, path, group } = entry;
        if (entry.reset) store.delete(IDBKeyRange.bound([scope, path, group], [scope, path, group, []]));
        for (const [name, value] of entry.values) store.put({ scope, path, group, name, value } satisfies InputHistoryRecord);
      }
      result(true);
    });
  };
  const operation = database ? write(database) : openDatabase().then(write);
  writing = Promise.all([writing, operation]).then(() => undefined, () => undefined);
  return writing;
}

export function readInputHistory(scope: string, path: string): Promise<InputHistoryRecord[] | undefined> {
  // The deadline covers queued writes, opening the DB and reading the record.
  // A late result is ignored, and a failed read never schedules an empty write.
  return bounded((async () => {
    await flushInputHistory();
    const db = await openDatabase();
    if (!db) return;
    const records = await transaction<unknown[]>(db, 'readonly', (store, result) => {
      const request = store.index('snippet').getAll([scope, path]);
      request.onsuccess = () => result(request.result);
    });
    return records?.filter((record): record is InputHistoryRecord => {
      const item = record as Partial<InputHistoryRecord> | null;
      return Boolean(item && item.scope === scope && item.path === path && typeof item.group === 'string' && typeof item.name === 'string' && typeof item.value === 'string');
    });
  })(), undefined);
}
