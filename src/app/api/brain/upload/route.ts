import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_CLIENT } from "@/lib/client";
import { unzipBuffer } from "@/lib/unzip";
import {
  parseMarkdownNote,
  upsertVaultNotes,
  vaultBackendReady,
  getVaultStats,
  clearVault,
  type ParsedNote,
} from "@/lib/vault-supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/brain/upload
 * multipart/form-data with one or more files:
 *   - .md / .txt / .markdown notes
 *   - .zip of an Obsidian vault (or folder of markdown)
 * Optional field `folder` prefixes relative paths.
 * Optional field `replace` (default "1") — clears the vault first so uploads
 * fully replace any previous demo/Danny seed.
 *
 * POST /api/brain/upload?seed=1 — seed from content/knowledge/<client> (demo only)
 */
export async function POST(req: Request) {
  try {
    if (!vaultBackendReady()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then apply supabase/migrations.",
        },
        { status: 503 }
      );
    }

    const url = new URL(req.url);
    if (url.searchParams.get("seed") === "1") {
      const result = await seedFromKnowledge();
      const stats = await getVaultStats();
      return NextResponse.json({ ok: true, ...result, stats });
    }

    const form = await req.formData();
    const folderPrefix = String(form.get("folder") || "").replace(/\\/g, "/").replace(/^\/|\/$/g, "");
    // Default replace=1 so user uploads become the only brain — Danny demo is cleared.
    const replaceRaw = form.get("replace");
    const replace = replaceRaw == null ? true : String(replaceRaw) !== "0" && String(replaceRaw) !== "false";
    const files = form.getAll("files").filter((f): f is File => typeof f !== "string" && !!f);
    // also accept single `file`
    const single = form.get("file");
    if (single && typeof single !== "string") files.push(single);

    if (!files.length) {
      return NextResponse.json({ ok: false, error: "No files uploaded. Use field `files` or `file`." }, { status: 400 });
    }

    const notes: ParsedNote[] = [];
    for (const file of files) {
      const name = file.name || "note.md";
      const buf = Buffer.from(await file.arrayBuffer());
      const lower = name.toLowerCase();

      if (lower.endsWith(".zip")) {
        const entries = await unzipBuffer(buf);
        for (const e of entries) {
          if (!/\.(md|markdown|txt)$/i.test(e.path)) continue;
          if (e.path.includes("__MACOSX") || e.path.split("/").some((p) => p.startsWith("."))) continue;
          const rel = folderPrefix ? `${folderPrefix}/${e.path}` : e.path;
          notes.push(parseMarkdownNote(rel, e.data.toString("utf8")));
        }
      } else if (/\.(md|markdown|txt)$/i.test(lower)) {
        const rel = folderPrefix ? `${folderPrefix}/${name}` : name;
        notes.push(parseMarkdownNote(rel, buf.toString("utf8")));
      }
    }

    if (!notes.length) {
      return NextResponse.json(
        { ok: false, error: "No markdown notes found in upload. Send .md files or a .zip of them." },
        { status: 400 }
      );
    }

    let cleared = 0;
    if (replace) {
      cleared = await clearVault(APP_CLIENT);
    }

    const result = await upsertVaultNotes(notes, APP_CLIENT);
    const stats = await getVaultStats();
    return NextResponse.json({
      ok: true,
      uploaded: notes.length,
      replaced: replace,
      cleared,
      ...result,
      stats,
      client: APP_CLIENT,
    });
  } catch (err) {
    console.error("[brain/upload]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

async function seedFromKnowledge() {
  const root = path.join(process.cwd(), "content", "knowledge", APP_CLIENT);
  const notes: ParsedNote[] = [];

  async function walk(dir: string, base: string) {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith(".")) continue;
        await walk(full, base);
      } else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) {
        const raw = await fs.readFile(full, "utf8");
        const rel = path.relative(base, full).replace(/\\/g, "/");
        notes.push(parseMarkdownNote(rel, raw));
      }
    }
  }

  await walk(root, root);
  if (!notes.length) {
    throw new Error(`No markdown found under content/knowledge/${APP_CLIENT}`);
  }
  const result = await upsertVaultNotes(notes, APP_CLIENT);
  return { seeded: notes.length, ...result, source: `content/knowledge/${APP_CLIENT}` };
}
