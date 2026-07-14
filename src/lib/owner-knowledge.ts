/**
 * Owner knowledge uploads — override Danny without Supabase.
 *
 * Storage backends (first match wins for writes):
 *   1. Local disk  — content/knowledge/owner/knowledge/*.md (dev / VPS)
 *   2. Vercel Blob — owner-vault/notes.json when BLOB_READ_WRITE_TOKEN is set
 *                    (works on Vercel/Netlify cloud without Supabase)
 */
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export const OWNER_CLIENT = "owner";
const ROOT = path.join(process.cwd(), "content", "knowledge", OWNER_CLIENT, "knowledge");
const BLOB_PREFIX = "owner-vault/";
const BLOB_INDEX = "owner-vault/notes.json";

export type OwnerNote = {
  path: string;
  title: string;
  body: string;
  folder: string;
};

type StoredNote = { path: string; title: string; body: string; raw?: string };

function diskWritable(): boolean {
  if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  return true;
}

function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** True when uploads can be saved (disk or Blob). */
export function ownerKnowledgeWritable(): boolean {
  return diskWritable() || blobConfigured();
}

export function ownerUploadBackend(): "disk" | "blob" | "none" {
  if (diskWritable()) return "disk";
  if (blobConfigured()) return "blob";
  return "none";
}

function parseRaw(file: string, raw: string): OwnerNote {
  const { data, content } = matter(raw);
  return {
    path: file,
    title: (typeof data.title === "string" && data.title) || file.replace(/\.md$/i, ""),
    body: content.trim(),
    folder: "owner",
  };
}

async function listFromDisk(): Promise<OwnerNote[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(ROOT)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const out: OwnerNote[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(ROOT, file), "utf8");
      out.push(parseRaw(file, raw));
    } catch {
      /* skip */
    }
  }
  return out;
}

async function listFromBlob(): Promise<OwnerNote[]> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return [];
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_PREFIX, token, limit: 100 });
    const index = blobs.find((b) => b.pathname === BLOB_INDEX || b.pathname.endsWith("notes.json"));
    if (!index) return [];
    const res = await fetch(index.url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { notes?: StoredNote[] };
    return (data.notes || []).map((n) => ({
      path: n.path,
      title: n.title,
      body: n.body,
      folder: "owner",
    }));
  } catch (err) {
    console.warn("[owner-knowledge] blob list failed:", err);
    return [];
  }
}

export async function hasOwnerKnowledge(): Promise<boolean> {
  const notes = await listOwnerNotes();
  return notes.length > 0;
}

export async function listOwnerNotes(): Promise<OwnerNote[]> {
  // Prefer disk if any local owner files exist; else Blob
  const disk = await listFromDisk();
  if (disk.length) return disk;
  if (blobConfigured()) return listFromBlob();
  return [];
}

async function clearDisk(): Promise<number> {
  let files: string[] = [];
  try {
    files = await fs.readdir(ROOT);
  } catch {
    return 0;
  }
  let n = 0;
  for (const f of files) {
    if (!f.endsWith(".md") && f !== "_manifest.json") continue;
    await fs.unlink(path.join(ROOT, f)).catch(() => {});
    n++;
  }
  return n;
}

async function clearBlob(): Promise<number> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return 0;
  const { list, del } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: BLOB_PREFIX, token, limit: 1000 });
  if (!blobs.length) return 0;
  await del(
    blobs.map((b) => b.url),
    { token }
  );
  return blobs.length;
}

export async function clearOwnerKnowledge(): Promise<number> {
  if (diskWritable()) return clearDisk();
  if (blobConfigured()) return clearBlob();
  return 0;
}

export async function saveOwnerNotes(
  notes: Array<{ filename: string; raw: string }>
): Promise<{ documents: number; backend: "disk" | "blob" }> {
  const backend = ownerUploadBackend();
  if (backend === "none") {
    throw new Error(
      "Cloud host cannot save uploads to disk. Add BLOB_READ_WRITE_TOKEN (Vercel Blob — one key, no Supabase) or run locally."
    );
  }

  const stored: StoredNote[] = notes.map((n) => {
    const safe = n.filename.replace(/[^a-zA-Z0-9._\-/]/g, "_").replace(/^\/+/, "");
    const base = path.basename(safe).endsWith(".md") ? path.basename(safe) : `${path.basename(safe)}.md`;
    const parsed = parseRaw(base, n.raw);
    return { path: base, title: parsed.title, body: parsed.body, raw: n.raw };
  });

  if (backend === "disk") {
    await fs.mkdir(ROOT, { recursive: true });
    await clearDisk();
    for (const n of stored) {
      await fs.writeFile(path.join(ROOT, n.path), n.raw || `---\ntitle: ${JSON.stringify(n.title)}\n---\n\n${n.body}\n`, "utf8");
    }
    await fs.writeFile(
      path.join(ROOT, "_manifest.json"),
      JSON.stringify({ client: OWNER_CLIENT, count: stored.length, updatedAt: Date.now() }, null, 2),
      "utf8"
    );
    return { documents: stored.length, backend: "disk" };
  }

  // Blob backend
  const token = process.env.BLOB_READ_WRITE_TOKEN!;
  await clearBlob();
  const { put } = await import("@vercel/blob");
  await put(
    BLOB_INDEX,
    JSON.stringify({ client: OWNER_CLIENT, updatedAt: Date.now(), notes: stored }),
    { access: "public", token, contentType: "application/json", addRandomSuffix: false, allowOverwrite: true }
  );
  return { documents: stored.length, backend: "blob" };
}

export async function searchOwnerNotes(query: string, limit = 8) {
  const notes = await listOwnerNotes();
  const terms = query
    .toLowerCase()
    .split(/[^\w]+/)
    .filter((t) => t.length > 2);
  if (!terms.length) {
    return notes.slice(0, limit).map((n) => ({
      id: n.path.replace(/\.md$/i, ""),
      title: n.title,
      folder: n.folder,
      excerpt: n.body.slice(0, 600),
      source: { keyword: 0, semantic: null as number | null },
      score: 1,
    }));
  }
  const scored = notes.map((n) => {
    const hay = `${n.title}\n${n.body}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      score += (n.title.toLowerCase().match(new RegExp(t, "g")) || []).length * 5;
      score += (hay.match(new RegExp(t, "g")) || []).length;
    }
    return { n, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ n, score }, i) => ({
      id: n.path.replace(/\.md$/i, ""),
      title: n.title,
      folder: n.folder,
      excerpt: n.body.slice(0, 600),
      source: { keyword: i, semantic: null as number | null },
      score,
    }));
}
