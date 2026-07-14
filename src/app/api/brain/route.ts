import { NextResponse } from "next/server";
import { APP_CLIENT } from "@/lib/client";
import { buildVaultGraph, getVaultStats, vaultBackendReady } from "@/lib/vault-supabase";
import {
  blobConfigured,
  hasOwnerKnowledge,
  listOwnerNotes,
  ownerKnowledgeWritable,
  ownerUploadBackend,
  BRAIN_BLOB_PATH,
} from "@/lib/owner-knowledge";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/brain — status + graph for /brain page and BrainOrb.
 */
export async function GET() {
  try {
    const ownerLocal = await hasOwnerKnowledge();
    const ownerNotes = ownerLocal ? await listOwnerNotes() : [];
    const supabaseOk = vaultBackendReady();
    const backend = ownerUploadBackend();
    const hasBlob = blobConfigured();

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
        blobReady: hasBlob,
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

    const canWrite = ownerKnowledgeWritable();
    const provider =
      backend === "blob"
        ? ownerLocal
          ? "Vercel Blob (BRAIN.md)"
          : "Vercel Blob ready — upload merges into BRAIN.md"
        : backend === "disk"
          ? ownerLocal
            ? "BRAIN.md on disk"
            : "Ready — uploads merge into BRAIN.md"
          : "No Blob yet — browser fallback (re-deploy with the Vercel button to auto-create Blob)";

    return NextResponse.json({
      ok: true,
      client: ownerLocal ? "owner" : APP_CLIENT,
      configured: true,
      uploadMode: backend === "none" ? "browser" : backend,
      provider,
      canUpload: true,
      diskWritable: backend === "disk",
      blobReady: hasBlob,
      hasUserBrain: ownerLocal,
      brainFile: backend === "blob" ? BRAIN_BLOB_PATH : "content/knowledge/owner/BRAIN.md",
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
      hint: ownerLocal
        ? backend === "blob"
          ? "Your BRAIN.md in Vercel Blob is active — Danny demo is off."
          : "Your BRAIN.md is active — Danny demo is off. Uploads merge into that one file."
        : canWrite
          ? backend === "blob"
            ? "Upload .md / .zip — merged into one BRAIN.md in Blob (token was auto-injected; no paste)."
            : "Upload .md / .zip — each file’s name + content merges into content/knowledge/owner/BRAIN.md."
          : "No Blob on this project. Use the Deploy with Vercel button (creates Blob automatically), or run locally. Until then, uploads stay in this browser.",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
