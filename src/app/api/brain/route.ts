import { NextResponse } from "next/server";
import { APP_CLIENT } from "@/lib/client";
import { buildVaultGraph, getVaultStats, vaultBackendReady } from "@/lib/vault-supabase";
import {
  hasOwnerKnowledge,
  listOwnerNotes,
  ownerKnowledgeWritable,
} from "@/lib/owner-knowledge";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/brain — status + graph for /brain page and BrainOrb.
 * Chat never requires Supabase; uploads use Supabase when set, else local owner folder.
 */
export async function GET() {
  try {
    const ownerLocal = await hasOwnerKnowledge();
    const ownerNotes = ownerLocal ? await listOwnerNotes() : [];
    const supabaseOk = vaultBackendReady();

    if (supabaseOk) {
      const [stats, graph] = await Promise.all([getVaultStats(), buildVaultGraph()]);
      const hasVault = stats.documents > 0;
      return NextResponse.json({
        ok: true,
        client: APP_CLIENT,
        configured: true,
        uploadMode: "supabase",
        provider: "Supabase vault",
        canUpload: true,
        hasUserBrain: hasVault || ownerLocal,
        stats: {
          documents: stats.documents || ownerNotes.length,
          chunks: stats.chunks,
          folders: stats.folders || (ownerLocal ? 1 : 0),
          links: graph.links?.length ?? 0,
        },
        sample: (graph.nodes || []).slice(0, 8).map((n) => ({
          title: n.name,
          folder: n.folder,
          links: n.degree,
        })),
        graph,
        hint: hasVault
          ? "Your uploaded vault is active — Danny demo is off."
          : "Upload markdown or a .zip to replace the Danny demo.",
      });
    }

    // No Supabase — chat still works; local upload if filesystem is writable.
    return NextResponse.json({
      ok: true,
      client: ownerLocal ? "owner" : APP_CLIENT,
      configured: true,
      uploadMode: ownerKnowledgeWritable() ? "local" : "none",
      provider: ownerLocal
        ? "Local owner knowledge"
        : "Bundled demo knowledge (no Supabase)",
      canUpload: ownerKnowledgeWritable(),
      hasUserBrain: ownerLocal,
      stats: {
        documents: ownerNotes.length,
        chunks: ownerNotes.length,
        folders: ownerLocal ? 1 : 0,
        links: 0,
      },
      sample: ownerNotes.slice(0, 8).map((n) => ({
        title: n.title,
        folder: n.folder,
        links: 0,
      })),
      graph: { nodes: [], links: [], folders: [] },
      hint: ownerKnowledgeWritable()
        ? ownerLocal
          ? "Your local uploads are active — Danny demo is off."
          : "Upload .md / .zip here to replace Danny (saved locally). Supabase not required."
        : "Chat works without Supabase. Cloud uploads need Supabase env keys (optional).",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
