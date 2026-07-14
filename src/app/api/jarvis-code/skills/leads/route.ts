import { NextResponse } from "next/server";
import { scrapeLinkedInLeads, MAX_LEADS, type LeadFilters } from "@/lib/lead-scraper";
import { enrichLeads, type EnrichedLead } from "@/lib/lead-enrichment";
import { leadsTestMode } from "@/lib/lead-fixtures";
import type { LeadRow, LeadsArtifactData } from "@/lib/jarvis-events";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Skill service: `scrape-leads`. Claude Code (on the user's subscription) does the
 * THINKING — it produces the ICP, the criteria, and the scraper filters — and
 * POSTs them here. This route does only the deterministic, paid heavy-lifting:
 * the real Apify LinkedIn scrape + optional enrichment, then returns the exact
 * `LeadsArtifactData` the dashboard's LeadsArtifact renders. Identical shape to
 * the `/jarvis` engine's `runLeads`, minus the LLM plan step.
 */

type Body = {
  title?: string;
  icp?: string;
  criteria?: string[];
  qualification?: string[];
  searchQuery?: string;
  jobTitles?: string[];
  locations?: string[];
  seniority?: string[];
  functions?: string[];
  companySize?: string[];
  recentlyChangedJobs?: boolean;
  recentlyPostedOnLinkedIn?: boolean;
  count?: number;
  findEmails?: boolean;
  enrich?: boolean;
  grounding?: string[];
};

const arr = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.length ? v.map(String) : undefined;

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* keep defaults */
  }

  const icp = String(body.icp || "").trim();
  const criteria = arr(body.criteria) || [];
  const qualification = arr(body.qualification) || [];
  const grounding = Array.from(new Set(arr(body.grounding) || []));
  const count = Math.max(1, Math.min(MAX_LEADS, Number(body.count) || 25));
  const findEmails = !!body.findEmails;

  const filters: LeadFilters = {
    searchQuery: body.searchQuery || "",
    jobTitles: arr(body.jobTitles),
    locations: arr(body.locations),
    seniority: arr(body.seniority),
    functions: arr(body.functions),
    companySize: arr(body.companySize),
    recentlyChangedJobs: !!body.recentlyChangedJobs,
    recentlyPostedOnLinkedIn: !!body.recentlyPostedOnLinkedIn,
    count,
    findEmails,
  };

  const testMode = leadsTestMode();

  const toRow = (l: EnrichedLead): LeadRow => ({
    name: l.name,
    title: l.title || l.headline,
    company: l.company,
    location: l.location,
    linkedinUrl: l.linkedinUrl,
    email: l.email,
    emailStatus: l.enrichment?.emailStatus,
    headline: l.enrichment?.headline || l.headline,
    about: l.enrichment?.about,
    skills: l.enrichment?.skills,
    recentActivity: l.enrichment?.recentPosts?.[0]?.text,
  });

  const snapshot = (rows: EnrichedLead[], returned: number, configured: boolean, note: string): LeadsArtifactData => ({
    title: icp.length > 0 && icp.length <= 60 ? icp : body.title || `${count} prospects for your ICP`,
    icp: icp || "B2B prospects matching the request",
    criteria,
    qualification,
    leads: rows.map(toRow),
    requested: count,
    returned,
    withEmail: rows.filter((l) => l.email).length,
    enriched: rows.filter((l) => l.enrichment).length,
    verifiedEmail: rows.filter((l) => l.enrichment?.emailVerified).length,
    withActivity: rows.filter((l) => l.enrichment?.recentPosts?.length).length,
    configured,
    note,
    grounding,
    phase: "done",
    testMode,
  });

  try {
    const result = await scrapeLinkedInLeads(filters);
    let finalRows: EnrichedLead[] = result.leads;

    const wantsEnrich = (!!body.enrich || findEmails) && result.ok && result.returned > 0;
    if (wantsEnrich) {
      const enr = await enrichLeads(result.leads, {
        deepProfile: true,
        recentActivity: true,
        verifyEmail: true,
        limit: 40,
      });
      if (enr.configured) {
        finalRows = enr.leads;
        grounding.push("enrichment: deep profile + email verify");
      }
    }

    return NextResponse.json(snapshot(finalRows, result.returned, result.configured, result.note));
  } catch (err) {
    // Always return a valid (plan-only) artifact so the UI can still render.
    return NextResponse.json(
      snapshot([], 0, false, `Scrape failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }
}
