// Tiny promise wrapper around IndexedDB.
//   videos  — one record per video card (keyPath "id")
//   kv      — settings as {key, value}
// Added in version 2 (the upgrade only adds stores; nothing is changed or removed):
//   shorts  — Shorts planned from a video (keyPath "id", has videoId)
//   abtests — title/thumbnail A/B log rows (keyPath "id", has videoId)
//   weekly  — weekly review notes (keyPath "week", e.g. "2026-W41")
//   stats   — numbers typed in per video per week (keyPath "id" = videoId@week)

let DB_NAME = 'channel-studio';
export const DB_VERSION = 2;
export const STORES = {
  videos: 'id',
  kv: 'key',
  shorts: 'id',
  abtests: 'id',
  weekly: 'week',
  stats: 'id',
};
export const DATA_STORES = ['shorts', 'abtests', 'weekly', 'stats'];
let dbPromise;

/** Use another database name (self-tests only). */
export function useDatabase(name) {
  if (dbPromise) dbPromise.then((db) => db.close()).catch(() => {});
  dbPromise = null;
  DB_NAME = name;
}

export function upgrade(db) {
  for (const [name, keyPath] of Object.entries(STORES)) {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
  }
}

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => upgrade(req.result);
      req.onsuccess = () => {
        const db = req.result;
        // Another tab opened a newer version: let it upgrade.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => console.warn('Channel Studio is open in another tab with an older version. Close that tab.');
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

export async function del(store, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

/** Delete several records from several stores in one go. */
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

/** Replace everything in one transaction (used by import and reset). */
export async function replaceAll({ videos, kv, shorts = [], abtests = [], weekly = [], stats = [] }) {
  const db = await open();
  const tx = db.transaction(Object.keys(STORES), 'readwrite');
  const rows = { videos, shorts, abtests, weekly, stats };
  for (const [name, list] of Object.entries(rows)) {
    const os = tx.objectStore(name);
    os.clear();
    for (const r of list) os.put(r);
  }
  const ks = tx.objectStore('kv');
  ks.clear();
  for (const [key, value] of Object.entries(kv)) ks.put({ key, value });
  return done(tx);
}
