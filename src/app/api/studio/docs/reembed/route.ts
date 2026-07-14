import { NextResponse } from "next/server";
import { APP_CLIENT } from "@/lib/client";
import { parseMarkdownNote, upsertVaultNotes, vaultBackendReady } from "@/lib/vault-supabase";
import { loadClientDocsForBrain } from "@/lib/client-knowledge";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/studio/docs/reembed — push one curated doc (or all) into the Supabase vault index.
 */
export async function POST(req: Request) {
  try {
    if (!vaultBackendReady()) {
      return NextResponse.json({
        ok: true,
        warning: "Supabase not configured — doc saved locally only. Set Supabase env + migrations to index.",
      });
    }

    let docType: string | undefined;
    try {
      const body = (await req.json()) as { docType?: string };
      docType = body.docType;
    } catch {
      /* reembed all */
    }

    const { docs } = await loadClientDocsForBrain();
    const selected = docType ? docs.filter((d) => d.docType === docType) : docs;
    if (!selected.length) {
      return NextResponse.json({ ok: false, error: "no documents to embed" }, { status: 404 });
    }

    const notes = selected.map((d) =>
      parseMarkdownNote(`knowledge/${d.docType}.md`, `---\ntitle: ${d.title}\n---\n\n${d.body}`)
    );
    const result = await upsertVaultNotes(notes, APP_CLIENT);
    return NextResponse.json({ ok: true, ...result, count: selected.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
