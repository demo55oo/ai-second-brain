import { NextResponse } from "next/server";
import { catalogById } from "@/lib/jarvis-code/catalog";
import { mcpAddUser, spawnMcpLogin, isRegistered, mcpStatusOf } from "@/lib/jarvis-code/mcp-cli";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/jarvis-code/connectors/connect  { id }
 *
 * The one-click connect flow, streamed as NDJSON. It registers the catalog
 * server at user scope, then runs `claude mcp login`, which OPENS THE USER'S
 * BROWSER and completes the OAuth loopback on its own. We forward progress —
 * including the auth URL (as a fallback link) and the final connected/error —
 * so the card can narrate "opening browser → waiting → connected". User-scope
 * registration means the connector then auto-loads into every `claude -p` run.
 */

type Phase =
  | { phase: "start"; id: string; name: string }
  | { phase: "registered" }
  | { phase: "browser"; url: string }
  | { phase: "log"; message: string }
  | { phase: "connected" }
  | { phase: "error"; message: string };

const LOGIN_TIMEOUT_MS = 210_000; // OAuth can take a while (user signs in)
const URL_RE = /(https?:\/\/[^\s'"]+)/;
// Strip terminal noise the PTY echoes: OSC hyperlinks (Claude wraps the auth URL
// in one), CSI escapes, then stray control chars.
const clean = (s: string) =>
  s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC 8 hyperlink (BEL or ST terminated)
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "") // CSI
    .replace(/[\x00-\x08\x0b-\x1f]/g, "")
    .trim();

// The login output prints two kinds of URL: the provider's authorize page (what
// the user should click) and the local loopback callback (an implementation
// detail). Only the former belongs in the "Sign in here" fallback link.
const isLoopback = (u: string): boolean => {
  try {
    const h = new URL(u).hostname.replace(/[[\]]/g, "");
    return h === "localhost" || h === "::1" || h === "0.0.0.0" || /^127\./.test(h);
  } catch {
    return true;
  }
};

export async function POST(req: Request) {
  let id = "";
  try {
    id = String(((await req.json()) as { id?: string }).id ?? "").trim();
  } catch {
    /* handled below */
  }
  const entry = id ? catalogById(id) : undefined;
  if (!entry) return NextResponse.json({ error: "unknown connector" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: Phase) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      emit({ phase: "start", id: entry.id, name: entry.name });

      // 1) Register at user scope (idempotent).
      try {
        const add = await mcpAddUser(entry.id, entry.url, entry.transport);
        if (add && add.code !== 0 && !isRegistered(entry.id)) {
          emit({ phase: "error", message: (add.stderr || add.stdout || "could not register server").trim().split("\n").slice(-2).join(" ") });
          close();
          return;
        }
      } catch (err) {
        emit({ phase: "error", message: `register failed: ${(err as Error)?.message ?? err}` });
        close();
        return;
      }
      emit({ phase: "registered" });

      // 2) Open-auth servers need no login — registration is enough.
      if (entry.auth === "open") {
        emit({ phase: "connected" });
        close();
        return;
      }

      // 3) OAuth: `claude mcp login` opens the browser and self-completes.
      let child: ReturnType<typeof spawnMcpLogin>;
      try {
        child = spawnMcpLogin(entry.id);
      } catch (err) {
        emit({ phase: "error", message: `could not start login: ${(err as Error)?.message ?? err}` });
        close();
        return;
      }

      let sentBrowser = false;
      let tail = "";
      const onChunk = (buf: Buffer) => {
        const text = buf.toString("utf8");
        for (const rawLine of text.split(/[\r\n]+/)) {
          const line = clean(rawLine);
          if (!line) continue;
          tail = (tail + "\n" + line).slice(-1200);
          const m = line.match(URL_RE);
          if (m && !sentBrowser && !isLoopback(m[1])) {
            sentBrowser = true;
            emit({ phase: "browser", url: m[1] });
          }
          // keep the noise low: only forward human-meaningful lines
          if (!m && /wait|browser|author|success|connect|complet|sign/i.test(line)) {
            emit({ phase: "log", message: line.slice(0, 160) });
          }
        }
      };
      child.stdout?.on("data", onChunk);
      child.stderr?.on("data", onChunk);

      const timer = setTimeout(() => {
        emit({ phase: "error", message: "Timed out waiting for authorization. Close this and try again." });
        try {
          child.kill("SIGTERM");
        } catch {
          /* gone */
        }
        close();
      }, LOGIN_TIMEOUT_MS);

      child.on("error", (err) => {
        clearTimeout(timer);
        emit({ phase: "error", message: `login failed: ${err.message}` });
        close();
      });
      // Don't trust the exit code (the `script` PTY wrapper can mask it) — verify
      // authoritatively with a health check on the just-authed server.
      child.on("close", async () => {
        clearTimeout(timer);
        if (closed) return;
        let status: string;
        try {
          status = await mcpStatusOf(entry.id);
        } catch {
          status = "missing";
        }
        if (status === "connected") emit({ phase: "connected" });
        else if (status === "needs-auth") emit({ phase: "error", message: "Authorization wasn't completed. Try again and finish signing in." });
        else emit({ phase: "error", message: tail.split("\n").slice(-2).join(" ").trim() || "Login did not complete." });
        close();
      });

      req.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        try {
          child.kill("SIGTERM");
        } catch {
          /* gone */
        }
        close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
