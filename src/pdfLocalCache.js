const DB_NAME = "album-pdf-local";
const STORE = "blobs";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/** Persist client-built PDF so Done page can offer download without server fonts. */
export async function saveLocalPdfBlob(albumId, blob) {
  if (!albumId || !blob) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(blob, albumId);
  });
}

export async function getLocalPdfBlob(albumId) {
  if (!albumId) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(albumId);
    r.onsuccess = () => {
      db.close();
      resolve(r.result ?? null);
    };
    r.onerror = () => reject(r.error);
  });
}
