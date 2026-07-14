"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { ArrowLeft, Brain, Graph, CircleNotch, UploadSimple } from "@phosphor-icons/react";
import type { BrainGraph as GraphData } from "@/lib/vault";

/**
 * /brain/graph — the founder's whole vault as the same cinematic "Synaptic Bloom"
 * network the stage demo uses, but built from Supabase: nodes = notes, edges =
 * the [[wikilinks]] between them. Reuses the BrainGraph canvas in live mode.
 */

// Heavy canvas component — client-only.
const BrainGraph = dynamic(() => import("@/components/BrainGraph"), { ssr: false });

type Stats = { notes: number; links: number; folders: number };

export default function VaultGraphPage() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/brain/vault/graph");
        const data = await res.json();
        setGraph(data.graph ?? null);
        setStats(data.stats ?? null);
      } catch {
        setGraph(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const hasNodes = (graph?.nodes?.length ?? 0) > 0;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#02040a] text-white">
      {/* the graph fills the screen */}
      <div className="absolute inset-0">
        {hasNodes && <BrainGraph data={graph} />}
      </div>

      {/* top-left controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-5">
        <div className="pointer-events-auto flex items-center gap-3">
          <Link href="/brain" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-white/60 backdrop-blur transition hover:border-violet-300/40 hover:text-white" title="Back to the brain">
            <ArrowLeft size={16} weight="bold" />
          </Link>
          <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 backdrop-blur-xl">
            <Brain size={18} weight="duotone" className="text-violet-300" />
            <div>
              <div className="text-[12.5px] font-semibold leading-tight text-white">Knowledge graph</div>
              <div className="text-[10px] text-white/40">Your vault · {stats?.links ?? 0} connections</div>
            </div>
          </div>
        </div>

        {/* stats HUD */}
        {hasNodes && stats && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-xl">
            <HudStat label="notes" value={stats.notes} color="#a78bfa" />
            <span className="h-6 w-px bg-white/10" />
            <HudStat label="links" value={stats.links} color="#22d3ee" />
            <span className="h-6 w-px bg-white/10" />
            <HudStat label="folders" value={stats.folders} color="#34d399" />
          </motion.div>
        )}
      </div>

      {/* hint */}
      {hasNodes && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-4 py-1.5 text-[11px] text-white/45 backdrop-blur">
          drag a node · scroll to zoom · hover to trace its connections · double-click to fit
        </div>
      )}

      {/* loading / empty states */}
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
          <CircleNotch size={30} className="animate-spin text-violet-300" />
          <div className="text-[13px] text-white/50">Building your knowledge graph…</div>
        </div>
      )}
      {!loading && !hasNodes && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/40">
            <Graph size={30} weight="duotone" />
          </div>
          <div>
            <div className="text-[16px] font-semibold text-white">No graph yet</div>
            <div className="mt-1 text-[12.5px] text-white/45">Upload an Obsidian vault and its notes + links become this graph.</div>
          </div>
          <Link href="/brain" className="flex items-center gap-2 rounded-xl border border-violet-300/40 bg-violet-400/15 px-4 py-2.5 text-[13px] font-medium text-violet-50 transition hover:bg-violet-400/25">
            <UploadSimple size={16} weight="bold" />
            Upload your vault
          </Link>
        </div>
      )}
    </div>
  );
}

function HudStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="px-1.5 text-center">
      <div className="text-[15px] font-bold leading-none tabular-nums text-white" style={{ textShadow: `0 0 16px ${color}55` }}>
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wider text-white/35">{label}</div>
    </div>
  );
}
