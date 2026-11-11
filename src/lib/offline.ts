"use client";

import { supabase } from "./supabase";

const DB_NAME = "activity-board-offline";
const STORE_NAME = "sync-queue";
const DB_VERSION = 1;

interface QueueEntry {
  id: string;
  type: "insert" | "update" | "delete" | "rpc";
  table: string;
  payload?: any;
  filters?: Record<string, any>;
  rpcName?: string;
  rpcArgs?: any;
  timestamp: number;
  retries: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function enqueueMutation(entry: Omit<QueueEntry, "id" | "timestamp" | "retries">): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const fullEntry: QueueEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    retries: 0,
    ...entry,
  };
  store.add(fullEntry);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingQueue(): Promise<QueueEntry[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("timestamp");
  const entries: QueueEntry[] = [];
  return new Promise((resolve, reject) => {
    const req = index.openCursor();
    req.onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (cursor) {
        entries.push(cursor.value);
        cursor.continue();
      } else {
        resolve(entries);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.delete(id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearQueue(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function processQueue(onProgress?: (processed: number, total: number) => void): Promise<{ ok: number; failed: number }> {
  const entries = await getPendingQueue();
  let ok = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      if (entry.type === "insert" && entry.table && entry.payload) {
        const { error } = await supabase.from(entry.table).insert(entry.payload);
        if (error) throw error;
      } else if (entry.type === "update" && entry.table && entry.payload && entry.filters) {
        let query = supabase.from(entry.table).update(entry.payload);
        for (const [col, val] of Object.entries(entry.filters)) {
          query = query.eq(col, val);
        }
        const { error } = await query;
        if (error) throw error;
      } else if (entry.type === "delete" && entry.table && entry.filters) {
        let query = supabase.from(entry.table).delete();
        for (const [col, val] of Object.entries(entry.filters)) {
          query = query.eq(col, val);
        }
        const { error } = await query;
        if (error) throw error;
      } else if (entry.type === "rpc" && entry.rpcName) {
        const { error } = await supabase.rpc(entry.rpcName, entry.rpcArgs ?? {});
        if (error) throw error;
      }

      await removeFromQueue(entry.id);
      ok++;
    } catch (err) {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const existing = await new Promise<QueueEntry | undefined>((resolve) => {
        const req = store.get(entry.id);
        req.onsuccess = () => resolve(req.result as QueueEntry | undefined);
        req.onerror = () => resolve(undefined);
      });
      if (existing) {
        existing.retries += 1;
        store.put(existing);
      }
      await new Promise((resolve) => { tx.oncomplete = () => resolve(undefined); });
      failed++;
    }

    if (onProgress) onProgress(ok + failed, entries.length);
  }

  return { ok, failed };
}

export async function getPendingCount(): Promise<number> {
  const entries = await getPendingQueue();
  return entries.length;
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}
