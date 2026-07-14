import { NextResponse } from "next/server";
import { catalogById } from "@/lib/jarvis-code/catalog";
import { mcpLogout, mcpRemove } from "@/lib/jarvis-code/mcp-cli";

export const runtime = "nodejs";

/**
 * POST /api/jarvis-code/connectors/disconnect  { id }
 * Clears the stored OAuth credentials and unregisters the server, so it stops
 * loading into `claude -p` runs.
 */
export async function POST(req: Request) {
  let id = "";
  try {
    id = String(((await req.json()) as { id?: string }).id ?? "").trim();
  } catch {
    /* handled below */
  }
  if (!id || !catalogById(id)) return NextResponse.json({ error: "unknown connector" }, { status: 400 });

  // logout first (best-effort — token may already be gone), then remove.
  try {
    await mcpLogout(id);
  } catch {
    /* ignore */
  }
  const rm = await mcpRemove(id);
  return NextResponse.json({ ok: rm.code === 0, id });
}
