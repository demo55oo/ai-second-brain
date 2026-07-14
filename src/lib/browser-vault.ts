/**
 * Browser vault — stores uploaded markdown in IndexedDB on this device.
 * Used when the cloud host can't write files to disk (no Blob, no Supabase).
 * Notes travel with each chat request so the server can answer from them.
 */

export type BrowserNote = {
  path: string;
  title: string;
  body: string;
  folder: string;
};

const DB_NAME = "second-brain-vault";
const STORE = "notes";
const KEY = "owner";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBrowserVault(notes: BrowserNote[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ notes, updatedAt: Date.now() }, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadBrowserVault(): Promise<BrowserNote[]> {
  try {
    const db = await openDb();
    const row = await new Promise<{ notes?: BrowserNote[] } | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as { notes?: BrowserNote[] } | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row?.notes ?? [];
  } catch {
    return [];
  }
}

export async function clearBrowserVault(): Promise<void> {
  await saveBrowserVault([]);
}

export async function hasBrowserVault(): Promise<boolean> {
  const notes = await loadBrowserVault();
  return notes.length > 0;
}

/** Parse a File into a BrowserNote (client-side). */
export async function fileToBrowserNote(file: File): Promise<BrowserNote | null> {
  const name = file.name || "note.md";
  if (!/\.(md|markdown|txt)$/i.test(name)) return null;
  const raw = await file.text();
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  let title = name.replace(/\.(md|markdown|txt)$/i, "");
  let body = raw.trim();
  if (fm) {
    const titleMatch = fm[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
    if (titleMatch) title = titleMatch[1].trim();
    body = fm[2].trim();
  } else {
    const h1 = body.match(/^#\s+(.+)$/m);
    if (h1) title = h1[1].trim();
  }
  return { path: name, title, body, folder: "owner" };
}
