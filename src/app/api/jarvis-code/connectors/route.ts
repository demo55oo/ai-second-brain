import { NextResponse } from "next/server";
import { listConnectorsMasked, setEnabled, upsertCustom, removeCustom, type Connector } from "@/lib/jarvis-code/connectors";

export const runtime = "nodejs";

/**
 * Dashboard-managed MCP connectors. GET lists them (tokens masked); POST toggles
 * / adds / removes. The run engine reads the ENABLED ones and passes them to
 * `claude -p --mcp-config`, so connecting a new MCP instantly expands what the
 * Claude-Code cockpit can do.
 */
export async function GET() {
  return NextResponse.json({ connectors: listConnectorsMasked() });
}

type PostBody =
  | { action: "toggle"; id: string; enabled: boolean }
  | { action: "upsert"; connector: Partial<Connector> & { id: string } }
  | { action: "remove"; id: string };

export async function POST(req: Request) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  try {
    if (body.action === "toggle") {
      setEnabled(body.id, body.enabled);
    } else if (body.action === "upsert") {
      if (!body.connector?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
      upsertCustom(body.connector);
    } else if (body.action === "remove") {
      removeCustom(body.id);
    } else {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, connectors: listConnectorsMasked() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
