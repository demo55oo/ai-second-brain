"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowsClockwise, Terminal, SquaresFour, CaretRight } from "@phosphor-icons/react";
import { Rise } from "@/components/dashboard/ui";
import { MeetingsPanel, StatBand } from "@/components/dashboard/panels";
import ConnectorsPanel from "@/components/jarvis-code/ConnectorsPanel";
import OperatorChat from "@/components/jarvis-code/OperatorChat";
import { BRAND } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import type { LinkedInMetrics } from "@/lib/linkedin-metrics";

/**
 * `/jarvis-code/dashboard` — the command centre for the Claude-Code cockpit.
 * Same live data as /jarvis/dashboard (LinkedIn engagement + connected-app
 * metrics), but the operator chat runs on the user's OWN Claude Code
 * subscription and the connectors panel controls what it can reach.
 */

type DashMeeting = { title: string; when: string; durationMins?: number | null; attendees?: number | null; platform?: string | null };
type LiveResp = {
  live: boolean;
  note?: string;
  linkedin?: LinkedInMetrics;
  data?: {
    kpis: { key: string; label: string; value: number; format: "currency" | "compact" | "number" | "percent"; delta: number; caption: string; source: string }[];
    miniStats: { label: string; value: string; delta: number }[];
    meetings: { upcoming: DashMeeting[]; last: DashMeeting | null };
  };
};

const MINI_COLORS = [BRAND.cyan, BRAND.amber, BRAND.emerald, BRAND.violet, BRAND.fuchsia, BRAND.sky];
const CACHE_KEY = "sb_jarvis_code_dash_v1";

export default function JarvisCodeDashboard() {
  const [resp, setResp] = useState<LiveResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/dashboard/data${refresh ? "?refresh=1" : ""}`);
      const j = (await r.json()) as LiveResp;
      setResp(j);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(j));
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        setResp(JSON.parse(cached));
        setLoading(false);
      }
    } catch {
      /* ignore */
    }
    load();
  }, [load]);

  const d = resp?.live ? resp.data : undefined;
  const li = resp?.linkedin;

  const liKpis = li
    ? [
        { key: "li_react", label: "LinkedIn reactions", value: li.reactions, format: "compact" as const, delta: 0, caption: `across ${li.posts} posts`, source: "LinkedIn", color: BRAND.fuchsia },
        { key: "li_comments", label: "LinkedIn comments", value: li.comments, format: "compact" as const, delta: 0, caption: "total", source: "LinkedIn", color: BRAND.violet },
        { key: "li_avg", label: "Avg engagement / post", value: li.avgEngagement, format: "number" as const, delta: 0, caption: "reactions + comments + reposts", source: "LinkedIn", color: BRAND.cyan },
        { key: "li_shares", label: "LinkedIn reposts", value: li.shares, format: "compact" as const, delta: 0, caption: "total", source: "LinkedIn", color: BRAND.amber },
      ]
    : [];
  const liveKpis = d?.kpis?.length ? d.kpis.map((k, i) => ({ ...k, color: MINI_COLORS[i % MINI_COLORS.length] })) : [];
  const heroKpis = liKpis.length ? (liveKpis.length ? [...liKpis.slice(0, 3), ...liveKpis].slice(0, 4) : liKpis.slice(0, 4)) : undefined;
  const meetings = d?.meetings;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#02040a] text-white">
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(130% 90% at 50% 0%, #070c18 0%, #02040a 55%, #010207 100%)" }} />
      <div className="blob-a pointer-events-none fixed -left-32 top-24 h-[420px] w-[420px] rounded-full bg-amber-500/[0.06] blur-[120px]" />
      <div className="blob-b pointer-events-none fixed -right-28 top-1/3 h-[460px] w-[460px] rounded-full bg-cyan-500/[0.07] blur-[130px]" />

      {/* header */}
      <header className="relative z-20 flex items-center justify-between border-b border-white/10 bg-[#02040a]/70 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link href="/jarvis-code" className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/60 transition hover:text-white">
            <ArrowLeft size={16} weight="bold" />
          </Link>
          <SquaresFour size={18} weight="duotone" className="text-amber-300" />
          <div className="leading-tight">
            <div className="text-[14px] font-bold tracking-tight">Command Centre</div>
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
              <Terminal size={10} weight="bold" /> Claude Code · your subscription
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11.5px] text-white/70 transition hover:text-white"
          >
            <ArrowsClockwise size={13} weight="bold" className={cn(loading && "animate-spin")} /> Refresh
          </button>
          <button
            onClick={() => setChatOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-400/[0.08] px-3 py-1.5 text-[11.5px] font-medium text-amber-100 transition hover:bg-amber-400/[0.16]"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" /> Operator
            <CaretRight size={12} weight="bold" className={cn("transition", chatOpen && "rotate-90")} />
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1">
        {/* LEFT — data + connectors */}
        <div data-lenis-prevent className="no-scrollbar min-w-0 flex-1 overflow-y-auto">
          <main className="mx-auto w-full max-w-[1120px] space-y-4 px-5 pb-14 pt-6 md:px-8">
            <Rise>
              <StatBand kpis={heroKpis} loading={loading && !li} />
            </Rise>

            <Rise delay={0.06}>
              <ConnectorsPanel />
            </Rise>

            <Rise delay={0.1}>
              <MeetingsPanel meetings={meetings} loading={loading && !d} />
            </Rise>

            {!resp?.live && (
              <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-[11.5px] text-white/40">
                {resp?.note || "Connected-app metrics are in demo mode. Connect Zapier (or another MCP) to go live."}
              </div>
            )}

            <p className="pt-2 text-center text-[10.5px] text-white/25">
              LinkedIn engagement is real · connected-app data flows through your enabled connectors · the operator runs on your Claude Code subscription.
            </p>
          </main>
        </div>

        {/* RIGHT — operator chat */}
        <aside
          className={cn(
            "relative hidden shrink-0 border-l border-white/10 bg-[#04070e]/60 backdrop-blur-xl transition-[width] duration-300 lg:block",
            chatOpen ? "w-[38%] min-w-[360px] max-w-[460px]" : "w-0 overflow-hidden border-l-0",
          )}
        >
          {chatOpen && <OperatorChat />}
        </aside>
      </div>
    </div>
  );
}
