"use client";

/** Reads (and clears) content the service worker stored from the Web Share Target. */
export interface SharedPayload {
  title: string;
  text: string;
  url: string;
  files: File[];
  at: number;
}

const DB = "stash-share";
const STORE = "pending";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function takeSharedPayload(): Promise<SharedPayload | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get = store.get("latest");
    get.onsuccess = () => {
      store.delete("latest");
      const value = get.result as SharedPayload | undefined;
      // Ignore stale shares (e.g. abandoned before signing in a day ago).
      resolve(value && Date.now() - value.at < 24 * 60 * 60 * 1000 ? value : null);
    };
    get.onerror = () => reject(get.error);
  });
}
