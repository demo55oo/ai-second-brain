/**
 * Lead enrichment protocol — turns raw scraped prospects into outreach-ready
 * records. Runs a chain of Apify actors (all pay-per-event, graceful-degrade):
 *
 *   1. DEEP PROFILE  apimaestro/linkedin-profile-detail   (about, experience,
 *                    skills, education, follower count, open-to-work, + email)
 *   2. RECENT ACTIVITY  harvestapi/linkedin-profile-posts (last N posts — angles
 *                    for personalised outreach; same vendor as our search actor)
 *   3. EMAIL FINDER  snipercoder/bulk-linkedin-email-finder (only for leads still
 *                    missing an email after the profile pass — cheap bulk lookup)
 *   4. EMAIL VERIFY  nexgendata/email-verification-tool    (deliverability so we
 *                    never hand outreach an invalid/disposable address)
 *
 * Scope is configurable (deepProfile / recentActivity / verifyEmail). With no
 * APIFY_TOKEN the protocol no-ops and returns the leads unchanged + a clear note.
 * We never fabricate enrichment.
 */

import { runActorSync, apifyConfigured } from "./apify";
import type { Lead } from "./lead-scraper";
import { leadsTestMode, fixtureProfileItem, fixturePostItems, fixtureFinderRows, fixtureVerifyItems } from "./lead-fixtures";
import { mapLimit } from "./concurrency";

const beat = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const PROFILE_DETAIL_ACTOR = "apimaestro/linkedin-profile-detail";
export const PROFILE_POSTS_ACTOR = "harvestapi/linkedin-profile-posts";
export const EMAIL_FINDER_ACTOR = "snipercoder/bulk-linkedin-email-finder";
export const EMAIL_VERIFY_ACTOR = "nexgendata/email-verification-tool";

/** Hard cap on how many leads we deep-enrich per run (cost + concurrency guard). */
export const MAX_ENRICH = 100;
const PROFILE_CONCURRENCY = 6;

export type EmailStatus = "valid" | "invalid" | "catch-all" | "disposable" | "unknown";

export type RecentPost = {
  text: string;
  postedAt?: string;
  reactions?: number;
  comments?: number;
  url?: string;
};

export type EnrichmentFields = {
  about?: string;
  headline?: string;
  skills?: string[];
  experience?: { title: string; company: string; duration?: string }[];
  education?: { school: string; degree?: string }[];
  followerCount?: number;
  openToWork?: boolean;
  recentPosts?: RecentPost[];
  emailStatus?: EmailStatus;
  emailVerified?: boolean;
};

export type EnrichedLead = Lead & { enrichment?: EnrichmentFields };

export type EnrichOptions = {
  deepProfile?: boolean; // apimaestro profile detail
  recentActivity?: boolean; // harvestapi posts
  verifyEmail?: boolean; // find-missing + verify
  maxPostsPerLead?: number; // default 3
  limit?: number; // cap leads enriched (default MAX_ENRICH)
  /** fired after each lead's deep-profile pass completes — lets callers stream rows. */
  onLead?: (lead: EnrichedLead, index: number) => void | Promise<void>;
};

export type EnrichResult = {
  configured: boolean;
  leads: EnrichedLead[];
  enrichedCount: number;
  withEmail: number;
  verifiedEmail: number;
  withActivity: number;
  actorsUsed: string[];
  costEstimateUsd: number;
  note: string;
};

/* --------------------------- helpers --------------------------- */

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** The LinkedIn username/slug for a lead (apimaestro takes username/url/urn). */
export function profileHandle(lead: Lead): string {
  const url = lead.linkedinUrl || "";
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (m) return decodeURIComponent(m[1]);
  if (isStr(lead.id) && !lead.id.startsWith("http")) return lead.id;
  return "";
}

/* --------------------------- normalizers --------------------------- */

function normalizeProfile(item: Record<string, any>): EnrichmentFields & { email?: string } {
  const bi = item?.basic_info ?? {};
  const experience = (Array.isArray(item?.experience) ? item.experience : [])
    .slice(0, 5)
    .map((e: any) => ({ title: String(e?.title ?? ""), company: String(e?.company ?? ""), duration: isStr(e?.duration) ? e.duration : undefined }))
    .filter((e: { title: string; company: string }) => e.title || e.company);
  const education = (Array.isArray(item?.education) ? item.education : [])
    .slice(0, 3)
    .map((e: any) => ({ school: String(e?.school ?? ""), degree: isStr(e?.degree_name) ? e.degree_name : isStr(e?.degree) ? e.degree : undefined }))
    .filter((e: { school: string }) => e.school);
  return {
    about: isStr(bi?.about) ? bi.about : undefined,
    headline: isStr(bi?.headline) ? bi.headline : undefined,
    skills: Array.isArray(bi?.top_skills) ? bi.top_skills.filter(isStr).slice(0, 12) : undefined,
    experience: experience.length ? experience : undefined,
    education: education.length ? education : undefined,
    followerCount: typeof bi?.follower_count === "number" ? bi.follower_count : undefined,
    openToWork: typeof bi?.open_to_work === "boolean" ? bi.open_to_work : undefined,
    email: isStr(bi?.email) ? bi.email : undefined,
  };
}

function normalizePost(item: Record<string, any>): RecentPost & { author: string } {
  const author =
    item?.author?.publicIdentifier ||
    item?.author?.username ||
    (isStr(item?.author?.linkedinUrl) ? (item.author.linkedinUrl.match(/\/in\/([^/?#]+)/i)?.[1] ?? "") : "") ||
    (isStr(item?.authorUrl) ? (item.authorUrl.match(/\/in\/([^/?#]+)/i)?.[1] ?? "") : "") ||
    "";
  const text = [item?.text, item?.content, item?.postText, item?.commentary].find(isStr) ?? "";
  const reactions = [item?.reactionsCount, item?.numLikes, item?.likes, item?.engagement?.reactions].find((v) => typeof v === "number");
  const comments = [item?.commentsCount, item?.numComments, item?.comments, item?.engagement?.comments].find((v) => typeof v === "number");
  return {
    author: String(author).toLowerCase(),
    text: text.replace(/\s+/g, " ").slice(0, 400),
    postedAt: [item?.postedAt, item?.postedDate, item?.date, item?.publishedAt].find(isStr),
    reactions: typeof reactions === "number" ? reactions : undefined,
    comments: typeof comments === "number" ? comments : undefined,
    url: [item?.url, item?.postUrl, item?.link].find(isStr),
  };
}

function emailStatusFrom(v: Record<string, any>): EmailStatus {
  if (v?.isDisposable === true) return "disposable";
  if (v?.isValid === true) return "valid";
  if (v?.isValid === false || v?.mxValid === false || v?.syntaxValid === false) return "invalid";
  return "unknown";
}

/* --------------------------- the protocol --------------------------- */

export async function enrichLeads(leads: Lead[], opts: EnrichOptions = {}): Promise<EnrichResult> {
  const base: EnrichedLead[] = leads.map((l) => ({ ...l }));
  const test = leadsTestMode();
  if (!test && !apifyConfigured()) {
    return {
      configured: false,
      leads: base,
      enrichedCount: 0,
      withEmail: base.filter((l) => l.email).length,
      verifiedEmail: 0,
      withActivity: 0,
      actorsUsed: [],
      costEstimateUsd: 0,
      note: "Enrichment is not configured. Set APIFY_TOKEN to run the protocol (deep profile, recent activity, email find + verify), or LEADS_TEST_MODE=true to mock it. Leads returned unchanged.",
    };
  }

  const limit = Math.min(opts.limit ?? MAX_ENRICH, MAX_ENRICH);
  const targets = base.slice(0, limit).filter((l) => profileHandle(l));
  const actorsUsed = new Set<string>();
  let cost = 0;
  const maxPosts = Math.max(1, Math.min(5, opts.maxPostsPerLead ?? 3));

  // 1. DEEP PROFILE — also yields an email. Streams per-lead via onLead; in TEST
  //    mode runs one-by-one with a small beat so rows visibly dribble in.
  if (opts.deepProfile) {
    await mapLimit(targets, test ? 1 : PROFILE_CONCURRENCY, async (lead, idx) => {
      const username = profileHandle(lead);
      let items: Record<string, any>[] = [];
      if (test) items = [fixtureProfileItem(username)];
      else {
        const res = await runActorSync<Record<string, any>>(PROFILE_DETAIL_ACTOR, { username, includeEmail: true }, { maxItems: 1, timeoutMs: 90_000 });
        if (res.ok) items = res.items;
      }
      actorsUsed.add(PROFILE_DETAIL_ACTOR);
      cost += test ? 0 : 0.005;
      if (items.length) {
        const { email, ...fields } = normalizeProfile(items[0]);
        lead.enrichment = { ...(lead.enrichment ?? {}), ...fields };
        if (!lead.email && email) lead.email = email;
      }
      await opts.onLead?.(lead, idx);
      if (test) await beat(200);
    });
  }

  // 2. RECENT ACTIVITY (bulk; map posts back to leads by handle)
  if (opts.recentActivity && targets.length) {
    const urls = targets.map((l) => l.linkedinUrl).filter(isStr);
    let items: Record<string, any>[] = [];
    if (test) items = fixturePostItems(urls);
    else {
      const res = await runActorSync<Record<string, any>>(
        PROFILE_POSTS_ACTOR,
        { targetUrls: urls, maxPosts: Math.min(urls.length * maxPosts, 200), postedLimit: "any", scrapeReactions: false, scrapeComments: false },
        { maxItems: Math.min(urls.length * maxPosts, 200), timeoutMs: 180_000 }
      );
      if (res.ok) items = res.items;
    }
    actorsUsed.add(PROFILE_POSTS_ACTOR);
    cost += test ? 0 : items.length * 0.002;
    const byAuthor = new Map<string, RecentPost[]>();
    for (const raw of items) {
      const p = normalizePost(raw);
      if (!p.author || !p.text) continue;
      const arr = byAuthor.get(p.author) ?? [];
      if (arr.length < maxPosts) arr.push({ text: p.text, postedAt: p.postedAt, reactions: p.reactions, comments: p.comments, url: p.url });
      byAuthor.set(p.author, arr);
    }
    for (const lead of targets) {
      const posts = byAuthor.get(profileHandle(lead).toLowerCase());
      if (posts?.length) lead.enrichment = { ...(lead.enrichment ?? {}), recentPosts: posts };
    }
  }

  // 3. EMAIL FINDER — only for leads still missing an email
  if (opts.verifyEmail) {
    const needEmail = targets.filter((l) => !l.email && l.linkedinUrl);
    if (needEmail.length) {
      let items: Record<string, any>[] = [];
      if (test) items = fixtureFinderRows(needEmail.map((l) => l.linkedinUrl));
      else {
        const res = await runActorSync<Record<string, any>>(EMAIL_FINDER_ACTOR, { linkedin_url_or_ids: needEmail.map((l) => l.linkedinUrl) }, { maxItems: needEmail.length, timeoutMs: 180_000 });
        if (res.ok) items = res.items;
      }
      actorsUsed.add(EMAIL_FINDER_ACTOR);
      cost += test ? 0 : items.length * 0.001;
      const byQuery = new Map<string, string>();
      for (const row of items) {
        const key = String(row?.["17_Query_linkedin"] ?? row?.["06_Linkedin_url"] ?? "").toLowerCase().trim();
        const email = row?.["04_Email"];
        if (key && isStr(email)) byQuery.set(key, email);
      }
      for (const lead of needEmail) {
        const hit = byQuery.get(lead.linkedinUrl.toLowerCase().trim());
        if (hit) lead.email = hit;
      }
    }

    // 4. EMAIL VERIFY — verify every email we now hold
    const withEmailLeads = targets.filter((l) => isStr(l.email));
    if (withEmailLeads.length) {
      let items: Record<string, any>[] = [];
      if (test) items = fixtureVerifyItems(withEmailLeads.map((l) => l.email));
      else {
        const res = await runActorSync<Record<string, any>>(EMAIL_VERIFY_ACTOR, { emails: withEmailLeads.map((l) => l.email).join("\n") }, { maxItems: withEmailLeads.length, timeoutMs: 120_000 });
        if (res.ok) items = res.items;
      }
      actorsUsed.add(EMAIL_VERIFY_ACTOR);
      cost += test ? 0 : items.length * 0.02;
      const byEmail = new Map<string, EmailStatus>();
      for (const v of items) if (isStr(v?.email)) byEmail.set(v.email.toLowerCase(), emailStatusFrom(v));
      for (const lead of withEmailLeads) {
        const status = byEmail.get(lead.email.toLowerCase()) ?? "unknown";
        lead.enrichment = { ...(lead.enrichment ?? {}), emailStatus: status, emailVerified: status === "valid" };
      }
    }
  }

  const enrichedCount = base.filter((l) => l.enrichment).length;
  const withEmail = base.filter((l) => isStr(l.email)).length;
  const verifiedEmail = base.filter((l) => l.enrichment?.emailVerified).length;
  const withActivity = base.filter((l) => l.enrichment?.recentPosts?.length).length;

  return {
    configured: true,
    leads: base,
    enrichedCount,
    withEmail,
    verifiedEmail,
    withActivity,
    actorsUsed: Array.from(actorsUsed),
    costEstimateUsd: Math.round(cost * 100) / 100,
    note: `${test ? "TEST · " : ""}Enriched ${enrichedCount}/${base.length} leads${opts.verifyEmail ? ` · ${verifiedEmail} verified emails` : ""}${opts.recentActivity ? ` · ${withActivity} with recent activity` : ""}.`,
  };
}
