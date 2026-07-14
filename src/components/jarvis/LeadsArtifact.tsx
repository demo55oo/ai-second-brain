"use client";

import { Fragment, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  DownloadSimple,
  Copy,
  Check,
  LinkedinLogo,
  Envelope,
  WarningCircle,
  CaretDown,
  Sparkle,
  SealCheck,
  Prohibit,
  Question,
  Flask,
  Table,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { LeadsArtifactData, LeadRow, LeadEmailStatus } from "@/lib/jarvis-events";
import { cn } from "@/lib/utils";
import { DeliverableEyebrow } from "./DeliverableEyebrow";

/**
 * The Leads deliverable — a high-end, live-streaming prospect table. Rows arrive
 * as they're scraped, then fill in as the enrichment protocol runs (email-status
 * badges + an expandable about/skills/latest-post detail). Tabs filter by All /
 * With email / Verified; a phase bar + skeleton rows show work in flight.
 */

const STATUS: Record<LeadEmailStatus, { color: string; label: string; Icon: typeof SealCheck }> = {
  valid: { color: "#34d399", label: "Verified", Icon: SealCheck },
  invalid: { color: "#fb7185", label: "Invalid", Icon: Prohibit },
  "catch-all": { color: "#fbbf24", label: "Catch-all", Icon: Question },
  disposable: { color: "#fb923c", label: "Disposable", Icon: WarningCircle },
  unknown: { color: "#94a3b8", label: "Unknown", Icon: Question },
};

const hasDetail = (l: LeadRow) => Boolean(l.about || l.skills?.length || l.recentActivity);

const LEAD_HEADER = ["Name", "Title", "Company", "Location", "Email", "Email Status", "LinkedIn URL", "Headline", "Recent Activity"];
const leadCells = (r: LeadRow) => [r.name, r.title, r.company, r.location, r.email, r.emailStatus ?? "", r.linkedinUrl, r.headline ?? "", r.recentActivity ?? ""];

function leadsToCsv(rows: LeadRow[]): string {
  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  return [LEAD_HEADER.join(","), ...rows.map((r) => leadCells(r).map((v) => esc(v ?? "")).join(","))].join("\n");
}

/** Tab-separated — pastes straight into Google Sheets columns (⌘V). */
function leadsToTsv(rows: LeadRow[]): string {
  const cell = (v: string) => (v ?? "").replace(/[\t\n\r]+/g, " ").trim();
  return [LEAD_HEADER.join("\t"), ...rows.map((r) => leadCells(r).map(cell).join("\t"))].join("\n");
}

type Tab = "all" | "email" | "verified";

export default function LeadsArtifact({ data }: { data: LeadsArtifactData }) {
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const accent = "#f59e0b";
  const phase = data.phase ?? "done";
  const streaming = phase !== "done";
  const rows = data.leads;

  const counts = {
    all: rows.length,
    email: rows.filter((r) => r.email).length,
    verified: rows.filter((r) => r.emailStatus === "valid").length,
  };
  const filtered = rows.filter((r) => (tab === "all" ? true : tab === "email" ? !!r.email : r.emailStatus === "valid"));
  const pending = streaming ? Math.max(0, Math.min((data.returned || 0) - rows.length, 6)) : 0;
  const isEnriched = (data.enriched ?? 0) > 0 || rows.some(hasDetail);

  const csv = useMemo(() => leadsToCsv(rows), [rows]);
  const keyOf = (r: LeadRow, i: number) => r.linkedinUrl || `${r.name}-${i}`;
  const toggle = (k: string) =>
    setOpen((p) => {
      const n = new Set(p);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };
  const downloadCsv = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prospects.csv";
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 1600);
  };

  // Open a fresh Google Sheet and copy the rows as TSV — the user just pastes (⌘V),
  // which lands cleanly in columns. Open the tab first (keeps it in the gesture),
  // then write the clipboard.
  const openInSheets = async () => {
    const win = window.open("https://sheets.new", "_blank");
    if (!win) {
      toast.message("Allow pop-ups, then click Sheets again");
      return;
    }
    try {
      await navigator.clipboard.writeText(leadsToTsv(rows));
      toast.success("Prospects copied — paste (⌘V / Ctrl+V) into the new sheet");
    } catch {
      toast.message("Sheet opened — use Copy CSV, then paste it in");
    }
  };

  const showTable = rows.length > 0 || pending > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 26 }} className="flex h-full flex-col">
      {/* header */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="min-w-0">
          <DeliverableEyebrow />
          <div className="mt-0.5 truncate text-[15px] font-semibold text-white">{data.title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {data.testMode && (
            <span className="flex items-center gap-1 rounded-md border border-violet-300/30 bg-violet-400/10 px-1.5 py-1 text-[10px] font-semibold text-violet-200" title="Mock data (LEADS_TEST_MODE)">
              <Flask size={12} weight="fill" /> TEST
            </span>
          )}
          {(data.verifiedEmail ?? 0) > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-emerald-400/15 px-2 py-1 text-[11px] font-semibold text-emerald-300">
              <SealCheck size={13} weight="fill" /> {data.verifiedEmail}
            </span>
          )}
          <span className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums" style={{ background: `${accent}1f`, color: accent }}>
            {rows.length}/{data.requested}
          </span>
        </div>
      </div>

      {/* phase / streaming bar */}
      {streaming && (
        <div className="shrink-0 border-b border-white/8 bg-white/[0.015] px-4 py-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 font-medium text-white/75">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: accent }} />
                <span className="relative h-2 w-2 rounded-full" style={{ background: accent }} />
              </span>
              {phase === "scraping" ? "Scraping LinkedIn" : "Enriching prospects"}…
            </span>
            <span className="font-mono tabular-nums text-white/40">
              {rows.length}/{data.returned || data.requested}
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${accent}aa, ${accent})` }}
              animate={{ width: `${data.returned ? Math.min(100, Math.round((rows.length / data.returned) * 100)) : 8}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      {/* tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-white/8 px-3 py-1.5">
        {([["all", "All"], ["email", "With email"], ["verified", "Verified"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition", tab === k ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80")}
          >
            {label}
            <span className="rounded bg-white/[0.06] px-1 text-[10px] tabular-nums text-white/50">{counts[k]}</span>
          </button>
        ))}
      </div>

      {/* scroll body */}
      <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto">
        {/* compact targeting brief */}
        <div className="border-b border-white/[0.05] px-4 py-2.5">
          <p className="text-[12.5px] leading-relaxed text-white/75">{data.icp}</p>
          {data.criteria.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.criteria.slice(0, 8).map((c, i) => (
                <span key={i} className="rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-2 py-0.5 text-[10.5px] text-amber-100/80">{c}</span>
              ))}
            </div>
          )}
        </div>

        {showTable ? (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#0a0d15] text-[10px] uppercase tracking-wide text-white/40 shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                <th className="px-3 py-2 font-semibold">Prospect</th>
                <th className="hidden px-3 py-2 font-semibold sm:table-cell">Company</th>
                <th className="px-3 py-2 font-semibold">Email</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => {
                const k = keyOf(l, i);
                const detail = hasDetail(l);
                const isOpen = open.has(k);
                const st = l.emailStatus ? STATUS[l.emailStatus] : null;
                return (
                  <Fragment key={k}>
                    <motion.tr layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 30 }} className="border-t border-white/[0.05] align-top hover:bg-white/[0.02]">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {detail && (
                            <button onClick={() => toggle(k)} className="text-white/35 transition hover:text-white" title="Enrichment detail">
                              <CaretDown size={12} weight="bold" className={cn("transition", isOpen && "rotate-180")} />
                            </button>
                          )}
                          <span className="text-[12.5px] font-semibold text-white">{l.name || "—"}</span>
                        </div>
                        <div className="text-[11px] text-white/55">{l.headline || l.title}</div>
                        {l.location && <div className="text-[10.5px] text-white/35">{l.location}</div>}
                      </td>
                      <td className="hidden px-3 py-2 text-[12px] text-white/65 sm:table-cell">{l.company || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {l.linkedinUrl && (
                              <a href={l.linkedinUrl} target="_blank" rel="noreferrer" title="LinkedIn profile" className="text-sky-300/70 transition hover:text-sky-200">
                                <LinkedinLogo size={16} weight="fill" />
                              </a>
                            )}
                            {l.email ? (
                              <a href={`mailto:${l.email}`} title={l.email} className="flex min-w-0 items-center gap-1 text-white/70 transition hover:text-white">
                                <Envelope size={13} weight="fill" className="shrink-0 text-emerald-300/70" />
                                <span className="max-w-[150px] truncate text-[11px]">{l.email}</span>
                              </a>
                            ) : (
                              <span className="text-[10.5px] text-white/25">no email</span>
                            )}
                          </div>
                          {st && (
                            <span className="flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ background: `${st.color}1f`, color: st.color }}>
                              <st.Icon size={10} weight="fill" /> {st.label}
                            </span>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                    <AnimatePresence>
                      {isOpen && detail && (
                        <motion.tr key={`${k}-d`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-t border-white/[0.04] bg-white/[0.015]">
                          <td colSpan={3} className="px-3 py-2.5">
                            {l.about && <p className="mb-2 line-clamp-3 text-[11.5px] leading-relaxed text-white/55">{l.about}</p>}
                            {l.skills && l.skills.length > 0 && (
                              <div className="mb-2 flex flex-wrap gap-1">
                                {l.skills.slice(0, 8).map((s, j) => (
                                  <span key={j} className="rounded-full border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/55">{s}</span>
                                ))}
                              </div>
                            )}
                            {l.recentActivity && (
                              <div className="flex gap-1.5 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-2 py-1.5">
                                <Sparkle size={12} weight="fill" className="mt-0.5 shrink-0 text-amber-300/80" />
                                <span className="text-[11px] leading-snug text-amber-100/75"><b className="text-white/70">Latest post: </b>“{l.recentActivity}”</span>
                              </div>
                            )}
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                );
              })}
              {tab === "all" && Array.from({ length: pending }).map((_, k) => <SkeletonRow key={`sk-${k}`} />)}
            </tbody>
          </table>
        ) : (
          <div className="m-4 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[12.5px] leading-relaxed text-amber-100/85">
            <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-amber-300" />
            <span>{data.note}</span>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/8 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[10px] text-white/35">
          {isEnriched ? (
            <>
              <Sparkle size={11} weight="fill" className="text-emerald-300/70" />
              {data.enriched ?? rows.filter(hasDetail).length} enriched · {data.verifiedEmail ?? counts.verified} verified
            </>
          ) : (
            <>{counts.email} with email</>
          )}
        </span>
        {rows.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={openInSheets}
              title="Open a new Google Sheet and paste these prospects"
              className="flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] font-medium text-emerald-200 transition hover:border-emerald-400/50 hover:bg-emerald-400/20"
            >
              <Table size={13} weight="bold" />
              Sheets
            </button>
            <button onClick={copyCsv} className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition", copied ? "text-emerald-300" : "text-white/45 hover:text-white")}>
              {copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy CSV"}
            </button>
            <button
              onClick={downloadCsv}
              className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition", downloaded ? "border-emerald-300/40 text-emerald-300" : "border-white/10 text-white/55 hover:border-amber-300/40 hover:text-white")}
            >
              {downloaded ? <Check size={12} weight="bold" /> : <DownloadSimple size={12} weight="bold" />}
              {downloaded ? "Saved" : "Download"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-t border-white/[0.04]">
      <td className="px-3 py-2.5">
        <div className="lead-shimmer h-3 w-28" />
        <div className="lead-shimmer mt-1.5 h-2 w-20" />
      </td>
      <td className="hidden px-3 py-2.5 sm:table-cell">
        <div className="lead-shimmer h-3 w-20" />
      </td>
      <td className="px-3 py-2.5">
        <div className="lead-shimmer h-3 w-16" />
      </td>
    </tr>
  );
}
