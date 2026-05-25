// IndexedDB wrapper: `catalog` store (full AmiiboAPI response) + `collection` store
// (owned dumps, keyed by amiibo id = head+tail).

const DB_NAME = 'amiibodex';
const DB_VERSION = 1;
const CATALOG_STORE = 'catalog';
const COLLECTION_STORE = 'collection';

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE); // out-of-line keys ('all')
      }
      if (!db.objectStoreNames.contains(COLLECTION_STORE)) {
        db.createObjectStore(COLLECTION_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode) {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function asPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- Catalog ----

export async function getCatalog() {
  const store = await tx(CATALOG_STORE, 'readonly');
  return asPromise(store.get('all'));
}

export async function putCatalog(amiibo) {
  const store = await tx(CATALOG_STORE, 'readwrite');
  return asPromise(store.put({ amiibo, fetchedAt: Date.now() }, 'all'));
}

// ---- Collection ----

export async function getAllOwned() {
  const store = await tx(COLLECTION_STORE, 'readonly');
  return asPromise(store.getAll());
}

export async function putOwned(record) {
  const store = await tx(COLLECTION_STORE, 'readwrite');
  return asPromise(store.put(record));
}

export async function deleteOwned(id) {
  const store = await tx(COLLECTION_STORE, 'readwrite');
  return asPromise(store.delete(id));
}
