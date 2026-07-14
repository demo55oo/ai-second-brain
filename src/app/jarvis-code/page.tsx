"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChartLineUp, ArrowSquareOut, Brain, GearSix, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { isMuted, setMuted } from "@/lib/sounds";
import HudFrame from "@/components/jarvis/HudFrame";
import OrgPyramid from "@/components/jarvis/OrgPyramid";
import ResponsePanel from "@/components/jarvis/ResponsePanel";
import CommandBar from "@/components/jarvis/CommandBar";
import DocSettings from "@/components/studio/DocSettings";
import { useJarvisCodeRun } from "@/components/jarvis-code/useJarvisCodeRun";

/**
 * AI Brain cockpit — marketingos layout:
 *   top rail — Second Brain / dashboard / sound / settings
 *   left     — org chart with command bar docked under it
 *   right    — response panel full height
 *
 * Engine stays our deployable API brain (upload override, Supabase optional).
 */
export default function JarvisCodePage() {
  const { state, run } = useJarvisCodeRun();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#02040a] text-white">
      <HudFrame
        actions={
          <>
            <Link
              href="/brain"
              title="Upload & manage your second brain"
              className="group flex h-8 items-center gap-1.5 rounded-lg border border-violet-300/25 bg-violet-400/[0.07] px-2.5 text-[11.5px] font-medium text-violet-100/90 backdrop-blur-xl transition hover:border-violet-300/60 hover:bg-violet-400/[0.15] hover:text-white"
            >
              <Brain size={15} weight="duotone" />
              <span className="hidden lg:inline">Second Brain</span>
            </Link>
            <Link
              href="/jarvis-code/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              title="Open the analytics dashboard"
              className="group flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-400/[0.07] px-2.5 text-[11.5px] font-medium text-cyan-100/90 backdrop-blur-xl transition hover:border-cyan-300/60 hover:bg-cyan-400/[0.15] hover:text-white"
            >
              <ChartLineUp size={15} weight="bold" />
              <span className="hidden lg:inline">Dashboard</span>
              <ArrowSquareOut size={11} weight="bold" className="hidden opacity-60 transition group-hover:opacity-100 lg:inline" />
            </Link>
            <span aria-hidden className="mx-0.5 h-4 w-px bg-white/10" />
            <SoundToggle />
            <button
              onClick={() => setSettingsOpen(true)}
              title="Knowledge & branding settings"
              className="group flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-white/60 backdrop-blur-xl transition hover:border-cyan-300/50 hover:text-white"
            >
              <GearSix size={16} weight="duotone" className="transition group-hover:rotate-45" />
            </button>
          </>
        }
      >
        <div className="grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-y-3 px-5 pb-5 pt-14 lg:grid-cols-[minmax(0,1fr)_1px_clamp(360px,42%,560px)]">
          <main className="relative hidden min-w-0 flex-col pr-6 lg:col-start-1 lg:row-start-1 lg:flex">
            <div className="mb-2 flex items-center justify-between px-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                Organization
              </span>
              <RunStatus running={state.running} done={state.done} />
            </div>
            <div className="relative min-h-0 flex-1">
              <OrgPyramid
                active={state.active}
                litPath={state.litPath}
                phases={state.phases}
                feed={state.feed}
                running={state.running}
              />
            </div>
          </main>

          <div className="hidden w-px bg-gradient-to-b from-transparent via-white/12 to-transparent lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block" />

          <aside className="flex min-h-0 w-full flex-col lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:pl-6">
            <ResponsePanel state={state} />
          </aside>

          <div className="flex justify-center px-2 lg:col-start-1 lg:row-start-2 lg:pr-6">
            <div className="w-full max-w-xl">
              <CommandBar onSubmit={run} running={state.running} />
            </div>
          </div>
        </div>
      </HudFrame>

      <DocSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function RunStatus({ running, done }: { running: boolean; done: boolean }) {
  const label = running ? "Live run" : done ? "Complete" : "Standby";
  const color = running ? "#22d3ee" : done ? "#34d399" : "rgba(255,255,255,0.35)";
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">
      <span className="relative flex h-1.5 w-1.5">
        {running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ background: color }} />}
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: color, boxShadow: running || done ? `0 0 8px ${color}` : "none" }}
        />
      </span>
      {label}
    </span>
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
      className="group flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-white/55 backdrop-blur-xl transition hover:border-cyan-300/50 hover:text-white"
    >
      {muted ? <SpeakerSlash size={15} weight="duotone" /> : <SpeakerHigh size={15} weight="duotone" />}
    </button>
  );
}
