/**
 * Supabase-backed vault — ingest notes, embed chunks, semantic search.
 * Uses tables/functions from supabase/migrations/0007_vault_vectors.sql.
 */
import matter from "gray-matter";
import path from "node:path";
import { APP_CLIENT } from "./client";
import { embed, embedOne } from "./embeddings";
import { supabaseAdmin, supabaseConfigured } from "./supabase-admin";
import type { BrainGraph, HybridHit, VaultNote } from "./vault";
import { buildGraph } from "./vault";

const WIKILINK = /\[\[([^\]\|#]+)(?:#[^\]\|]+)?(?:\|[^\]]+)?\]\]/g;
const TAG = /(?:^|\s)#([\w\-/]+)/g;

/** ~900 tokens of prose per chunk; overlap keeps context across boundaries. */
const CHUNK_CHARS = 2800;
const CHUNK_OVERLAP = 350;

export type ParsedNote = {
  path: string;
  title: string;
  folder: string;
  body: string;
  tags: string[];
  links: string[];
  mtime?: number;
};

export function vaultBackendReady(): boolean {
  return supabaseConfigured();
}

export function parseMarkdownNote(relPath: string, raw: string, mtime?: number): ParsedNote {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\//, "");
  const { data, content } = matter(raw);
  const title =
    (typeof data.title === "string" && data.title.trim()) ||
    path.basename(normalized, path.extname(normalized));
  const folder = path.posix.dirname(normalized);
  const links = [...content.matchAll(WIKILINK)].map((m) => m[1].trim());
  const inlineTags = [...content.matchAll(TAG)].map((m) => m[1]);
  const fmTags = Array.isArray(data.tags) ? data.tags.map(String) : [];
  return {
    path: normalized.endsWith(".md") ? normalized : `${normalized}.md`,
    title,
    folder: folder === "." ? "(root)" : folder,
    body: content.trim(),
    tags: [...new Set([...fmTags, ...inlineTags])],
    links,
    mtime,
  };
}

export function chunkText(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  if (cleaned.length <= CHUNK_CHARS) return [cleaned];
  const chunks: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    let end = Math.min(i + CHUNK_CHARS, cleaned.length);
    if (end < cleaned.length) {
      const slice = cleaned.slice(i, end);
      const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
      if (breakAt > CHUNK_CHARS * 0.4) end = i + breakAt + 1;
    }
    const piece = cleaned.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= cleaned.length) break;
    i = Math.max(end - CHUNK_OVERLAP, i + 1);
  }
  return chunks;
}

export async function upsertVaultNotes(
  notes: ParsedNote[],
  client = APP_CLIENT
): Promise<{ documents: number; chunks: number }> {
  const db = supabaseAdmin();
  if (!db) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

  let documents = 0;
  let chunksTotal = 0;

  for (const note of notes) {
    if (!note.body) continue;
    const chunks = chunkText(`${note.title}\n\n${note.body}`);
    if (!chunks.length) continue;

    const vectors = await embed(chunks);

    const { data: doc, error: docErr } = await db
      .from("vault_documents")
      .upsert(
        {
          client,
          path: note.path,
          title: note.title,
          folder: note.folder,
          tags: note.tags,
          links: note.links,
          content: note.body,
          char_count: note.body.length,
          chunk_count: chunks.length,
          mtime: note.mtime ?? Date.now(),
        },
        { onConflict: "client,path" }
      )
      .select("id")
      .single();

    if (docErr || !doc) {
      throw new Error(`Failed to upsert ${note.path}: ${docErr?.message ?? "no row"}`);
    }

    await db.from("vault_chunks").delete().eq("document_id", doc.id);

    const rows = chunks.map((content, chunk_index) => ({
      document_id: doc.id,
      client,
      path: note.path,
      title: note.title,
      folder: note.folder,
      chunk_index,
      content,
      embedding: vectors[chunk_index],
    }));

    // Insert in batches — embeddings payloads are large.
    const BATCH = 40;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: chunkErr } = await db.from("vault_chunks").insert(rows.slice(i, i + BATCH));
      if (chunkErr) throw new Error(`Failed to insert chunks for ${note.path}: ${chunkErr.message}`);
    }

    documents += 1;
    chunksTotal += chunks.length;
  }

  return { documents, chunks: chunksTotal };
}

export async function searchVaultSupabase(query: string, limit = 8, client = APP_CLIENT): Promise<HybridHit[]> {
  const db = supabaseAdmin();
  if (!db) throw new Error("Supabase is not configured");

  const embedding = await embedOne(query);
  const { data, error } = await db.rpc("match_vault_chunks", {
    query_embedding: embedding,
    filter_client: client,
    match_count: limit,
    similarity_threshold: 0.15,
  });

  if (error) throw new Error(`match_vault_chunks failed: ${error.message}`);

  type Row = {
    id: string;
    path: string;
    title: string;
    folder: string;
    content: string;
    similarity: number;
  };

  const rows = (data ?? []) as Row[];
  return rows.map((r, i) => ({
    id: r.path.replace(/\.md$/i, ""),
    title: r.title,
    folder: r.folder,
    excerpt: r.content.slice(0, 600),
    source: { keyword: null, semantic: i },
    score: r.similarity,
  }));
}

export async function listVaultDocuments(client = APP_CLIENT): Promise<VaultNote[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("vault_documents")
    .select("path, title, folder, tags, links, content, char_count, mtime")
    .eq("client", client)
    .order("path");
  if (error || !data) return [];
  return data.map((r) => ({
    id: String(r.path).replace(/\.md$/i, ""),
    path: String(r.path),
    title: String(r.title),
    folder: String(r.folder || "(root)"),
    body: String(r.content || ""),
    tags: (r.tags as string[]) || [],
    links: (r.links as string[]) || [],
    size: Number(r.char_count) || 0,
    mtime: Number(r.mtime) || 0,
  }));
}

export async function getVaultStats(client = APP_CLIENT) {
  const db = supabaseAdmin();
  if (!db) return { documents: 0, chunks: 0, folders: 0, configured: false };
  const { data, error } = await db.rpc("vault_stats", { filter_client: client });
  if (error || !data?.[0]) return { documents: 0, chunks: 0, folders: 0, configured: true };
  const row = data[0] as { documents: number; chunks: number; folders: number };
  return {
    documents: Number(row.documents) || 0,
    chunks: Number(row.chunks) || 0,
    folders: Number(row.folders) || 0,
    configured: true,
  };
}

export async function buildVaultGraph(client = APP_CLIENT): Promise<BrainGraph> {
  const notes = await listVaultDocuments(client);
  return buildGraph(notes);
}

export async function deleteVaultNote(relPath: string, client = APP_CLIENT) {
  const db = supabaseAdmin();
  if (!db) throw new Error("Supabase is not configured");
  const { error } = await db.from("vault_documents").delete().eq("client", client).eq("path", relPath);
  if (error) throw new Error(error.message);
}

/** Wipe every note for a client (chunks cascade). Used when user uploads replace the demo brain. */
export async function clearVault(client = APP_CLIENT): Promise<number> {
  const db = supabaseAdmin();
  if (!db) throw new Error("Supabase is not configured");
  const { data, error } = await db.from("vault_documents").delete().eq("client", client).select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** True when the user has indexed vault notes — those override bundled Danny knowledge. */
export async function hasUserVault(client = APP_CLIENT): Promise<boolean> {
  if (!vaultBackendReady()) return false;
  const stats = await getVaultStats(client);
  return stats.documents > 0;
}
