/**
 * Owner second brain = ONE document (BRAIN.md).
 *
 * Backends (auto-detected):
 * 1. Disk — content/knowledge/owner/BRAIN.md (local / VPS)
 * 2. Vercel Blob — owner/BRAIN.md when BLOB_READ_WRITE_TOKEN is set
 *    (one-click Deploy button provisions the store; token is injected — no paste)
 * 3. None — UI falls back to browser document
 *
 * Uploads are not kept as separate files. Each note becomes a named section.
 */
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export const OWNER_CLIENT = "owner";
export const BRAIN_FILENAME = "BRAIN.md";
/** Stable Blob pathname — overwritten on each upload. */
export const BRAIN_BLOB_PATH = "owner/BRAIN.md";

const OWNER_DIR = path.join(process.cwd(), "content", "knowledge", OWNER_CLIENT);
const BRAIN_PATH = path.join(OWNER_DIR, BRAIN_FILENAME);
const LEGACY_ROOT = path.join(OWNER_DIR, "knowledge");

export type OwnerNote = {
  path: string;
  title: string;
  body: string;
  folder: string;
};

export type OwnerBackend = "disk" | "blob" | "none";

function diskWritable(): boolean {
  if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  return true;
}

export function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export function ownerKnowledgeWritable(): boolean {
  return diskWritable() || blobConfigured();
}

export function ownerUploadBackend(): OwnerBackend {
  // Blob wins when configured so a shipped/local md file never overrides cloud brain.
  if (blobConfigured()) return "blob";
  if (diskWritable()) return "disk";
  return "none";
}

export function ownerBrainPath(): string {
  return BRAIN_PATH;
}

/** Build the single brain document from uploaded notes. */
export function buildBrainMarkdown(
  notes: Array<{ filename: string; title?: string; body: string }>
): string {
  const parts = [
    "# Second Brain",
    "",
    "_This is the default AI brain file. Uploaded notes are merged here as sections — not stored as separate files._",
    "",
  ];
  for (const n of notes) {
    const name = path.basename(n.filename).replace(/\.markdown$/i, ".md");
    const title = (n.title || name.replace(/\.md$/i, "")).trim();
    const body = stripFrontmatter(n.body).trim();
    parts.push(`<!-- section: ${name} -->`);
    parts.push(`## ${title}`);
    parts.push("");
    parts.push(`_Source: ${name}_`);
    parts.push("");
    parts.push(body || "_(empty)_");
    parts.push("");
  }
  return parts.join("\n").trimEnd() + "\n";
}

/** Split BRAIN.md back into virtual notes (for UI / light search). */
export function parseBrainMarkdown(raw: string): OwnerNote[] {
  const text = raw.trim();
  if (!text || text === "# Second Brain") return [];

  const sectionRe =
    /<!--\s*section:\s*(.+?)\s*-->\s*\n##\s+(.+?)\n([\s\S]*?)(?=(?:\n<!--\s*section:)|\s*$)/g;
  const out: OwnerNote[] = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(text)) !== null) {
    const file = m[1].trim();
    const title = m[2].trim();
    let body = m[3].trim();
    body = body.replace(/^_Source:\s*.+?_\s*/i, "").trim();
    out.push({ path: file, title, body, folder: "owner" });
  }

  if (out.length) return out;

  const { content } = matter(text);
  const body = content.trim();
  if (!body || body.startsWith("_This is the default")) return [];
  return [{ path: BRAIN_FILENAME, title: "Second Brain", body, folder: "owner" }];
}

function stripFrontmatter(raw: string): string {
  const { content } = matter(raw);
  return content;
}

async function readBrainFromBlob(): Promise<string | null> {
  if (!blobConfigured()) return null;
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(BRAIN_BLOB_PATH, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return text.trim() ? text : null;
  } catch {
    // Older SDK / missing blob — try list + fetch
    try {
      const { head } = await import("@vercel/blob");
      const info = await head(BRAIN_BLOB_PATH, { token: process.env.BLOB_READ_WRITE_TOKEN });
      if (!info?.url) return null;
      const res = await fetch(info.url, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      });
      if (!res.ok) return null;
      const text = await res.text();
      return text.trim() ? text : null;
    } catch {
      return null;
    }
  }
}

async function writeBrainToBlob(markdown: string): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(BRAIN_BLOB_PATH, markdown, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/markdown; charset=utf-8",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function readOwnerBrainMarkdown(): Promise<string | null> {
  // Blob first when token exists — never let a leftover local .md override the cloud brain.
  if (blobConfigured()) {
    const fromBlob = await readBrainFromBlob();
    if (fromBlob && parseBrainMarkdown(fromBlob).length) return fromBlob;
    return null;
  }

  if (diskWritable()) {
    try {
      const raw = await fs.readFile(BRAIN_PATH, "utf8");
      if (parseBrainMarkdown(raw).length) return raw;
    } catch {
      /* miss */
    }
  }

  return null;
}

async function wipeLocalOwnerMarkdown(): Promise<void> {
  try {
    await fs.unlink(BRAIN_PATH);
  } catch {
    /* none */
  }
  try {
    const files = await fs.readdir(LEGACY_ROOT);
    for (const f of files) {
      if (f.endsWith(".md") || f === "_manifest.json") {
        await fs.unlink(path.join(LEGACY_ROOT, f)).catch(() => {});
      }
    }
  } catch {
    /* no legacy folder */
  }
}

export async function hasOwnerKnowledge(): Promise<boolean> {
  return !!(await readOwnerBrainMarkdown());
}

export async function listOwnerNotes(): Promise<OwnerNote[]> {
  const raw = await readOwnerBrainMarkdown();
  if (!raw) return [];
  return parseBrainMarkdown(raw);
}

export async function clearOwnerKnowledge(): Promise<number> {
  const notes = await listOwnerNotes();
  const empty = emptyBrainTemplate();
  if (diskWritable()) {
    await fs.mkdir(OWNER_DIR, { recursive: true });
    await fs.writeFile(BRAIN_PATH, empty, "utf8");
    try {
      const files = await fs.readdir(LEGACY_ROOT);
      for (const f of files) {
        if (f.endsWith(".md") || f === "_manifest.json") {
          await fs.unlink(path.join(LEGACY_ROOT, f)).catch(() => {});
        }
      }
    } catch {
      /* no legacy */
    }
  }
  if (blobConfigured()) {
    try {
      await writeBrainToBlob(empty);
    } catch {
      /* ignore */
    }
  }
  return notes.length;
}

function emptyBrainTemplate(): string {
  return `# Second Brain

_This is the default AI brain file. Upload markdown on /brain — each file’s name and content are added as sections here._

`;
}

/**
 * Replace BRAIN.md with a fresh merge of the uploaded notes.
 * Uploaded files themselves are not kept.
 */
export async function saveOwnerNotes(
  notes: Array<{ filename: string; raw: string }>
): Promise<{ documents: number; backend: OwnerBackend; path: string }> {
  const backend = ownerUploadBackend();
  if (backend === "none") {
    throw new Error(
      "No writable brain store. Use the Vercel Deploy button (auto-creates Blob) or run `npm run dev` locally."
    );
  }

  const sections = notes.map((n) => {
    const { data, content } = matter(n.raw);
    const filename = path.basename(n.filename).replace(/\.markdown$/i, ".md");
    const title =
      (typeof data.title === "string" && data.title) || filename.replace(/\.md$/i, "");
    return { filename, title, body: content.trim() };
  });

  const markdown = buildBrainMarkdown(sections);

  if (backend === "disk") {
    await fs.mkdir(OWNER_DIR, { recursive: true });
    await fs.mkdir(LEGACY_ROOT, { recursive: true });
    // Clear legacy per-file uploads so only BRAIN.md remains.
    try {
      const files = await fs.readdir(LEGACY_ROOT);
      for (const f of files) {
        if (f.endsWith(".md") || f === "_manifest.json") {
          await fs.unlink(path.join(LEGACY_ROOT, f)).catch(() => {});
        }
      }
    } catch {
      /* ignore */
    }
    await fs.writeFile(BRAIN_PATH, markdown, "utf8");
    return {
      documents: sections.length,
      backend: "disk",
      path: `content/knowledge/owner/${BRAIN_FILENAME}`,
    };
  }

  await writeBrainToBlob(markdown);
  // Drop any local owner .md so they can't shadow Blob on a later read.
  await wipeLocalOwnerMarkdown();
  return {
    documents: sections.length,
    backend: "blob",
    path: BRAIN_BLOB_PATH,
  };
}

export async function searchOwnerNotes(query: string, limit = 8) {
  const notes = await listOwnerNotes();
  return rankNotes(notes, query, limit);
}

/** Rank an arbitrary note list (used for browser-injected vaults too). */
export function rankNotes(notes: OwnerNote[], query: string, limit = 8) {
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
