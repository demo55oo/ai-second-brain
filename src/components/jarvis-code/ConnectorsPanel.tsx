"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug, Plus, Trash, LinkSimple, CheckCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import ClaudeConnectors from "./ClaudeConnectors";

/**
 * Dashboard-managed MCP connectors. Toggle what Claude Code can reach, or add any
 * MCP server (URL + bearer token). Enabled connectors are passed to every run/chat
 * as --mcp-config, so connecting one instantly expands what the cockpit can do.
 */

type Connector = {
  id: string;
  name: string;
  transport: "http" | "sse" | "stdio";
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  source: "builtin" | "custom";
  description?: string;
  toolsHint?: string;
};

export default function ConnectorsPanel() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/jarvis-code/connectors");
      const j = await r.json();
      setConnectors(j.connectors || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: unknown, id?: string) => {
    if (id) setBusyId(id);
    try {
      const r = await fetch("/api/jarvis-code/connectors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.connectors) setConnectors(j.connectors);
    } finally {
      setBusyId(null);
    }
  };

  const toggle = (c: Connector) => post({ action: "toggle", id: c.id, enabled: !c.enabled }, c.id);
  const remove = (c: Connector) => post({ action: "remove", id: c.id }, c.id);

  const enabledCount = connectors.filter((c) => c.enabled).length;

  return (
    <div className="space-y-4">
      <ClaudeConnectors />

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-400/15 text-cyan-300">
            <Plug size={15} weight="bold" />
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-white">Custom &amp; token MCP</div>
            <div className="text-[10px] text-white/40">{enabledCount} enabled · any HTTP MCP server via URL + token</div>
          </div>
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/70 transition hover:border-cyan-300/40 hover:text-white"
        >
          <Plus size={12} weight="bold" /> Add MCP
        </button>
      </div>

      {adding && <AddForm onDone={() => setAdding(false)} onSubmit={(c) => post({ action: "upsert", connector: c }).then(() => setAdding(false))} />}

      <div className="space-y-2">
        {loading && <div className="py-6 text-center text-[12px] text-white/30">Loading connectors…</div>}
        {!loading && connectors.length === 0 && (
          <div className="py-6 text-center text-[12px] text-white/40">No connectors yet. Add an MCP server to let Claude scrape and act on anything.</div>
        )}
        {connectors.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", c.enabled ? "bg-cyan-400/15 text-cyan-300" : "bg-white/5 text-white/35")}>
              <LinkSimple size={15} weight="bold" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-semibold text-white">{c.name}</span>
                <span className="rounded px-1 py-px text-[8.5px] font-bold uppercase tracking-wide text-white/40 ring-1 ring-white/10">{c.source}</span>
              </div>
              <div className="truncate text-[10.5px] text-white/40">{c.toolsHint || c.description || c.url}</div>
            </div>
            {c.source === "custom" && (
              <button onClick={() => remove(c)} disabled={busyId === c.id} className="text-white/30 transition hover:text-rose-300" title="Remove">
                <Trash size={14} />
              </button>
            )}
            <Toggle on={c.enabled} busy={busyId === c.id} onClick={() => toggle(c)} />
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function Toggle({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50", on ? "bg-emerald-400/80" : "bg-white/12")}
      title={on ? "Enabled" : "Disabled"}
    >
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

function AddForm({ onSubmit, onDone }: { onSubmit: (c: Record<string, unknown>) => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");

  const submit = () => {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!id || !url.trim()) return;
    onSubmit({
      id,
      name: name.trim(),
      transport: "http",
      url: url.trim(),
      headers: token.trim() ? { Authorization: `Bearer ${token.trim()}` } : undefined,
      toolsHint: "Custom MCP connector",
    });
  };

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-cyan-300/20 bg-cyan-400/[0.04] p-3">
      <div className="text-[11px] font-semibold text-cyan-100/90">Add an MCP server (HTTP)</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Firecrawl)" className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-cyan-300/40" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL (https://…)" className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-cyan-300/40" />
      <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token (optional)" type="password" className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-cyan-300/40" />
      <div className="flex gap-2 pt-0.5">
        <button onClick={submit} disabled={!name.trim() || !url.trim()} className="flex items-center gap-1 rounded-lg bg-cyan-400/90 px-3 py-1.5 text-[11.5px] font-semibold text-[#04121a] transition hover:bg-cyan-300 disabled:bg-white/10 disabled:text-white/30">
          <CheckCircle size={13} weight="fill" /> Connect
        </button>
        <button onClick={onDone} className="rounded-lg border border-white/12 px-3 py-1.5 text-[11.5px] text-white/60 transition hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  );
}
