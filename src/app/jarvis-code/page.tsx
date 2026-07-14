"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChartLineUp, ArrowSquareOut, GearSix, SpeakerHigh, SpeakerSlash, Terminal, Coins, ArrowsClockwise } from "@phosphor-icons/react";
import { isMuted, setMuted } from "@/lib/sounds";
import HudFrame from "@/components/jarvis/HudFrame";
import OrgPyramid from "@/components/jarvis/OrgPyramid";
import ResponsePanel from "@/components/jarvis/ResponsePanel";
import CommandBar from "@/components/jarvis/CommandBar";
import DocSettings from "@/components/studio/DocSettings";
import { useJarvisCodeRun } from "@/components/jarvis-code/useJarvisCodeRun";

/**
 * /jarvis-code — the third mission control. Same cockpit UI as /jarvis, but the
 * brain is the user's OWN Claude Code subscription (`claude -p`) driving real
 * Agent Skills. The org chart, feed, and artifacts are protocol-identical to
 * /jarvis, so they render the live Claude Code run verbatim.
 */
export default function JarvisCodePage() {
  const { state, run } = useJarvisCodeRun();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#02040a] text-white">
      <HudFrame>
        <div className="flex h-full flex-col gap-3 px-5 pb-4 pt-[64px]">
          <div className="flex min-h-0 flex-1 items-stretch">
            {/* LEFT — the org as a live workflow, driven by real Claude Code tool calls */}
            <main className="relative hidden min-w-0 flex-[1.32] flex-col pr-6 lg:flex">
              <div className="mb-1 flex items-center justify-between px-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Organization</span>
                <ClaudeCodeTag />
              </div>
              <div className="relative min-h-0 flex-1">
                <OrgPyramid active={state.active} litPath={state.litPath} phases={state.phases} feed={state.feed} running={state.running} />
              </div>
            </main>

            <div className="hidden w-px shrink-0 self-stretch bg-gradient-to-b from-transparent via-white/12 to-transparent lg:block" />

            {/* RIGHT — the response / deliverable */}
            <aside className="flex min-h-0 w-full flex-col lg:w-[42%] lg:max-w-[560px] lg:pl-6">
              <ResponsePanel state={state} />
            </aside>
          </div>

          {/* live run telemetry (unique to running on your own subscription) */}
          <MetaStrip model={state.model} numTurns={state.numTurns} costUsd={state.costUsd} running={state.running} done={state.done} />

          {/* command bar */}
          <div className="mx-auto w-full max-w-2xl px-2">
            <CommandBar onSubmit={run} running={state.running} />
          </div>
        </div>
      </HudFrame>

      {/* bottom-right cluster */}
      <div className="fixed bottom-6 right-7 z-40 flex items-center gap-2">
        <SoundToggle />
        <button
          onClick={() => setSettingsOpen(true)}
          title="Knowledge & branding settings"
          className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/60 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:border-cyan-300/50 hover:text-white"
        >
          <GearSix size={18} weight="duotone" className="transition group-hover:rotate-45" />
        </button>
        <Link
          href="/jarvis-code/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          title="Open the command centre"
          className="group flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/[0.08] px-4 py-2.5 text-[12.5px] font-medium text-cyan-100 shadow-[0_10px_40px_-12px_rgba(34,211,238,0.5)] backdrop-blur-xl transition hover:border-cyan-300/60 hover:bg-cyan-400/[0.16] hover:text-white"
        >
          <ChartLineUp size={16} weight="bold" />
          Open dashboard
          <ArrowSquareOut size={13} weight="bold" className="opacity-60 transition group-hover:opacity-100" />
        </Link>
      </div>
      <DocSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** The badge that marks this cockpit as API-brain-powered (deployable). */
function ClaudeCodeTag() {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/[0.08] px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-cyan-200/90">
      <Terminal size={12} weight="bold" />
      AI Brain · API
    </span>
  );
}

/** Live run telemetry: model · turns · cost, shown while running and after. */
function MetaStrip({
  model,
  numTurns,
  costUsd,
  running,
  done,
}: {
  model?: string;
  numTurns?: number;
  costUsd?: number;
  running: boolean;
  done: boolean;
}) {
  if (!running && !done && !model) return <div className="h-[18px]" />;
  const shortModel = (model || "").replace(/\[.*?\]/, "").replace("claude-", "");
  return (
    <div className="mx-auto flex h-[18px] items-center gap-3 text-[10.5px] font-medium tracking-wide text-white/40">
      {shortModel && (
        <span className="flex items-center gap-1.5">
          <Terminal size={11} weight="bold" className="text-amber-300/70" />
          {shortModel}
        </span>
      )}
      {typeof numTurns === "number" && (
        <span className="flex items-center gap-1.5">
          <ArrowsClockwise size={11} weight="bold" className="text-cyan-300/60" />
          {numTurns} {numTurns === 1 ? "turn" : "turns"}
        </span>
      )}
      {typeof costUsd === "number" && (
        <span className="flex items-center gap-1.5">
          <Coins size={11} weight="fill" className="text-emerald-300/70" />${costUsd.toFixed(3)}
        </span>
      )}
      {running && <span className="text-cyan-200/70">· thinking…</span>}
    </div>
  );
}

function SoundToggle() {
  const [muted, setMutedState] = useState(false);
  useEffect(() => setMutedState(isMuted()), []);
  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };
  return (
    <button
      onClick={toggle}
      title={muted ? "Sound off — click to enable" : "Sound on — click to mute"}
      className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/55 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:border-cyan-300/50 hover:text-white"
    >
      {muted ? <SpeakerSlash size={17} weight="duotone" /> : <SpeakerHigh size={17} weight="duotone" />}
    </button>
  );
}
