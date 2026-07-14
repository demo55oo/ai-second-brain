"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { childrenOf, node } from "@/lib/org";
import type { JarvisNodeId } from "@/lib/jarvis-events";
import JarvisIcon from "./JarvisIcon";
import type { JarvisRunState } from "./useJarvisRun";
import { cn } from "@/lib/utils";

type Phase = "staffing" | "working" | "running" | "complete";

type Row = {
  id: JarvisNodeId;
  status: string;
  phase: Phase;
  progress: number;
  chips: { id: JarvisNodeId; done: boolean; active: boolean }[];
};

const BADGE: Record<Phase, { label: string; tint: string }> = {
  staffing: { label: "Staffing", tint: "#94a3b8" },
  working: { label: "Working", tint: "#f59e0b" },
  running: { label: "Running", tint: "#22d3ee" },
  complete: { label: "Complete", tint: "#34d399" },
};

export default function MissionBoard({ state, onClose }: { state: JarvisRunState; onClose: () => void }) {
  const [tab, setTab] = useState<"all" | "active" | "complete">("all");

  const rows = useMemo<Row[]>(() => {
    const order: JarvisNodeId[] = [];
    const lastText: Partial<Record<JarvisNodeId, string>> = {};
    for (const f of state.feed) {
      if (!order.includes(f.node)) order.push(f.node);
      if (f.kind !== "report") lastText[f.node] = f.text;
    }
    return order.map((id) => {
      const ph = state.phases[id];
      let phase: Phase;
      if (ph === "done") phase = "complete";
      else if (state.active === id && state.running) phase = "running";
      else if (ph === "working") phase = "working";
      else phase = "staffing";
      const progress = phase === "complete" ? 100 : phase === "running" ? 66 : phase === "working" ? 90 : 14;
      const chips = childrenOf(id)
        .filter((c) => state.phases[c.id] || state.active === c.id)
        .map((c) => ({ id: c.id, done: state.phases[c.id] === "done", active: state.active === c.id }));
      return { id, status: lastText[id] ?? node(id).label, phase, progress, chips };
    });
  }, [state.feed, state.phases, state.active, state.running]);

  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.phase !== "complete").length,
    complete: rows.filter((r) => r.phase === "complete").length,
  };
  const shown = rows.filter((r) => (tab === "all" ? true : tab === "active" ? r.phase !== "complete" : r.phase === "complete"));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 12 }}
          transition={{ type: "spring", stiffness: 240, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#070b14]/95 shadow-2xl backdrop-blur-2xl"
        >
          {/* header */}
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[13px] font-semibold tracking-tight text-white">Mission Feed</div>
                <div className="text-[11px] text-white/40">Everything your CEO is running, end to end</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/[0.02] p-0.5">
                {(["all", "active", "complete"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition",
                      tab === t ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80",
                    )}
                  >
                    {t} <span className="text-white/30">{counts[t]}</span>
                  </button>
                ))}
              </div>
              <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-white/50 transition hover:bg-white/5 hover:text-white">
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>

          {/* rows */}
          <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {shown.length === 0 ? (
              <div className="grid h-40 place-items-center text-[13px] text-white/30">
                {rows.length === 0 ? "No missions yet. Give your CEO an instruction." : "Nothing here in this view."}
              </div>
            ) : (
              <div className="relative">
                {/* timeline spine */}
                <div className="absolute bottom-3 left-[26px] top-3 w-px bg-white/8" aria-hidden />
                <div className="flex flex-col gap-1.5">
                  {shown.map((r) => (
                    <MissionRow key={r.id} row={r} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      <style jsx global>{`
        @keyframes mb-shimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </AnimatePresence>
  );
}

function MissionRow({ row }: { row: Row }) {
  const n = node(row.id);
  const col = n.color;
  const badge = BADGE[row.phase];
  const live = row.phase === "running";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] py-2.5 pl-3 pr-4 transition-colors hover:border-white/12"
    >
      {/* timeline node */}
      <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `${col}1f`, color: col, boxShadow: live ? `0 0 14px ${col}88` : "none" }}>
        <JarvisIcon name={n.icon} size={14} weight="fill" />
      </span>

      {/* title + status */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-white">{n.title}</span>
          <span className="truncate text-[10px] uppercase tracking-wide text-white/30">{n.label}</span>
        </div>
        <div className="truncate text-[11.5px] text-white/50">{row.status}</div>
      </div>

      {/* sub-agent chips */}
      {row.chips.length > 0 && (
        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          {row.chips.map((c) => {
            const cn2 = node(c.id);
            return (
              <span
                key={c.id}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                style={{
                  borderColor: c.done || c.active ? `${cn2.color}66` : "rgba(255,255,255,0.08)",
                  color: c.done || c.active ? "#fff" : "rgba(255,255,255,0.5)",
                  background: c.done || c.active ? `${cn2.color}14` : "transparent",
                }}
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", c.active && "animate-pulse")}
                  style={{ background: c.done ? "#34d399" : c.active ? cn2.color : "rgba(255,255,255,0.25)" }}
                />
                {cn2.title}
              </span>
            );
          })}
        </div>
      )}

      {/* progress */}
      <div className="hidden w-[120px] shrink-0 sm:block">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-white/8">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
            style={{ width: `${row.progress}%`, background: row.phase === "complete" ? "#34d399" : col }}
          />
          {live && (
            <div
              className="absolute inset-y-0 w-1/3 rounded-full opacity-60"
              style={{ background: `linear-gradient(90deg, transparent, ${col}, transparent)`, animation: "mb-shimmer 1.4s linear infinite" }}
            />
          )}
        </div>
        <div className="mt-1 text-right text-[10px] tabular-nums text-white/35">{row.phase === "complete" ? "100%" : live ? "live" : `${row.progress}%`}</div>
      </div>

      {/* badge */}
      <span
        className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: `${badge.tint}1f`, color: badge.tint }}
      >
        {badge.label}
      </span>
    </motion.div>
  );
}
