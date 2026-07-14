import { NextResponse } from "next/server";
import { CONNECTOR_CATALOG } from "@/lib/jarvis-code/catalog";
import { readRegisteredServers, mcpList, type McpStatus } from "@/lib/jarvis-code/mcp-cli";

export const runtime = "nodejs";

/**
 * GET /api/jarvis-code/connectors/catalog — the one-click connector catalog
 * merged with live state. Registration is read from ~/.claude.json (instant);
 * health (`?health=1`) additionally runs `claude mcp list` to distinguish
 * connected vs needs-auth vs failed. The UI loads registration first, then
 * upgrades to health in the background so the grid never blocks on a slow probe.
 */
export async function GET(req: Request) {
  const withHealth = new URL(req.url).searchParams.get("health") === "1";
  const registered = readRegisteredServers();

  let health: Record<string, McpStatus> = {};
  if (withHealth) {
    try {
      for (const e of await mcpList(15000)) health[e.id] = e.status;
    } catch {
      health = {};
    }
  }

  const connectors = CONNECTOR_CATALOG.map((c) => {
    const isReg = c.id in registered;
    const status: "connected" | "needs-auth" | "failed" | "disconnected" = !isReg
      ? "disconnected"
      : health[c.id] ?? (withHealth ? "needs-auth" : "connected");
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      blurb: c.blurb,
      toolsHint: c.toolsHint,
      accent: c.accent,
      auth: c.auth,
      url: c.url,
      registered: isReg,
      status,
      connected: status === "connected",
    };
  });

  return NextResponse.json({ connectors, checkedHealth: withHealth });
}
