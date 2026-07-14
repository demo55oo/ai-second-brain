import { cn } from "@/lib/utils";

/**
 * The ONE shared deliverable header eyebrow — a green "live" dot + "Deliverable".
 * Use this on EVERY deliverable artifact (carousel, leads, newsletter, briefing…)
 * so the convention stays identical across all of them. No per-type icon or label.
 */
export function DeliverableEyebrow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/55", className)}>
      <span className="relative flex h-1.5 w-1.5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px 1px rgba(52,211,153,0.85)" }} />
      </span>
      Deliverable
    </div>
  );
}
