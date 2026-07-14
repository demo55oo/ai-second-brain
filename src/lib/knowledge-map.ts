/**
 * Knowledge Map — the routing brain.
 *
 * Every "student" arrives with the SAME set of business documents (Voice DNA,
 * ICP, Messaging House, Rule of One, ...). This file is the canonical, client-
 * agnostic taxonomy of those document types plus the metadata that lets an
 * agent know WHERE TO LOOK FOR WHAT:
 *
 *   - DOC_TYPES / DocType        — the 12 canonical document types
 *   - KNOWLEDGE_MAP              — per-type metadata (label, authority, which
 *                                  agents it serves, what it answers, summary)
 *   - AGENT_KEYS / AgentKey      — the 5 GTM agents
 *   - AGENT_KNOWLEDGE_SCOPE      — the default doc-types each agent reads
 *
 * The ingestion pipeline writes these doc_types into note frontmatter and the
 * `knowledge_docs` table; the agent tools (listBusinessDocs / readBusinessDoc /
 * searchBusinessDocs) use this map to scope retrieval. One source of truth.
 */

/* ----------------------------- Agents ----------------------------- */

export const AGENT_KEYS = [
  "research",
  "content",
  "marketing",
  "sales",
  "outreach",
] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

/* --------------------------- Document types --------------------------- */

export const DOC_TYPES = [
  "voice-dna",
  "rule-of-one",
  "messaging-house",
  "brand-positioning",
  "business-authority",
  "personal-authority",
  "icp-profile",
  "icp-intake",
  "offer-strategy",
  "strategic-roadmap",
  "business-inbox",
  "profile-optimization",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export type DocMeta = {
  docType: DocType;
  /** Human label shown in the UI + manifest. */
  label: string;
  /**
   * Canonicalness, 1–5. Higher = more authoritative / load-bearing. The voice
   * and the distilled positioning are 5; supporting/intake docs are lower.
   */
  authority: 1 | 2 | 3 | 4 | 5;
  /** Which agents read this document by default. */
  servesAgents: AgentKey[];
  /** One line on what this document IS (shown to the model in listBusinessDocs). */
  summary: string;
  /**
   * The questions this document answers. Drives routing: the model reads these
   * to pick the right doc, and they are indexed for keyword/semantic matching.
   */
  answers: string[];
  /** Structured facets this document supplies (for cross-referencing). */
  provides: string[];
  /**
   * Lowercased substrings used to deterministically map a source filename to a
   * doc_type during ingestion (best-effort; the classifier confirms).
   */
  filenameHints: string[];
};

export const KNOWLEDGE_MAP: Record<DocType, DocMeta> = {
  "voice-dna": {
    docType: "voice-dna",
    label: "Voice DNA Profile",
    authority: 5,
    servesAgents: ["content", "outreach", "marketing"],
    summary:
      "How the founder actually speaks — conversational markers, sentence rhythm, vocabulary, emotional signature. The source of truth for tone.",
    answers: [
      "How does the client speak — tone, fillers, sentence rhythm?",
      "What phrases, words, and patterns do they use naturally?",
      "How casual or formal is their natural voice?",
      "What openers and transitions are authentic to them?",
    ],
    provides: [
      "voice.markers",
      "voice.sentence_patterns",
      "voice.vocabulary",
      "voice.emotional_signature",
      "voice.openers",
    ],
    filenameHints: ["voice dna", "voice-dna", "voice_dna"],
  },

  "rule-of-one": {
    docType: "rule-of-one",
    label: "The Rule of One",
    authority: 5,
    servesAgents: ["research", "content", "marketing", "sales", "outreach"],
    summary:
      "The distilled north star: One Avatar, One Problem, One Solution, One Outcome, plus the narrative 'movie trailer'. The fastest grounding for any agent.",
    answers: [
      "Who is the one ideal avatar?",
      "What is the one core problem they solve?",
      "What is the one solution / offer?",
      "What is the one outcome the client delivers?",
      "What is the brand narrative in one arc?",
    ],
    provides: ["positioning.avatar", "positioning.problem", "positioning.solution", "positioning.outcome", "narrative"],
    filenameHints: ["rule of 1", "rule of one", "rule-of-1", "the rule of"],
  },

  "messaging-house": {
    docType: "messaging-house",
    label: "Messaging House",
    authority: 4,
    servesAgents: ["content", "marketing", "outreach"],
    summary:
      "The messaging system: UVP (short/medium/long), the audience's top wants/aspirations/fears/frustrations, problems→solutions, and proof points.",
    answers: [
      "What is the unique value proposition (short, medium, long)?",
      "What does the audience most want, fear, and feel frustrated by?",
      "What are the top problems and the matched solutions?",
      "What proof points and key messages can we lead with?",
    ],
    provides: ["uvp", "audience.wants", "audience.fears", "audience.frustrations", "problems_solutions", "proof_points"],
    filenameHints: ["messaging house", "messaging-house", "messaging_house"],
  },

  "brand-positioning": {
    docType: "brand-positioning",
    label: "Brand Positioning Strategy",
    authority: 4,
    servesAgents: ["research", "content", "marketing"],
    summary:
      "Market & competitive landscape, the category they own, the positioning thesis, brand promise, brand proof, and brand archetype/personality.",
    answers: [
      "What category does the client own and how is it different?",
      "What is the core positioning thesis / human truth?",
      "What is the brand promise and the proof behind it?",
      "What is the brand archetype, personality, and tone of authority?",
    ],
    provides: ["category", "positioning.thesis", "brand.promise", "brand.proof", "brand.archetype"],
    filenameHints: ["brand positioning", "positioning strategy", "brand-positioning"],
  },

  "business-authority": {
    docType: "business-authority",
    label: "Business Authority Document",
    authority: 4,
    servesAgents: ["content", "research"],
    summary:
      "The content-engine source: positioning & niche clarity, offer depth, ICP refinement, proof/case studies with metrics, evergreen content pillars and subtopics.",
    answers: [
      "What are the evergreen content pillars and subtopics?",
      "What case studies, wins, and metrics prove authority?",
      "What core beliefs and contrarian takes drive the content?",
      "What objections come up and how are they handled?",
    ],
    provides: ["content.pillars", "content.subtopics", "proof.case_studies", "beliefs", "objections"],
    filenameHints: ["business authority", "authority document", "business-authority"],
  },

  "personal-authority": {
    docType: "personal-authority",
    label: "Personal Authority Storytelling",
    authority: 3,
    servesAgents: ["content"],
    summary:
      "The personal STORY BANK — answers to 30 life/career questions (formative moments, lessons, risks, turning points) used to write story-driven, trust-building content.",
    answers: [
      "What personal stories shaped the founder's values and worldview?",
      "What career moments, mistakes, and lessons can anchor a post?",
      "Who influenced them and what beliefs do they live by?",
      "What origin and adversity stories build trust and connection?",
    ],
    provides: ["stories.formative", "stories.career", "stories.lessons", "stories.beliefs"],
    filenameHints: ["personal authority", "storytelling", "story task", "personal-authority"],
  },

  "icp-profile": {
    docType: "icp-profile",
    label: "ICP — Detailed Profile",
    authority: 5,
    servesAgents: ["sales", "outreach", "research"],
    summary:
      "The completed Ideal Customer Profile: firmographics, buying & interest signals, decision process, KPIs/system gaps, and solution mapping. The targeting source of truth.",
    answers: [
      "Who exactly do we target — industry, size, revenue, roles, geography?",
      "What buying signals and interest signals indicate a fit?",
      "What is the decision process, cycle, and budget range?",
      "What KPIs, gaps, and challenges does the buyer face?",
    ],
    provides: ["icp.firmographics", "icp.roles", "icp.buying_signals", "icp.decision_process", "icp.kpis", "icp.challenges"],
    filenameHints: ["detailed (icp)", "detailed icp", "icp).", "icp detailed"],
  },

  "icp-intake": {
    docType: "icp-intake",
    label: "ICP — Intake Answers",
    authority: 3,
    servesAgents: ["sales", "outreach"],
    summary:
      "The raw founder-voice intake behind the ICP: their own words on client problems, frustrations with competitors, desires, and risk/urgency triggers.",
    answers: [
      "In the founder's own words, what do clients want solved most urgently?",
      "What frustrates buyers about current solutions / competitors?",
      "What do buyers desire most (results, feelings, recognition)?",
      "What makes buyers feel at risk if they delay or choose wrong?",
    ],
    provides: ["icp.raw_pains", "icp.competitor_frustrations", "icp.desires", "icp.urgency_triggers"],
    filenameHints: ["icp document", "icp_", "icp document_"],
  },

  "offer-strategy": {
    docType: "offer-strategy",
    label: "Offer Strategy Blueprint",
    authority: 4,
    servesAgents: ["sales", "outreach", "marketing"],
    summary:
      "The offer architecture: primary + entry offers, pricing tiers, phases/deliverables, the competitive landscape, and the three core differentiators.",
    answers: [
      "What is the core offer, its price, and what it includes?",
      "What is the entry-point / lead-magnet offer?",
      "What are the phases, deliverables, and guarantee?",
      "How does the offer differ from competitors?",
    ],
    provides: ["offer.primary", "offer.entry", "offer.pricing", "offer.deliverables", "offer.differentiators"],
    filenameHints: ["offer strategy", "offer_strategy", "monetization", "blueprint"],
  },

  "strategic-roadmap": {
    docType: "strategic-roadmap",
    label: "90-Day Strategic Roadmap",
    authority: 3,
    servesAgents: ["sales", "outreach", "marketing"],
    summary:
      "The 90-day go-to-market plan: strategic pillars, ICP targeting criteria, outreach volume goals, the DM/engagement sequence, and lead-magnet cadence.",
    answers: [
      "What are the strategic pillars for the next 90 days?",
      "What are the exact ICP targeting criteria for outreach?",
      "What is the outreach cadence and DM sequence?",
      "What are the volume goals and success metrics?",
    ],
    provides: ["roadmap.pillars", "targeting.criteria", "outreach.cadence", "outreach.dm_sequence", "roadmap.metrics"],
    filenameHints: ["roadmap", "90 day", "90-day", "90 days", "strategic roadmap"],
  },

  "business-inbox": {
    docType: "business-inbox",
    label: "Business Inbox (Business-in-a-Box)",
    authority: 4,
    servesAgents: ["sales", "marketing", "research"],
    summary:
      "The consolidated identity/business master: who they are, product & service portfolio, business model, market context, buyer intelligence, and company narrative.",
    answers: [
      "What is the business identity, purpose, and what they want to be known for?",
      "What is the full product/service portfolio and engagement model?",
      "What is the market context and competitive gap?",
      "Who are the buyers and what are their needs, triggers, and objections?",
    ],
    provides: ["identity.summary", "portfolio", "business.model", "market.context", "buyer.intelligence", "narrative"],
    filenameHints: ["business inbox", "business in a box", "business-inbox", "inbox"],
  },

  "profile-optimization": {
    docType: "profile-optimization",
    label: "Profile Optimization Copy",
    authority: 3,
    servesAgents: ["marketing", "outreach"],
    summary:
      "Ready-to-use profile copy: headline variations, the About/bio narrative, and the call-to-action / DM trigger. Reference for on-platform copy and CTAs.",
    answers: [
      "What headline variations position the founder on their profile?",
      "What is the About / bio copy that converts?",
      "What is the call-to-action and DM trigger word?",
    ],
    provides: ["profile.headlines", "profile.about", "profile.cta"],
    filenameHints: ["profile optimization", "profile-optimization", "profile copy"],
  },
};

/* ----------------------- Per-agent default scope ----------------------- */

/**
 * The doc-types each agent reads by default. The agent can name others
 * explicitly, but this is the deterministic first-pass scope that keeps
 * retrieval focused (e.g. Content always has Voice DNA in scope).
 */
export const AGENT_KNOWLEDGE_SCOPE: Record<AgentKey, DocType[]> = {
  research: ["rule-of-one", "messaging-house", "business-authority", "brand-positioning", "business-inbox", "icp-profile"],
  content: ["voice-dna", "personal-authority", "messaging-house", "business-authority", "rule-of-one", "brand-positioning"],
  marketing: ["voice-dna", "messaging-house", "profile-optimization", "offer-strategy", "brand-positioning", "strategic-roadmap"],
  sales: ["icp-profile", "icp-intake", "offer-strategy", "strategic-roadmap", "rule-of-one", "business-inbox"],
  outreach: ["voice-dna", "icp-profile", "messaging-house", "offer-strategy", "profile-optimization", "strategic-roadmap"],
};

/* ----------------------------- Helpers ----------------------------- */

export function metaForDocType(dt: DocType): DocMeta {
  return KNOWLEDGE_MAP[dt];
}

export function isDocType(value: string): value is DocType {
  return (DOC_TYPES as readonly string[]).includes(value);
}

export function docTypesForAgent(agent: AgentKey): DocType[] {
  return AGENT_KNOWLEDGE_SCOPE[agent] ?? [];
}

/**
 * Best-effort filename → doc_type mapping used by the ingestion pipeline.
 * Returns null when nothing matches (the classifier then decides).
 */
export function docTypeFromFilename(filename: string): DocType | null {
  const name = filename.toLowerCase();
  // Most-specific hints win — sort candidates by longest matching hint.
  let best: { dt: DocType; len: number } | null = null;
  for (const dt of DOC_TYPES) {
    for (const hint of KNOWLEDGE_MAP[dt].filenameHints) {
      if (name.includes(hint) && (!best || hint.length > best.len)) {
        best = { dt, len: hint.length };
      }
    }
  }
  return best?.dt ?? null;
}

/**
 * The manifest an agent sees: for a given scope (or all), what each document is
 * and what it answers — so the model can reason about WHERE TO LOOK.
 */
export function knowledgeManifest(scope?: DocType[]) {
  const types = scope && scope.length ? scope : (DOC_TYPES as readonly DocType[]);
  return types.map((dt) => {
    const m = KNOWLEDGE_MAP[dt];
    return {
      docType: m.docType,
      label: m.label,
      authority: m.authority,
      summary: m.summary,
      answers: m.answers,
    };
  });
}
