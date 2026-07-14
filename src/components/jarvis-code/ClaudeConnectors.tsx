"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lightning, CheckCircle, CircleNotch, ArrowSquareOut, X, Plugs, PlugsConnected, ArrowClockwise } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * The one-click "Claude Connectors" catalog. Clicking Connect runs the OAuth flow
 * ENTIRELY on the backend via the `claude mcp` CLI: it registers the server and
 * runs `claude mcp login`, which auto-opens the user's browser. We stream that
 * flow's progress here (opening browser → waiting → connected) and surface the
 * auth URL as a fallback link. Connected servers register at user scope, so KRONOS
 * gains their tools on the next run automatically.
 */

type Catalog = {
  id: string;
  name: string;
  category: string;
  blurb: string;
  toolsHint: string;
  accent: string;
  auth: "oauth" | "open";
  url: string;
  registered: boolean;
  status: "connected" | "needs-auth" | "failed" | "disconnected";
  connected: boolean;
};

type Flow = { phase: "start" | "registered" | "browser" | "log" | "connected" | "error"; message?: string; url?: string };

const PHASE_LABEL: Record<Flow["phase"], string> = {
  start: "Preparing…",
  registered: "Opening your browser…",
  browser: "Waiting for you to sign in…",
  log: "Working…",
  connected: "Connected",
  error: "Failed",
};

function openExternal(url: string) {
  const w = window as unknown as { jarvisSetup?: { openExternal?: (u: string) => void } };
  if (w.jarvisSetup?.openExternal) w.jarvisSetup.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function ClaudeConnectors() {
  const [items, setItems] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [flows, setFlows] = useState<Record<string, Flow>>({});
  const aborters = useRef<Record<string, AbortController>>({});

  const load = useCallback(async (health = false) => {
    try {
      const r = await fetch(`/api/jarvis-code/connectors/catalog${health ? "?health=1" : ""}`);
      const j = await r.json();
      if (Array.isArray(j.connectors)) setItems(j.connectors);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // fast registration-only paint, then refine with a health probe in the background
    load(false).then(() => load(true));
  }, [load]);

  const setFlow = (id: string, f: Flow | null) =>
    setFlows((prev) => {
      const next = { ...prev };
      if (f) next[id] = f;
      else delete next[id];
      return next;
    });

  const connect = useCallback(
    async (c: Catalog) => {
      aborters.current[c.id]?.abort();
      const ac = new AbortController();
      aborters.current[c.id] = ac;
      setFlow(c.id, { phase: "start" });
      try {
        const res = await fetch("/api/jarvis-code/connectors/connect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: c.id }),
          signal: ac.signal,
        });
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no stream");
        const dec = new TextDecoder();
        let buf = "";
        let last: Flow = { phase: "start" };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let ev: Flow & { phase: string };
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.phase === "browser" && ev.url) {
              last = { phase: "browser", url: ev.url };
              setFlow(c.id, last);
            } else if (ev.phase === "connected") {
              last = { phase: "connected" };
            } else if (ev.phase === "error") {
              last = { phase: "error", message: ev.message };
              setFlow(c.id, last);
            } else if (ev.phase === "registered") {
              last = { phase: "registered", url: last.url };
              setFlow(c.id, last);
            } else if (ev.phase === "log" && ev.message) {
              setFlow(c.id, { ...last, message: ev.message });
            }
          }
        }
        if (last.phase === "connected") {
          setFlow(c.id, null);
          await load(true);
        } else if (last.phase !== "error") {
          // stream ended without a terminal event → re-check status
          setFlow(c.id, null);
          await load(true);
        }
      } catch (err) {
        if (!ac.signal.aborted) setFlow(c.id, { phase: "error", message: (err as Error)?.message ?? "connect failed" });
        else setFlow(c.id, null);
      } finally {
        delete aborters.current[c.id];
      }
    },
    [load],
  );

  const cancel = (id: string) => {
    aborters.current[id]?.abort();
    setFlow(id, null);
  };

  const disconnect = useCallback(
    async (c: Catalog) => {
      setFlow(c.id, { phase: "log", message: "Disconnecting…" });
      try {
        await fetch("/api/jarvis-code/connectors/disconnect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: c.id }),
        });
      } finally {
        setFlow(c.id, null);
        await load(true);
      }
    },
    [load],
  );

  const connectedCount = items.filter((c) => c.connected).length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-400/15 text-violet-300">
            <Lightning size={15} weight="fill" />
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-white">Claude Connectors</div>
            <div className="text-[10px] text-white/40">
              {connectedCount} connected · one-click OAuth, opens in your browser
            </div>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          className="grid h-7 w-7 place-items-center rounded-lg border border-white/12 text-white/50 transition hover:text-white"
          title="Refresh status"
        >
          <ArrowClockwise size={13} weight="bold" className={cn(loading && "animate-spin")} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {loading && items.length === 0 &&
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[104px] animate-pulse rounded-xl border border-white/8 bg-white/[0.02]" />)}

        {items.map((c) => {
          const flow = flows[c.id];
          const busy = !!flow && flow.phase !== "error";
          return (
            <div
              key={c.id}
              className={cn(
                "relative flex min-h-[104px] flex-col rounded-xl border p-3 transition",
                c.connected ? "border-emerald-400/25 bg-emerald-400/[0.04]" : "border-white/8 bg-white/[0.02] hover:border-white/15",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10" style={{ background: c.accent }} />
                  <span className="text-[12.5px] font-semibold text-white">{c.name}</span>
                </div>
                {c.connected && <CheckCircle size={15} weight="fill" className="text-emerald-400" />}
              </div>
              <div className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-white/45">{c.blurb}</div>

              <div className="mt-auto pt-2.5">
                {flow ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[10.5px]">
                      {flow.phase === "error" ? (
                        <span className="font-medium text-rose-300">{PHASE_LABEL.error}</span>
                      ) : (
                        <>
                          <CircleNotch size={12} weight="bold" className="animate-spin text-violet-300" />
                          <span className="text-violet-200/90">{PHASE_LABEL[flow.phase]}</span>
                        </>
                      )}
                    </div>
                    {flow.phase === "error" && flow.message && (
                      <div className="line-clamp-2 text-[9.5px] text-rose-300/70">{flow.message}</div>
                    )}
                    {flow.url && flow.phase !== "error" && (
                      <button onClick={() => openExternal(flow.url!)} className="flex items-center gap-1 text-[10px] text-cyan-300 underline-offset-2 hover:underline">
                        <ArrowSquareOut size={11} weight="bold" /> Didn&apos;t open? Sign in here
                      </button>
                    )}
                    <div className="flex gap-2 pt-0.5">
                      {flow.phase === "error" ? (
                        <button onClick={() => connect(c)} className="text-[10px] font-semibold text-white/70 hover:text-white">Retry</button>
                      ) : (
                        <button onClick={() => cancel(c.id)} className="flex items-center gap-0.5 text-[10px] text-white/40 hover:text-white/70">
                          <X size={10} weight="bold" /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ) : c.connected ? (
                  <button
                    onClick={() => disconnect(c)}
                    disabled={busy}
                    className="flex items-center gap-1 text-[10.5px] font-medium text-white/45 transition hover:text-rose-300"
                  >
                    <Plugs size={12} weight="bold" /> Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => connect(c)}
                    className={cn(
                      "flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition",
                      c.status === "needs-auth"
                        ? "bg-amber-400/90 text-[#1a1204] hover:bg-amber-300"
                        : "bg-white/[0.06] text-white/80 ring-1 ring-white/10 hover:bg-violet-400/90 hover:text-[#0c0518] hover:ring-transparent",
                    )}
                  >
                    <PlugsConnected size={13} weight="bold" /> {c.status === "needs-auth" ? "Reconnect" : "Connect"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
