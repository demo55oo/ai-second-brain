import { NextResponse } from "next/server";
import { hybridSearch } from "@/lib/vault";
import { hasOwnerKnowledge, rankNotes, searchOwnerNotes } from "@/lib/owner-knowledge";
import { hasUserVault } from "@/lib/vault-supabase";

export const runtime = "nodejs";

/**
 * POST /api/brain/search
 * Body: { query: string, limit?: number, notes?: BrowserNote[] }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      query: string;
      limit?: number;
      notes?: Array<{ path: string; title: string; body: string; folder?: string }>;
    };
    const { query, limit = 8, notes } = body;
    if (!query) return NextResponse.json({ error: "missing query" }, { status: 400 });
    const lim = Math.min(20, Math.max(1, limit));

    if (await hasUserVault()) {
      const results = await hybridSearch(query, lim);
      return NextResponse.json({ ok: true, results, source: "supabase" });
    }
    if (await hasOwnerKnowledge()) {
      const results = await searchOwnerNotes(query, lim);
      return NextResponse.json({ ok: true, results, source: "local" });
    }

    if (Array.isArray(notes) && notes.length > 0) {
      const mapped = notes
        .filter((n) => n && typeof n.title === "string" && typeof n.body === "string")
        .slice(0, 40)
        .map((n) => ({
          path: String(n.path || `${n.title}.md`),
          title: String(n.title).slice(0, 200),
          body: String(n.body).slice(0, 20000),
          folder: n.folder ? String(n.folder) : "owner",
        }));
      const results = rankNotes(mapped, query, lim);
      return NextResponse.json({ ok: true, results, source: "browser" });
    }

    const results = await hybridSearch(query, lim);
    return NextResponse.json({ ok: true, results, source: "fallback" });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
