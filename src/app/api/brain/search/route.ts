import { NextResponse } from "next/server";
import { hybridSearch } from "@/lib/vault";
import { hasOwnerKnowledge, searchOwnerNotes } from "@/lib/owner-knowledge";
import { hasUserVault } from "@/lib/vault-supabase";

export const runtime = "nodejs";

/**
 * POST /api/brain/search
 * Body: { query: string, limit?: number }
 */
export async function POST(req: Request) {
  try {
    const { query, limit = 8 } = (await req.json()) as { query: string; limit?: number };
    if (!query) return NextResponse.json({ error: "missing query" }, { status: 400 });
    const lim = Math.min(20, Math.max(1, limit));

    // Prefer user vault (Supabase) or local owner uploads over Danny disk/blob.
    if (await hasUserVault()) {
      const results = await hybridSearch(query, lim);
      return NextResponse.json({ ok: true, results, source: "supabase" });
    }
    if (await hasOwnerKnowledge()) {
      const results = await searchOwnerNotes(query, lim);
      return NextResponse.json({ ok: true, results, source: "local" });
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
