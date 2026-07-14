/**
 * Dummy telemetry for the Second Brain mission-control dashboard (`/jarvis/dashboard`).
 *
 * This is a SHOWCASE surface — believable, on-brand numbers for an autonomous
 * GTM operating system: revenue + pipeline, leads sourced, reach, content
 * shipped, department workloads, live agent activity. None of it is wired to a
 * backend; it exists to demo what a Jarvis-grade cockpit feels like.
 */

export const BRAND = {
  cyan: "#22d3ee",
  violet: "#a78bfa",
  emerald: "#34d399",
  sky: "#38bdf8",
  amber: "#f59e0b",
  rose: "#fb7185",
  fuchsia: "#d946ef",
  gold: "#fbbf24",
} as const;

/* ───────────────────────── hero KPIs ───────────────────────── */

export type Kpi = {
  key: string;
  label: string;
  value: number;
  /** Intl format: "currency" | "compact" | "number" | "percent" */
  format: "currency" | "compact" | "number" | "percent";
  delta: number; // pct change vs prior period
  caption: string;
  color: string;
  spark: number[];
};

export const KPIS: Kpi[] = [
  {
    key: "mrr",
    label: "Recurring revenue",
    value: 284920,
    format: "currency",
    delta: 18.2,
    caption: "MRR · vs last month",
    color: BRAND.emerald,
    spark: [182, 191, 204, 210, 228, 241, 236, 255, 268, 274, 285],
  },
  {
    key: "pipeline",
    label: "Open pipeline",
    value: 1240000,
    format: "currency",
    delta: 12.4,
    caption: "Qualified · 64 deals",
    color: BRAND.cyan,
    spark: [820, 910, 880, 1010, 1060, 1120, 1090, 1180, 1210, 1240],
  },
  {
    key: "leads",
    label: "Leads sourced",
    value: 12847,
    format: "compact",
    delta: 24.1,
    caption: "Autonomous · this quarter",
    color: BRAND.amber,
    spark: [410, 520, 640, 700, 880, 940, 1020, 1140, 1210, 1290, 1340],
  },
  {
    key: "reach",
    label: "Audience reach",
    value: 4820000,
    format: "compact",
    delta: 9.3,
    caption: "Impressions · 30 days",
    color: BRAND.violet,
    spark: [300, 340, 360, 410, 390, 450, 470, 520, 540, 560, 600],
  },
];

/* ─────────────────── revenue + pipeline (area) ─────────────────── */

export type RevenuePoint = { month: string; revenue: number; pipeline: number; target: number };

export const REVENUE_SERIES: RevenuePoint[] = [
  { month: "Jul", revenue: 142, pipeline: 620, target: 150 },
  { month: "Aug", revenue: 168, pipeline: 705, target: 175 },
  { month: "Sep", revenue: 191, pipeline: 740, target: 200 },
  { month: "Oct", revenue: 205, pipeline: 880, target: 220 },
  { month: "Nov", revenue: 232, pipeline: 960, target: 245 },
  { month: "Dec", revenue: 248, pipeline: 1010, target: 270 },
  { month: "Jan", revenue: 261, pipeline: 1080, target: 285 },
  { month: "Feb", revenue: 274, pipeline: 1160, target: 300 },
  { month: "Mar", revenue: 285, pipeline: 1240, target: 310 },
];

/* ───────────────────── channel mix (donut) ───────────────────── */

export type ChannelSlice = { name: string; value: number; color: string };

export const CHANNEL_MIX: ChannelSlice[] = [
  { name: "LinkedIn", value: 42, color: BRAND.cyan },
  { name: "Cold email", value: 28, color: BRAND.amber },
  { name: "Inbound web", value: 18, color: BRAND.violet },
  { name: "Referral", value: 12, color: BRAND.emerald },
];

/* ─────────────────── leads sourced (weekly bars) ─────────────────── */

export type LeadWeek = { week: string; scraped: number; qualified: number };

export const LEADS_WEEKLY: LeadWeek[] = [
  { week: "W1", scraped: 940, qualified: 412 },
  { week: "W2", scraped: 1180, qualified: 524 },
  { week: "W3", scraped: 1020, qualified: 498 },
  { week: "W4", scraped: 1340, qualified: 690 },
  { week: "W5", scraped: 1210, qualified: 612 },
  { week: "W6", scraped: 1480, qualified: 754 },
  { week: "W7", scraped: 1390, qualified: 712 },
  { week: "W8", scraped: 1620, qualified: 868 },
];

/* ─────────────────── reach + engagement (line) ─────────────────── */

export type ReachPoint = { day: string; reach: number; engaged: number };

export const REACH_SERIES: ReachPoint[] = [
  { day: "Mon", reach: 312, engaged: 41 },
  { day: "Tue", reach: 358, engaged: 52 },
  { day: "Wed", reach: 401, engaged: 58 },
  { day: "Thu", reach: 372, engaged: 49 },
  { day: "Fri", reach: 489, engaged: 71 },
  { day: "Sat", reach: 421, engaged: 63 },
  { day: "Sun", reach: 538, engaged: 88 },
];

/* ───────────────────── departments (the C-suite) ───────────────────── */

export type Department = {
  id: string;
  title: string;
  role: string;
  icon: string; // phosphor name
  color: string;
  status: "running" | "idle" | "queued";
  load: number; // 0..100
  tasksDone: number;
  metricLabel: string;
  metricValue: string;
  detail: string;
};

export const DEPARTMENTS: Department[] = [
  {
    id: "cmo",
    title: "CMO",
    role: "Marketing",
    icon: "Megaphone",
    color: BRAND.violet,
    status: "running",
    load: 82,
    tasksDone: 148,
    metricLabel: "Content shipped",
    metricValue: "37 assets",
    detail: "Drafting a 5-slide carousel in your voice",
  },
  {
    id: "cro",
    title: "CRO",
    role: "Sales & leads",
    icon: "Target",
    color: BRAND.amber,
    status: "running",
    load: 91,
    tasksDone: 206,
    metricLabel: "Prospects scraped",
    metricValue: "1,284",
    detail: "Enriching ICP batch · 50/50 with emails",
  },
  {
    id: "cto",
    title: "CTO",
    role: "Tech & build",
    icon: "Cpu",
    color: BRAND.sky,
    status: "queued",
    load: 34,
    tasksDone: 52,
    metricLabel: "Pages live",
    metricValue: "9 funnels",
    detail: "Landing page queued behind research",
  },
  {
    id: "coo",
    title: "COO",
    role: "Operations",
    icon: "Gear",
    color: BRAND.emerald,
    status: "idle",
    load: 21,
    tasksDone: 88,
    metricLabel: "Workflows live",
    metricValue: "14 SOPs",
    detail: "Standby · weekly standup at 09:00",
  },
];

/* ─────────────────── active campaigns (table) ─────────────────── */

export type Campaign = {
  name: string;
  channel: string;
  status: "live" | "scaling" | "paused";
  sent: number;
  replyRate: number; // pct
  booked: number;
  progress: number; // 0..100
  color: string;
};

export const CAMPAIGNS: Campaign[] = [
  { name: "Q1 Founder Outbound", channel: "LinkedIn", status: "scaling", sent: 4820, replyRate: 11.4, booked: 38, progress: 78, color: BRAND.cyan },
  { name: "RevOps Cold Sequence", channel: "Email", status: "live", sent: 9640, replyRate: 6.8, booked: 52, progress: 64, color: BRAND.amber },
  { name: "Carousel — Diagnostic", channel: "Organic", status: "live", sent: 1, replyRate: 0, booked: 21, progress: 92, color: BRAND.violet },
  { name: "SaaS Renewal Winback", channel: "Email", status: "live", sent: 3210, replyRate: 9.1, booked: 17, progress: 41, color: BRAND.emerald },
  { name: "Partner Referral Push", channel: "Web", status: "paused", sent: 740, replyRate: 14.2, booked: 9, progress: 23, color: BRAND.rose },
];

/* ─────────────────── conversion funnel ─────────────────── */

export type FunnelStage = { stage: string; value: number; color: string };

export const FUNNEL: FunnelStage[] = [
  { stage: "Sourced", value: 12847, color: BRAND.cyan },
  { stage: "Qualified", value: 5380, color: BRAND.sky },
  { stage: "Engaged", value: 2140, color: BRAND.violet },
  { stage: "Meetings", value: 412, color: BRAND.amber },
  { stage: "Won", value: 64, color: BRAND.emerald },
];

/* ─────────────────── live agent activity feed ─────────────────── */

export type ActivityKind = "route" | "scrape" | "content" | "build" | "ops" | "win";

export type Activity = {
  kind: ActivityKind;
  agent: string;
  text: string;
  color: string;
};

/** A loop of believable mission-feed lines — the dashboard streams these in. */
export const ACTIVITY_LOOP: Activity[] = [
  { kind: "route", agent: "CEO", text: "Routed “grow Q1 pipeline” to CRO + CMO in parallel", color: BRAND.cyan },
  { kind: "scrape", agent: "CRO · Leads", text: "Scraped 50 ICP prospects via Apify · 47 with verified emails", color: BRAND.amber },
  { kind: "content", agent: "CMO · Content", text: "Published carousel “The 8-week diagnostic” — in your voice", color: BRAND.violet },
  { kind: "win", agent: "CRO · Sales", text: "Deal moved to Won · Northwind Labs · $24,000 ARR", color: BRAND.emerald },
  { kind: "build", agent: "CTO · Web", text: "Shipped landing page /diagnostic — 4.1s → 0.9s LCP", color: BRAND.sky },
  { kind: "scrape", agent: "Research", text: "Surfaced 3 new market angles from 18 competitor posts", color: BRAND.cyan },
  { kind: "ops", agent: "COO · Ops", text: "Scheduled the week — 12 posts, 3 sequences, 1 webinar", color: BRAND.emerald },
  { kind: "content", agent: "CMO · Content", text: "Drafted 6 cold-email variants · A/B test queued", color: BRAND.violet },
  { kind: "win", agent: "CRO · Sales", text: "Meeting booked · VP Growth @ Stripe-adjacent fintech", color: BRAND.amber },
  { kind: "route", agent: "CEO", text: "Re-prioritized: pushing webpage behind research read", color: BRAND.cyan },
];

/* ─────────────────── secondary stat strip ─────────────────── */

export type MiniStat = { label: string; value: string; delta: number; color: string };

export const MINI_STATS: MiniStat[] = [
  { label: "Reply rate", value: "9.4%", delta: 2.1, color: BRAND.cyan },
  { label: "Meetings booked", value: "137", delta: 14.0, color: BRAND.amber },
  { label: "Win rate", value: "23.8%", delta: 3.6, color: BRAND.emerald },
  { label: "Avg deal size", value: "$19.4k", delta: 5.2, color: BRAND.violet },
  { label: "Content published", value: "312", delta: 28.0, color: BRAND.fuchsia },
  { label: "Cost / lead", value: "$0.41", delta: -11.5, color: BRAND.sky },
];
