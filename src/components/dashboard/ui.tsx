"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";
import NumberFlow, { type Format } from "@number-flow/react";
import { ArrowUpRight, ArrowDownRight } from "@phosphor-icons/react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the mission-control dashboard — a glassy card
 * shell, animated counters, trend chips, mini sparklines and meters. Kept
 * deliberately small + on-brand (deep ink + neon accents) so every panel reads
 * as one cohesive cockpit.
 */

/** Staggered entrance — panels rise + fade in sequence as the cockpit boots. */
export function Rise({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** The frosted-glass panel every chart/table sits inside. */
export function Panel({
  children,
  className,
  glow,
  title,
  subtitle,
  accent,
  right,
}: {
  children: ReactNode;
  className?: string;
  glow?: string;
  title?: string;
  subtitle?: string;
  accent?: string;
  right?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] via-white/[0.02] to-transparent p-5 backdrop-blur-2xl",
        "shadow-[0_28px_70px_-40px_rgba(0,0,0,0.95)] ring-1 ring-inset ring-white/[0.04]",
        className
      )}
    >
      {glow && (
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full opacity-[0.18] blur-3xl"
          style={{ background: glow }}
        />
      )}
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <div className="flex items-center gap-2">
                {accent && <span className="h-3.5 w-1 rounded-full" style={{ background: accent }} />}
                <h3 className="text-[13.5px] font-semibold tracking-tight text-white/90">{title}</h3>
              </div>
            )}
            {subtitle && <p className="mt-0.5 text-[11px] text-white/40">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/** Tiny up/down pill with % delta. Green for up, rose for down (inverts for cost-style metrics). */
export function TrendChip({ delta, invert = false }: { delta: number; invert?: boolean }) {
  const good = invert ? delta < 0 : delta >= 0;
  const Icon = delta >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        good ? "bg-emerald-400/12 text-emerald-300" : "bg-rose-400/12 text-rose-300"
      )}
    >
      <Icon size={11} weight="bold" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

/** Animated counter. `format` picks an Intl preset. */
export function Counter({
  value,
  format,
  className,
}: {
  value: number;
  format: "currency" | "compact" | "number" | "percent";
  className?: string;
}) {
  const opts: Format =
    format === "currency"
      ? { style: "currency", currency: "USD", maximumFractionDigits: 0, notation: value >= 1_000_000 ? "compact" : "standard" }
      : format === "compact"
        ? { notation: "compact", maximumFractionDigits: 1 }
        : format === "percent"
          ? { style: "percent", maximumFractionDigits: 1 }
          : { maximumFractionDigits: 0 };
  return <NumberFlow value={value} format={opts} className={className} />;
}

/** Mini area sparkline for the hero stat cards. */
export function Sparkline({ data, color }: { data: number[]; color: string }) {
  const series = data.map((v, i) => ({ i, v }));
  const id = `spark-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          dot={false}
          isAnimationActive
          animationDuration={1100}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal load/progress meter with an animated fill. */
export function Meter({ value, color, height = 6 }: { value: number; color: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-white/[0.06]" style={{ height }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}cc, ${color})`, boxShadow: `0 0 12px ${color}88` }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/** Status dot + label. */
export function StatusDot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
    </span>
  );
}

/** Glassy dark tooltip shared by every chart on the dashboard. */
export function DashTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Array<{ name?: string; value?: number; color?: string; fill?: string; payload?: any }>;
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-black/85 px-3 py-2 text-[11px] shadow-2xl backdrop-blur-md">
      {label !== undefined && label !== "" && <div className="mb-1 font-medium text-white/80">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-white/65">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto font-semibold text-white">
            {(p.value ?? 0).toLocaleString()}
            {unit ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}
