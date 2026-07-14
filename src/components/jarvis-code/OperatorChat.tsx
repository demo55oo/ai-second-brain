"use client";

import { useCallback, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { PaperPlaneRight, Terminal, CheckCircle, XCircle, Wrench, Coins, Warning } from "@phosphor-icons/react";
import { drainAgentEvents, type ActionProposal } from "@/lib/jarvis-code/agent-events";
import { cn } from "@/lib/utils";

/**
 * The command-centre operator chat — powered by the user's Claude Code
 * subscription (`/api/jarvis-code/agent`, multi-turn via --resume). Reads run
 * instantly; writes surface an approval card, and approving resumes the session
 * so Claude executes the write via a connector.
 */

type ToolChip = { tool: string; detail?: string };
type Msg = { role: "user" | "assistant"; content: string; tools: ToolChip[]; proposals: ActionProposal[]; error?: string };

const RISK: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low risk", color: "#6ee7b7", bg: "rgba(52,211,153,0.12)" },
  medium: { label: "Medium risk", color: "#fcd34d", bg: "rgba(245,158,11,0.14)" },
  high: { label: "High risk", color: "#fca5a5", bg: "rgba(244,63,94,0.16)" },
};

const SUGGESTIONS = [
  "What's on my calendar today and what should I prep?",
  "Summarise my latest LinkedIn engagement",
  "Draft a reply to my most recent important email",
  "Find 20 SaaS founders in London for outreach",
];

export default function OperatorChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cost, setCost] = useState<number | undefined>();
  const sessionRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const patchLast = (fn: (m: Msg) => Msg) =>
    setMessages((ms) => {
      const copy = [...ms];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      setMessages((ms) => [...ms, { role: "user", content: t, tools: [], proposals: [] }, { role: "assistant", content: "", tools: [], proposals: [] }]);
      setInput("");
      setBusy(true);
      const ac = new AbortController();
      abortRef.current = ac;
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));

      try {
        const res = await fetch("/api/jarvis-code/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: t, sessionId: sessionRef.current }),
          signal: ac.signal,
        });
        if (!res.body) throw new Error("no stream");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const { events, rest } = drainAgentEvents(buf);
          buf = rest;
          for (const e of events) {
            if (e.type === "session") sessionRef.current = e.sessionId;
            else if (e.type === "text") patchLast((m) => ({ ...m, content: m.content + (m.content ? "\n\n" : "") + e.text }));
            else if (e.type === "tool") patchLast((m) => ({ ...m, tools: [...m.tools, { tool: e.tool, detail: e.detail }] }));
            else if (e.type === "proposal") patchLast((m) => ({ ...m, proposals: [...m.proposals, e.proposal] }));
            else if (e.type === "done") setCost(e.costUsd);
            else if (e.type === "error") patchLast((m) => ({ ...m, error: e.message }));
          }
          requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9 }));
        }
      } catch (err) {
        if (!ac.signal.aborted) patchLast((m) => ({ ...m, error: err instanceof Error ? err.message : String(err) }));
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const approve = (p: ActionProposal) => send(`Approved. Execute this now, then confirm what happened: ${p.title}.`);
  const reject = (p: ActionProposal) => send(`Do not do that. Cancel the proposed action: ${p.title}.`);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-400/15 text-amber-300">
            <Terminal size={15} weight="bold" />
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-white">Operator</div>
            <div className="text-[10px] text-white/40">Claude Code · your subscription</div>
          </div>
        </div>
        {typeof cost === "number" && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-300/70">
            <Coins size={11} weight="fill" />${cost.toFixed(3)}
          </span>
        )}
      </div>

      {/* transcript */}
      <div ref={scrollRef} data-lenis-prevent className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyState onPick={send} />
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-cyan-400/15 px-3.5 py-2 text-[13px] text-cyan-50">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="space-y-2">
                {m.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.tools.map((t, j) => (
                      <span key={j} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/55">
                        <Wrench size={10} weight="bold" className="text-amber-300/70" />
                        {t.tool}
                        {t.detail ? <span className="text-white/35">· {t.detail}</span> : null}
                      </span>
                    ))}
                  </div>
                )}
                {m.content && (
                  <div className="prose-invert max-w-none text-[13px] leading-relaxed text-white/85">
                    <Streamdown>{m.content}</Streamdown>
                  </div>
                )}
                {m.proposals.map((p, j) => (
                  <ApprovalCard key={j} p={p} busy={busy} onApprove={approve} onReject={reject} />
                ))}
                {m.error && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-500/[0.08] px-3 py-2 text-[11.5px] text-rose-200/90">
                    <Warning size={13} weight="fill" /> {m.error}
                  </div>
                )}
                {!m.content && !m.tools.length && !m.error && busy && i === messages.length - 1 && (
                  <div className="flex items-center gap-1.5 text-[12px] text-white/40">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" /> thinking on your subscription…
                  </div>
                )}
              </div>
            ),
          )
        )}
      </div>

      {/* composer */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#070b14]/80 px-3 py-2 focus-within:border-amber-300/40">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(input))}
            placeholder={busy ? "Working…" : "Ask your operator to do something…"}
            disabled={busy}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30 disabled:opacity-60"
          />
          <button
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400/90 text-[#1a1206] transition hover:bg-amber-300 disabled:bg-white/10 disabled:text-white/30"
          >
            <PaperPlaneRight size={15} weight="fill" />
          </button>
        </div>
        <div className="mt-1.5 px-1 text-[10px] text-white/30">Reads run instantly · writes always ask first.</div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
        <Terminal size={24} weight="duotone" />
      </span>
      <div>
        <div className="text-[14px] font-semibold text-white">Your command centre</div>
        <div className="mt-1 text-[12px] text-white/45">Ask across your connected tools and second brain. It runs on your Claude Code subscription.</div>
      </div>
      <div className="flex flex-col gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white/70 transition hover:border-amber-300/40 hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({ p, busy, onApprove, onReject }: { p: ActionProposal; busy: boolean; onApprove: (p: ActionProposal) => void; onReject: (p: ActionProposal) => void }) {
  const r = RISK[p.risk || "low"] ?? RISK.low;
  return (
    <div className="rounded-xl border border-amber-300/30 bg-amber-400/[0.06] p-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
          {p.app ? `${p.app} · ` : ""}
          {p.action || "Action"}
        </div>
        <span className="rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: r.color, background: r.bg }}>
          {r.label}
        </span>
      </div>
      <div className="text-[13px] font-semibold text-white">{p.title}</div>
      <div className="mt-1 text-[12px] leading-snug text-white/70">{p.summary}</div>
      {p.details && p.details.length > 0 && (
        <div className="mt-2 space-y-1 rounded-lg bg-black/25 p-2">
          {p.details.map((d, i) => (
            <div key={i} className="flex gap-2 text-[11.5px]">
              <span className="shrink-0 text-white/40">{d.label}</span>
              <span className="truncate text-white/80">{d.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onApprove(p)}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-400/90 px-3 py-2 text-[12px] font-semibold text-[#04140c] transition hover:bg-emerald-300 disabled:opacity-40"
        >
          <CheckCircle size={14} weight="fill" /> Approve & run
        </button>
        <button
          onClick={() => onReject(p)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-[12px] text-white/70 transition hover:border-rose-400/50 hover:text-white disabled:opacity-40"
        >
          <XCircle size={14} weight="bold" /> Decline
        </button>
      </div>
    </div>
  );
}
