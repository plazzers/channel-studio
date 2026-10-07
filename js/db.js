// Tiny promise wrapper around IndexedDB. Two stores:
//   videos — one record per video card (keyPath "id")
//   kv     — settings as {key, value}

const DB_NAME = 'channel-studio';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('videos')) db.createObjectStore('videos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
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

export async function getKV(key) {
  const db = await open();
  const row = await result(db.transaction('kv').objectStore('kv').get(key));
  return row ? row.value : undefined;
}

export const setKV = (key, value) => put('kv', { key, value });

/** Replace everything in one transaction (used by import and reset). */
export async function replaceAll({ videos, kv }) {
  const db = await open();
  const tx = db.transaction(['videos', 'kv'], 'readwrite');
  const vs = tx.objectStore('videos');
  const ks = tx.objectStore('kv');
  vs.clear();
  ks.clear();
  for (const v of videos) vs.put(v);
  for (const [key, value] of Object.entries(kv)) ks.put({ key, value });
  return done(tx);
}
