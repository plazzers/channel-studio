// Tiny promise wrapper around IndexedDB. Everything the kit stores lives
// here, on this device only.

let DB_NAME = 'faceless-creator-kit';
export const DB_VERSION = 1;
export const STORES = {
  channels: 'id',
  videos: 'id',
  shorts: 'id',
  stats: 'id',
  weekly: 'week',
  topics: 'id',
  pins: 'id',
  kv: 'key',
};
export const LISTS = ['channels', 'videos', 'shorts', 'stats', 'weekly', 'topics', 'pins'];
let dbPromise;

/** Use another database name (tests only). */
export function useDatabase(name) {
  if (dbPromise) dbPromise.then((db) => db.close()).catch(() => {});
  dbPromise = null;
  DB_NAME = name;
}

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const [name, keyPath] of Object.entries(STORES)) {
          if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => console.warn('The kit is open in another tab with an older version. Close that tab.');
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll());
}

export async function put(store, value) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return done(tx);
}

export async function putMany(store, values) {
  if (!values.length) return;
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  for (const v of values) tx.objectStore(store).put(v);
  return done(tx);
}

/** Delete several records from several stores in one go: [[store, key], …] */
export async function delMany(pairs) {
  if (!pairs.length) return;
  const db = await open();
  const tx = db.transaction([...new Set(pairs.map(([s]) => s))], 'readwrite');
  for (const [s, key] of pairs) tx.objectStore(s).delete(key);
  return done(tx);
}

export async function getKV(key) {
  const db = await open();
  const row = await result(db.transaction('kv').objectStore('kv').get(key));
  return row ? row.value : undefined;
}

export const setKV = (key, value) => put('kv', { key, value });

/** Replace everything in one transaction (restore and reset). */
export async function replaceAll(lists, kv) {
  const db = await open();
  const tx = db.transaction(Object.keys(STORES), 'readwrite');
  for (const name of LISTS) {
    const os = tx.objectStore(name);
    os.clear();
    for (const r of lists[name] || []) os.put(r);
  }
  const ks = tx.objectStore('kv');
  ks.clear();
  for (const [key, value] of Object.entries(kv || {})) ks.put({ key, value });
  return done(tx);
}
