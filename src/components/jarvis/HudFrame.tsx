"use client";

import { useEffect, useState } from "react";

/**
 * The Iron-Man HUD dressing: corner brackets, a vignette + grid, and a live
 * clock. Pure chrome — it frames the live dashboard and sells the "mission
 * control" feel without carrying state.
 */

export default function HudFrame({ children }: { children: React.ReactNode }) {
  const [clock, setClock] = useState<string>("");
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
      setDate(d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" }).toUpperCase());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* deep field background */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 35%, #060a14 0%, #02040a 60%, #010207 100%)" }} />
      {/* faint grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(120% 90% at 50% 40%, #000 30%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 40%, #000 30%, transparent 85%)",
        }}
      />

      {/* corner brackets */}
      {([
        "left-3 top-3 border-l border-t",
        "right-3 top-3 border-r border-t",
        "left-3 bottom-3 border-l border-b",
        "right-3 bottom-3 border-r border-b",
      ] as const).map((c) => (
        <div key={c} className={`pointer-events-none absolute h-6 w-6 border-cyan-300/40 ${c}`} />
      ))}

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-7 py-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[15px] font-bold tracking-[0.3em] text-cyan-200">SECOND BRAIN</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] text-white/45">
          <span className="tracking-widest text-white/30">{date}</span>
          <span className="tabular-nums tracking-widest text-cyan-200/80">{clock}</span>
        </div>
      </div>

      {/* content */}
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}
