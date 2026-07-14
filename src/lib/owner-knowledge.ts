/**
 * Local "owner" knowledge — markdown uploads that work WITHOUT Supabase.
 * Files live at content/knowledge/owner/knowledge/*.md and override the Danny
 * demo once any file is present (local / persistent disk only).
 */
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export const OWNER_CLIENT = "owner";
const ROOT = path.join(process.cwd(), "content", "knowledge", OWNER_CLIENT, "knowledge");

export type OwnerNote = {
  path: string;
  title: string;
  body: string;
  folder: string;
};

function writable(): boolean {
  // Serverless / read-only deploys cannot persist to the repo filesystem.
  if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  return true;
}

export function ownerKnowledgeWritable(): boolean {
  return writable();
}

export async function hasOwnerKnowledge(): Promise<boolean> {
  try {
    const files = await fs.readdir(ROOT);
    return files.some((f) => f.endsWith(".md"));
  } catch {
    return false;
  }
}

export async function listOwnerNotes(): Promise<OwnerNote[]> {
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
      const { data, content } = matter(raw);
      out.push({
        path: file,
        title: (typeof data.title === "string" && data.title) || file.replace(/\.md$/i, ""),
        body: content.trim(),
        folder: "owner",
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function clearOwnerKnowledge(): Promise<number> {
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

export async function saveOwnerNotes(
  notes: Array<{ filename: string; raw: string }>
): Promise<{ documents: number }> {
  if (!writable()) {
    throw new Error(
      "This host cannot write local files. Add Supabase for cloud vault uploads, or run locally."
    );
  }
  await fs.mkdir(ROOT, { recursive: true });
  await clearOwnerKnowledge();
  let documents = 0;
  for (const n of notes) {
    const safe = n.filename.replace(/[^a-zA-Z0-9._\-/]/g, "_").replace(/^\/+/, "");
    const base = path.basename(safe).endsWith(".md") ? path.basename(safe) : `${path.basename(safe)}.md`;
    await fs.writeFile(path.join(ROOT, base), n.raw, "utf8");
    documents++;
  }
  await fs.writeFile(
    path.join(ROOT, "_manifest.json"),
    JSON.stringify({ client: OWNER_CLIENT, count: documents, updatedAt: Date.now() }, null, 2),
    "utf8"
  );
  return { documents };
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
