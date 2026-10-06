"use client";

import type { QueueStore, QueuedEvent } from "@/lib/muddakir";

// مخزن طابور الأحداث في IndexedDB (§٨) — يحفظ كل ضغطةٍ محليًّا فتبقى بعد إعادة التحميل وبلا إنترنت.
const DB_NAME = "muddakir";
const STORE = "events";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clientEventId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export class IdbQueueStore implements QueueStore {
  async add(e: QueuedEvent): Promise<void> {
    await tx("readwrite", (s) => s.put(e));
  }
  async all(): Promise<QueuedEvent[]> {
    return (await tx<QueuedEvent[]>("readonly", (s) => s.getAll())) ?? [];
  }
  async markSent(ids: string[]): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      const s = t.objectStore(STORE);
      for (const id of ids) {
        const g = s.get(id);
        g.onsuccess = () => { const v = g.result as QueuedEvent | undefined; if (v) s.put({ ...v, sent: true }); };
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }
}
