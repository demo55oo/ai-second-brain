"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Brain,
  FileZip,
  CheckCircle,
  Database,
  MagnifyingGlass,
  Lightning,
  WarningCircle,
  CloudArrowUp,
  FolderOpen,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { Counter, Meter, Panel, Rise, StatusDot } from "@/components/dashboard/ui";

/**
 * /brain — marketingos-inspired vault UI, wired to our upload APIs.
 * Uploads replace Danny. Supabase optional (local owner folder when writable).
 */

type Phase = "idle" | "uploading" | "done" | "error";
type Status = {
  configured: boolean;
  canUpload?: boolean;
  hasUserBrain?: boolean;
  uploadMode?: string;
  provider: string;
  hint?: string;
  stats: { documents: number; chunks?: number; folders: number; links?: number };
  sample?: { title: string; folder: string; links: number }[];
};
type SearchHit = { title: string; folder: string; score: number; excerpt: string };

export default function BrainPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastCount, setLastCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/brain");
      if (res.ok) setStatus(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (!files.length) return;
      setError("");
      setPhase("uploading");
      setProgress(12);
      try {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        const tick = setInterval(() => setProgress((p) => Math.min(90, p + 8)), 400);
        const res = await fetch("/api/brain/upload", { method: "POST", body: fd });
        clearInterval(tick);
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed");
        setLastCount(data.documents ?? data.uploaded ?? files.length);
        setProgress(100);
        setPhase("done");
        await loadStatus();
      } catch (e) {
        setPhase("error");
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [loadStatus]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  };

  const reset = () => {
    setPhase("idle");
    setError("");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const hasVault = !!(status?.hasUserBrain || (status?.stats.documents ?? 0) > 0);
  const canUpload = status?.canUpload !== false;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#02040a] text-white">
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(100% 70% at 50% 0%, #12081f 0%, #02040a 55%)" }} />
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(167,139,250,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <header className="relative z-10 border-b border-white/8 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-3 px-5 py-3.5 md:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/jarvis-code"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/55 transition hover:border-violet-300/40 hover:text-white"
              title="Back to mission control"
            >
              <ArrowLeft size={16} weight="bold" />
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-300/30 bg-violet-400/10 text-violet-200">
              <Brain size={18} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold tracking-[0.18em] text-violet-100">SECOND BRAIN</span>
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/45">
                  Knowledge
                </span>
              </div>
              <div className="text-[10.5px] text-white/35">Your markdown becomes the only brain — Danny demo turns off</div>
            </div>
          </div>
          <Link
            href="/jarvis-code"
            className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] text-white/65 transition hover:border-cyan-300/40 hover:text-white sm:flex"
          >
            <Lightning size={13} weight="fill" />
            Mission control
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1080px] px-5 pb-20 pt-7 md:px-8">
        <Rise>
          <Panel
            glow={hasVault ? "#a78bfa" : undefined}
            accent="#a78bfa"
            title="Your brain right now"
            subtitle={status ? status.provider : "Loading…"}
            right={
              <span
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium ${
                  hasVault
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border-white/15 bg-white/[0.04] text-white/55"
                }`}
              >
                <StatusDot color={hasVault ? "#34d399" : "rgba(255,255,255,0.35)"} pulse={hasVault} />
                {hasVault ? "Your uploads active" : "Demo knowledge"}
              </span>
            }
          >
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Notes" value={status?.stats.documents ?? 0} color="#a78bfa" icon={<FolderOpen size={15} weight="duotone" />} />
              <Stat label="Chunks" value={status?.stats.chunks ?? 0} color="#22d3ee" icon={<Database size={15} weight="duotone" />} />
              <Stat label="Folders" value={status?.stats.folders ?? 0} color="#34d399" icon={<Sparkle size={15} weight="duotone" />} />
            </div>
            {status?.hint && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11.5px] text-white/55">
                <WarningCircle size={15} weight="bold" className="mt-0.5 shrink-0 text-violet-300/80" />
                <span>{status.hint}</span>
              </div>
            )}
            {hasVault && status?.sample && status.sample.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {status.sample.slice(0, 8).map((s, i) => (
                  <span key={i} className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-[10.5px] text-white/55">
                    {s.title}
                  </span>
                ))}
              </div>
            )}
          </Panel>
        </Rise>

        <Rise delay={0.06} className="mt-5">
          <Panel
            className="overflow-visible"
            accent="#22d3ee"
            title="Upload your knowledge"
            subtitle=".md files or a .zip vault — replaces Danny and becomes the only brain"
          >
            <AnimatePresence mode="wait">
              {(phase === "idle" || phase === "error") && (
                <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => canUpload && inputRef.current?.click()}
                    className={`group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
                      !canUpload
                        ? "cursor-not-allowed border-white/8 bg-white/[0.01] opacity-60"
                        : dragging
                          ? "cursor-pointer border-cyan-300/60 bg-cyan-400/[0.06]"
                          : "cursor-pointer border-white/12 bg-white/[0.015] hover:border-cyan-300/40 hover:bg-white/[0.03]"
                    }`}
                  >
                    <motion.div
                      animate={{ y: dragging ? -4 : 0 }}
                      className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300"
                    >
                      <CloudArrowUp size={30} weight="duotone" />
                    </motion.div>
                    <div>
                      <div className="text-[15px] font-semibold text-white">Drop .md or vault.zip here</div>
                      <div className="mt-1 text-[12px] text-white/40">
                        {canUpload
                          ? "or click to browse · your files replace the demo brain"
                          : "Uploads need a writable host or optional Supabase — chat still works"}
                      </div>
                    </div>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".zip,.md,.markdown,.txt"
                      multiple
                      className="hidden"
                      disabled={!canUpload}
                      onChange={(e) => e.target.files?.length && void uploadFiles(e.target.files)}
                    />
                  </div>
                  {phase === "error" && error && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2.5 text-[12px] text-rose-200">
                      <WarningCircle size={15} weight="bold" /> {error}
                    </div>
                  )}
                </motion.div>
              )}

              {phase === "uploading" && (
                <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4 py-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2 text-white/70">
                      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }} className="text-cyan-300">
                        <FileZip size={16} weight="duotone" />
                      </motion.span>
                      Indexing your brain…
                    </span>
                    <span className="font-mono tabular-nums text-cyan-200">{progress}%</span>
                  </div>
                  <Meter value={progress} color="#22d3ee" height={10} />
                </motion.div>
              )}

              {phase === "done" && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-3 py-6 text-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 14 }}
                    className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  >
                    <CheckCircle size={32} weight="fill" />
                  </motion.div>
                  <div className="text-[16px] font-bold text-white">Your brain is live</div>
                  <div className="text-[12.5px] text-white/50">
                    <span className="font-semibold text-emerald-300">{lastCount.toLocaleString()}</span> notes indexed · Danny demo is off
                  </div>
                  <div className="mt-1 flex flex-wrap justify-center gap-2.5">
                    <button
                      onClick={reset}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[12px] text-white/65 transition hover:text-white"
                    >
                      Upload another
                    </button>
                    <Link
                      href="/jarvis-code"
                      className="rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-3.5 py-2 text-[12px] font-medium text-cyan-50 transition hover:bg-cyan-400/25"
                    >
                      Use it in mission control →
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        </Rise>

        {(hasVault || phase === "done") && (
          <Rise delay={0.1} className="mt-5">
            <BrainSearch />
          </Rise>
        )}

        <p className="mt-8 text-center text-[11px] text-white/25">
          Supabase is optional · chat works with an LLM key · uploads override the Danny demo
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40" style={{ color }}>
        {icon}
        <span className="text-white/40">{label}</span>
      </div>
      <div className="mt-1 text-[24px] font-bold leading-none text-white">
        <Counter value={value} format="number" />
      </div>
    </div>
  );
}

function BrainSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    try {
      const res = await fetch("/api/brain/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, limit: 6 }),
      });
      const data = await res.json();
      const results = (data.results || []).map(
        (h: { title: string; folder: string; score: number; excerpt: string }) => ({
          title: h.title,
          folder: h.folder,
          score: h.score,
          excerpt: h.excerpt,
        })
      );
      setHits(results);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel accent="#34d399" title="Ask your brain" subtitle="Search what you uploaded">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 focus-within:border-emerald-300/40">
        <MagnifyingGlass size={16} className="text-white/35" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          placeholder="e.g. what's my ICP?"
          className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/30 focus:outline-none"
        />
        <button
          onClick={() => void run()}
          disabled={loading || !q.trim()}
          className="rounded-lg border border-emerald-300/40 bg-emerald-400/15 px-3 py-1.5 text-[12px] font-medium text-emerald-50 transition hover:bg-emerald-400/25 disabled:opacity-40"
        >
          {loading ? "…" : "Search"}
        </button>
      </div>
      <AnimatePresence>
        {hits && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 flex flex-col gap-2">
            {hits.length === 0 && <div className="px-1 py-2 text-[12px] text-white/40">No matching notes yet.</div>}
            {hits.map((h, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] font-semibold text-white/85">{h.title}</span>
                  <span className="shrink-0 rounded-md bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                    {Math.round(Math.min(1, h.score) * 100)}%
                  </span>
                </div>
                <div className="text-[10.5px] text-white/35">{h.folder}</div>
                <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-white/55">{h.excerpt}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}
