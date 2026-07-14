"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ORG, node, isFormat, type OrgNode } from "@/lib/org";
import type { JarvisNodeId } from "@/lib/jarvis-events";
import JarvisIcon from "./JarvisIcon";
import type { FeedEntry, NodePhase } from "./useJarvisRun";
import { cn } from "@/lib/utils";

/**
 * The org as a live WORKFLOW canvas (n8n / Zapier energy), not a plain chart.
 * Every level is a different KIND of node:
 *
 *   tier 0  CEO        — the command node (hero, with a live orb ring)
 *   tier 1  C-suite    — CMO + Research as balanced department "module" nodes,
 *                        joined by a dashed lateral wire (the CMO consumes the
 *                        shared research brief — an exchange, not a hierarchy)
 *   tier 2  Content    — the producing specialist, same module treatment
 *   tier 3  formats    — the six real content formats as labelled cards in a
 *                        centred strip along the bottom
 *
 * Tiers 0–2 are placed analytically (normalised x/y per node); the format strip
 * lays itself out with flexbox so the cards keep natural widths at any screen
 * size. The edges are an SVG layer measured from the real card rects, so the
 * connectors + connection handles stay glued on either way. Active paths light
 * up and run animated data packets down the wire. The mission feed lives on the
 * nodes as little notification panes.
 */

type Props = {
  active?: JarvisNodeId;
  litPath: JarvisNodeId[];
  phases: Partial<Record<JarvisNodeId, NodePhase>>;
  feed: FeedEntry[];
  running: boolean;
};

type Tier = 0 | 1 | 2 | 3;
type Lay = { id: string; tier: Tier; x: number; y: number };

/**
 * Marketing-only org: every node on this chart is a REAL node from org.ts that
 * the runtime can actually fire. There are no decorative placeholders — if you
 * see it here, an instruction can light it up.
 */

/** Title/label/color/icon for a node id. */
function meta(id: string): { title: string; label: string; color: string; icon: string } {
  return (ORG as Record<string, OrgNode | undefined>)[id]!;
}
function colorOf(id: string): string {
  return meta(id).color;
}

/**
 * Normalised x/y (0..1) per node, spread to use the whole canvas: CEO on top,
 * the CMO and Research (the shared specialist the CEO fires once for the team)
 * balanced left/right beneath it, and Content on the mid-line.
 */
const LAYOUT: Lay[] = [
  { id: "kronos", tier: 0, x: 0.5, y: 0.1 },

  { id: "cmo", tier: 1, x: 0.26, y: 0.34 },
  // Research reports to the CEO, not the CMO — it runs once, up front, for the team.
  { id: "research", tier: 1, x: 0.74, y: 0.34 },

  { id: "content", tier: 2, x: 0.5, y: 0.6 },
];

/** the six real content formats — the producing leaves, flex-laid along the bottom */
const FORMATS = ["text", "picture", "carousel", "reels", "longform", "newsletter"];

const ALL_IDS = [...LAYOUT.map((l) => l.id), ...FORMATS];

const EDGES: [string, string][] = [
  ["kronos", "cmo"],
  ["kronos", "research"],
  // the CMO consumes the shared research brief before Content writes
  ["cmo", "research"],
  ["cmo", "content"],
  // Content picks the format
  ["content", "text"],
  ["content", "picture"],
  ["content", "carousel"],
  ["content", "reels"],
  ["content", "longform"],
  ["content", "newsletter"],
];

const HAS_CHILDREN = new Set<string>(EDGES.map(([p]) => p));
const HAS_PARENT = new Set<string>(EDGES.map(([, c]) => c));

const KIND_LABEL: Record<FeedEntry["kind"], string> = {
  route: "ROUTE",
  activate: "ONLINE",
  status: "WORKING",
  tool: "READ",
  output: "DONE",
  report: "↑ REPORT",
};

type Box = { cx: number; left: number; right: number; top: number; bottom: number };

/**
 * Orthogonal "smoothstep" edge (React Flow / n8n style): straight down from the
 * parent, a rounded 90° turn at the mid-line, straight across, another rounded
 * turn, straight down into the child. Children that sit directly below their
 * parent get a clean dead-straight vertical. This is what reads as *solid*.
 */
function stepPath(x1: number, y1: number, x2: number, y2: number, r = 15): string {
  if (Math.abs(x2 - x1) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const midY = (y1 + y2) / 2;
  const dir = x2 > x1 ? 1 : -1;
  const rr = Math.min(r, Math.abs(x2 - x1) / 2, Math.abs(midY - y1), Math.abs(y2 - midY));
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${midY - rr}`,
    `Q ${x1} ${midY} ${x1 + dir * rr} ${midY}`,
    `L ${x2 - dir * rr} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${midY + rr}`,
    `L ${x2} ${y2}`,
  ].join(" ");
}

export default function OrgPyramid({ active, litPath, phases, feed, running }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [pos, setPos] = useState<Record<string, Box>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const cb = cont.getBoundingClientRect();
    const next: Record<string, Box> = {};
    for (const id of ALL_IDS) {
      const el = nodeRefs.current[id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next[id] = {
        cx: r.left - cb.left + r.width / 2,
        left: r.left - cb.left,
        right: r.right - cb.left,
        top: r.top - cb.top,
        bottom: r.top - cb.top + r.height,
      };
    }
    setPos(next);
    setSize({ w: cb.width, h: cb.height });
  }, []);

  /**
   * Inflate every node IN PLACE on large canvases so the tree fills the stage
   * instead of floating in it: positions stay put (normalised anchors), the
   * cards grow around their own centres. 1000×510 is the reference canvas the
   * base px sizes were tuned on; below it nothing shrinks, above it everything
   * scales up to +32%. The edges re-measure from the scaled rects, so the
   * wires stay glued on.
   */
  const k = size.w && size.h ? Math.min(1.32, Math.max(1, Math.min(size.w / 1000, size.h / 510))) : 1;

  useLayoutEffect(() => {
    measure();
  }, [measure, k]);

  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(cont);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  /* Every org id is a real node on this chart now (newsletter included, as a
   * Content format), so the chart path maps 1:1 onto the org path. */
  const chartLitPath = litPath;
  const chartActive = active;

  /* ---- lit / done / active sets ---- */
  const engaged = new Set<string>(chartLitPath);
  const doneSet = new Set<string>();
  for (const [id, ph] of Object.entries(phases) as [JarvisNodeId, NodePhase][]) {
    if (ph === "working" || ph === "done") engaged.add(id);
    if (ph === "done") doneSet.add(id);
  }
  if (chartActive) engaged.add(chartActive);

  /* ---- latest mission-feed line per node, for its notification pane ---- */
  const paneByNode: Record<string, FeedEntry> = {};
  for (const f of feed) {
    paneByNode[f.node] = f;
  }

  /**
   * Beams only run while work is in flight, and only on the current active spine
   * (active node → CEO). Direction follows the activity: as the CEO delegates we
   * beam DOWN toward the frontier; the moment work reports back we beam UP toward
   * the CEO. When the run finishes the beams stop and the path just stays lit.
   */
  const spine = new Set<string>(chartLitPath);
  // direction tracks the last event that actually MOVED activity between nodes
  // (activate = down to a child, report = up to a parent). status/tool/output
  // happen in place and must not flip the beam — so the run ends cleanly beaming
  // up toward the CEO instead of flickering down on the final status beat.
  let flowingUp = false;
  for (let i = feed.length - 1; i >= 0; i--) {
    const k = feed[i].kind;
    if (k === "report") {
      flowingUp = true;
      break;
    }
    if (k === "activate" || k === "route") break;
  }
  const focusMode = engaged.size > 0;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* dotted workflow canvas */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(135% 115% at 50% 45%, #000 45%, transparent 95%)",
          WebkitMaskImage: "radial-gradient(135% 115% at 50% 45%, #000 45%, transparent 95%)",
        }}
      />

      {/* ── edges + connection handles ── */}
      <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} style={{ overflow: "visible" }}>
        <defs>
          <filter id="wf-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="wf-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>

        {EDGES.map(([p, c]) => {
          const a = pos[p];
          const b = pos[c];
          if (!a || !b) return null;
          // light an edge only when BOTH ends are engaged — keeps Research's
          // shared lines dark for the heads that didn't actually run it.
          const lit = engaged.has(p) && engaged.has(c);
          const col = colorOf(c);
          // CMO ↔ Research sit on the same tier: their wire runs dashed from
          // card side to card side (a peer exchange, not a chain of command).
          const lateral = p === "cmo" && c === "research";
          const d = lateral
            ? `M ${a.right + 5} ${(a.top + a.bottom) / 2} L ${b.left - 5} ${(b.top + b.bottom) / 2}`
            : stepPath(a.cx, a.bottom, b.cx, b.top);
          const dash = lateral ? "5 6" : undefined;
          // beam only while running and only along the active spine; direction
          // follows the activity (down to delegate, up to report toward the CEO)
          const beaming = running && spine.has(p) && spine.has(c);
          const dir = flowingUp ? "reverse" : "normal";
          return (
            <g key={`${p}-${c}`}>
              <path
                d={d}
                fill="none"
                stroke="rgba(255,255,255,0.13)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeDasharray={dash}
                opacity={focusMode && !lit ? 0.16 : 1}
              />
              {lit && (
                <>
                  {/* soft ambient glow + calm core wire (stays lit when idle/done) */}
                  <path d={d} fill="none" stroke={col} strokeWidth={2.5} opacity={0.2} filter="url(#wf-glow)" strokeDasharray={dash} />
                  <path d={d} fill="none" stroke={col} strokeWidth={1.3} opacity={0.72} strokeDasharray={dash} />
                </>
              )}
              {beaming && (
                <>
                  {/* a single light bead gliding toward the activity (halo + white core) */}
                  <path
                    className="wf-bead"
                    d={d}
                    fill="none"
                    pathLength={100}
                    stroke={col}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray="11 89"
                    opacity={0.55}
                    filter="url(#wf-soft)"
                    style={{ animation: "wf-pulse 2.4s linear infinite", animationDirection: dir }}
                  />
                  <path
                    className="wf-bead"
                    d={d}
                    fill="none"
                    pathLength={100}
                    stroke="#f2f9ff"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeDasharray="9 91"
                    opacity={0.95}
                    filter="url(#wf-soft)"
                    style={{ animation: "wf-pulse 2.4s linear infinite", animationDirection: dir }}
                  />
                </>
              )}
            </g>
          );
        })}

        {/* handles — drawn over the wires so they sit on the node edges */}
        {ALL_IDS.map((id) => {
          const p = pos[id];
          if (!p) return null;
          const on = engaged.has(id);
          const col = colorOf(id);
          const cy = (p.top + p.bottom) / 2;
          const dot = (dx: number, dy: number, key: string) => (
            <g key={key} opacity={focusMode && !on ? 0.16 : 1}>
              <circle cx={dx} cy={dy} r={3.6} fill="#0a0f1a" stroke={on ? col : "rgba(255,255,255,0.22)"} strokeWidth={1.4} />
              {on && <circle cx={dx} cy={dy} r={1.6} fill={col} />}
            </g>
          );
          return (
            <g key={`h-${id}`}>
              {HAS_PARENT.has(id) && dot(p.cx, p.top, `t-${id}`)}
              {HAS_CHILDREN.has(id) && dot(p.cx, p.bottom, `b-${id}`)}
              {/* side handles for the dashed CMO ↔ Research exchange wire */}
              {id === "cmo" && dot(p.right, cy, `r-${id}`)}
              {id === "research" && dot(p.left, cy, `l-${id}`)}
            </g>
          );
        })}
      </svg>

      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-20 bg-[#02040a]/50 backdrop-blur-[1px] transition-opacity duration-500",
        )}
        style={{ opacity: focusMode ? 0.5 : 0 }}
      />

      {/* ── nodes (tiers 0–2, placed analytically) ── */}
      {LAYOUT.map((l) => {
        const on = engaged.has(l.id);
        const dimmed = focusMode && !on;
        return (
          <div
            key={l.id}
            data-jarvis-node={l.id}
            data-jarvis-tier={l.tier}
            data-jarvis-lit={on ? "true" : "false"}
            className={cn(
              "absolute transition-[filter,opacity,transform] duration-500",
              focusMode && on && "drop-shadow-[0_0_18px_rgba(34,211,238,0.22)]",
            )}
            style={{
              left: `${l.x * 100}%`,
              top: `${l.y * 100}%`,
              transform: `translate(-50%,-50%) scale(${k})`,
              opacity: dimmed ? 0.9 : 1,
              filter: dimmed ? "blur(0.35px) grayscale(0.12)" : undefined,
              // lit nodes rise above the focus veil while inactive nodes sink back
              zIndex: paneByNode[l.id] ? 60 : focusMode && on ? 40 : 10,
            }}
          >
            <WorkflowNode
              id={l.id}
              tier={l.tier}
              on={on}
              done={doneSet.has(l.id)}
              active={chartActive === l.id}
              running={running}
              entry={paneByNode[l.id]}
              paneSide={l.id === "kronos" ? "right" : undefined}
              refCb={(el) => (nodeRefs.current[l.id] = el)}
            />
          </div>
        );
      })}

      {/* ── format strip (tier 3) — flexbox keeps the cards natural-width and
             evenly spread; the SVG edges connect to their measured rects ── */}
      <div className="absolute inset-x-0" style={{ top: "86%", transform: `translateY(-50%) scale(${k})` }}>
        <div className="flex items-stretch justify-center gap-[clamp(10px,3.5%,56px)] px-1">
          {FORMATS.map((id, i) => {
            const on = engaged.has(id);
            const dimmed = focusMode && !on;
            return (
              <div
                key={id}
                data-jarvis-node={id}
                data-jarvis-tier={3}
                data-jarvis-lit={on ? "true" : "false"}
                className={cn(
                  "relative transition-[filter,opacity,transform] duration-500",
                  focusMode && on && "drop-shadow-[0_0_18px_rgba(34,211,238,0.22)]",
                )}
                style={{
                  opacity: dimmed ? 0.9 : 1,
                  filter: dimmed ? "blur(0.35px) grayscale(0.12)" : undefined,
                  zIndex: paneByNode[id] ? 60 : focusMode && on ? 40 : 10,
                }}
              >
                <WorkflowNode
                  id={id}
                  tier={3}
                  on={on}
                  done={doneSet.has(id)}
                  active={chartActive === id}
                  running={running}
                  entry={paneByNode[id]}
                  // panes flip toward the canvas centre so the outermost cards
                  // never push theirs off the edge
                  paneSide={i < FORMATS.length / 2 ? "right" : "left"}
                  refCb={(el) => (nodeRefs.current[id] = el)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <style jsx global>{`
        @keyframes wf-pulse {
          from {
            stroke-dashoffset: 100;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes wf-spin {
          to {
            transform: rotate(360deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .wf-bead,
          .wf-ring {
            animation: none !important;
          }
          .wf-bead {
            opacity: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ---------------------------------------------------------------- nodes ---- */

type NodeProps = {
  id: string;
  tier: Tier;
  on: boolean;
  done: boolean;
  active: boolean;
  running: boolean;
  entry?: FeedEntry;
  /** mount the notification pane beside the node instead of below it */
  paneSide?: "left" | "right";
  refCb: (el: HTMLDivElement | null) => void;
};

function WorkflowNode(props: NodeProps) {
  const { tier, entry, active, id, paneSide } = props;
  const col = colorOf(id);
  const card = tier === 0 ? <CeoCard {...props} /> : tier === 3 ? <FormatCard {...props} /> : <DeptCard {...props} />;

  return (
    <div className="relative flex flex-col items-center">
      {card}
      <AnimatePresence>
        {entry && (
          <NotificationPane key="pane" entry={entry} color={col} active={active} compact={tier === 3} side={paneSide} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Shared status dot in the corner of a card. */
function StatusDot({ on, done, active, running, col }: { on: boolean; done: boolean; active: boolean; running: boolean; col: string }) {
  const live = active && running;
  return (
    <span className="absolute right-2 top-2 flex h-2 w-2 items-center justify-center">
      {live ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ background: col }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: col }} />
        </span>
      ) : done ? (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: col, boxShadow: `0 0 6px ${col}` }} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? `${col}99` : "rgba(255,255,255,0.14)" }} />
      )}
    </span>
  );
}

/** Tier 0 — the command node. Hero pill with a live orb ring. */
function CeoCard({ on, done, active, running, refCb }: NodeProps) {
  const col = ORG.kronos.color;
  const n = ORG.kronos;
  const live = (active && running) || (running && !done);
  return (
    <div
      ref={refCb}
      className="relative flex w-[296px] items-center gap-3.5 rounded-2xl border px-5 py-4 backdrop-blur-md"
      style={{
        borderColor: `${col}aa`,
        background: `linear-gradient(155deg, ${col}2e, ${col}0a 65%, rgba(7,11,20,0.6))`,
        boxShadow: `0 0 38px ${col}55, inset 0 1px 0 rgba(255,255,255,0.1)`,
      }}
    >
      {/* orb disc with spinning conic ring */}
      <span className="relative grid h-14 w-14 shrink-0 place-items-center">
        <span
          className="wf-ring absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, transparent, ${col}, transparent 70%)`,
            animation: live ? "wf-spin 3.4s linear infinite" : "none",
            opacity: 0.9,
          }}
        />
        <span className="absolute inset-[2px] rounded-full bg-[#070d18]" />
        <span
          className="relative grid h-9 w-9 place-items-center rounded-full"
          style={{ background: `${col}33`, color: col, boxShadow: `0 0 14px ${col}aa` }}
        >
          <JarvisIcon name={n.icon} size={22} weight="fill" />
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: `${col}cc` }}>
          AI CEO
        </span>
        <span className="text-[21px] font-bold tracking-tight text-white">{n.title}</span>
        <span className="truncate text-[11.5px] text-white/50">{n.label}</span>
      </span>

      <StatusDot on={on} done={done} active={active} running={running} col={col} />
    </div>
  );
}

/** Tier 1 — department "module" node (n8n action-card). Square icon chip + accent. */
function DeptCard({ id, on, done, active, running, refCb }: NodeProps) {
  const n = meta(id);
  const col = n.color;
  const live = active && running;
  return (
    <motion.div
      ref={refCb}
      animate={{ scale: active ? 1.04 : 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={cn("relative w-[196px] overflow-hidden rounded-xl border backdrop-blur-md", active && "moving-border")}
      style={{
        borderColor: on ? `${col}aa` : "rgba(255,255,255,0.09)",
        background: on ? `linear-gradient(160deg, ${col}24, ${col}08 75%)` : "rgba(255,255,255,0.02)",
        boxShadow: live ? `0 0 24px ${col}5e` : on ? `0 0 12px ${col}2a` : "none",
      }}
    >
      {/* top accent bar */}
      <span className="block h-[5px] w-full" style={{ background: on ? col : "rgba(255,255,255,0.12)" }} />
      <div className="flex items-center gap-3 px-4 py-4">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
          style={{ background: on ? `${col}2e` : "rgba(255,255,255,0.05)", color: on ? col : "rgba(255,255,255,0.42)", boxShadow: live ? `0 0 12px ${col}88` : "none" }}
        >
          <JarvisIcon name={n.icon} size={22} weight={on ? "fill" : "regular"} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[16.5px] font-bold tracking-tight" style={{ color: on ? "#fff" : "rgba(255,255,255,0.62)" }}>
            {n.title}
          </span>
          <span className="truncate text-[11.5px]" style={{ color: on ? `${col}cc` : "rgba(255,255,255,0.32)" }}>
            {n.label}
          </span>
        </span>
      </div>
      <StatusDot on={on} done={done} active={active} running={running} col={col} />
    </motion.div>
  );
}

/**
 * Tier 3 — content-format card. A real labelled card (icon chip over the format
 * name), matching the department modules; the label collapses on narrow screens
 * so six still fit across.
 */
function FormatCard({ id, on, done, active, running, refCb }: NodeProps) {
  const n = meta(id);
  const col = n.color;
  const live = active && running;
  return (
    <motion.div
      ref={refCb}
      title={`${n.title} · ${n.label}`}
      animate={{ scale: active ? 1.06 : 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 20 }}
      className="relative flex flex-col items-center gap-1.5 rounded-xl border px-2 pb-2 pt-2.5 backdrop-blur-md xl:min-w-[96px] xl:px-3"
      style={{
        borderColor: on ? `${col}b0` : "rgba(255,255,255,0.1)",
        background: on ? `linear-gradient(165deg, ${col}22, rgba(7,11,20,0.72))` : "rgba(255,255,255,0.02)",
        boxShadow: live ? `0 0 20px ${col}5e` : on ? `0 0 10px ${col}26` : "none",
      }}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
        style={{
          background: on ? `${col}2e` : "rgba(255,255,255,0.05)",
          color: on ? col : "rgba(255,255,255,0.5)",
          boxShadow: live ? `0 0 10px ${col}88` : "none",
        }}
      >
        <JarvisIcon name={n.icon} size={16} weight={on ? "fill" : "regular"} />
      </span>
      <span
        className="hidden max-w-[104px] truncate text-[10.5px] font-semibold tracking-tight xl:block"
        style={{ color: on ? "#fff" : "rgba(255,255,255,0.55)" }}
      >
        {n.title}
      </span>
      <span className="sr-only">{`${n.title}: ${n.label}`}</span>
      <StatusDot on={on} done={done} active={active} running={running} col={col} />
    </motion.div>
  );
}

/* ----------------------------------------------------- notification pane ---- */

function NotificationPane({
  entry,
  color,
  active,
  compact,
  side,
}: {
  entry: FeedEntry;
  color: string;
  active: boolean;
  compact: boolean;
  /** stacked tier-3 chips put their pane to the side so it can't cover the chip below */
  side?: "left" | "right";
}) {
  const fmt = isFormat(entry.node) ? node(entry.node).title : null;
  const body = (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={entry.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4, position: "absolute" }}
        transition={{ duration: 0.22 }}
        className="rounded-lg border px-2.5 py-1.5 backdrop-blur-md"
        style={{
          borderColor: active ? `${color}aa` : "rgba(255,255,255,0.16)",
          background: active ? `linear-gradient(160deg, ${color}26, rgba(7,11,20,0.98))` : "rgba(7,11,20,0.96)",
          boxShadow: active ? `0 8px 24px -10px ${color}aa` : "0 6px 18px -12px rgba(0,0,0,0.8)",
        }}
      >
        <div className="mb-0.5 flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active && "animate-pulse")} style={{ background: color }} />
          <span className="text-[8px] font-bold uppercase tracking-[0.12em]" style={{ color: `${color}e0` }}>
            {fmt ?? KIND_LABEL[entry.kind]}
          </span>
        </div>
        <p className="line-clamp-2 text-[10px] leading-snug text-white/88">{entry.text}</p>
      </motion.div>
    </AnimatePresence>
  );

  if (side) {
    const toRight = side === "right";
    return (
      <motion.div
        initial={{ opacity: 0, x: toRight ? -6 : 6, scale: 0.92 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        className={cn(
          "absolute top-1/2 z-20 -translate-y-1/2",
          toRight ? "left-[calc(100%+12px)]" : "right-[calc(100%+12px)]",
        )}
        style={{ width: 150 }}
      >
        <span
          className={cn("absolute top-1/2 h-px w-[12px] -translate-y-1/2", toRight ? "-left-[12px]" : "-right-[12px]")}
          style={{ background: active ? color : "rgba(255,255,255,0.18)" }}
          aria-hidden
        />
        {body}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="absolute left-1/2 top-[calc(100%+10px)] z-20 -translate-x-1/2"
      style={{ width: compact ? 134 : 150 }}
    >
      <span
        className="absolute -top-[10px] left-1/2 h-[10px] w-px -translate-x-1/2"
        style={{ background: active ? color : "rgba(255,255,255,0.18)" }}
        aria-hidden
      />
      {body}
    </motion.div>
  );
}
