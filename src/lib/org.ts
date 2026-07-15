/**
 * Marketing OS — the org chart. The CEO sits at the top and reads every
 * document. It never does the work itself: it routes each instruction to the CMO,
 * who fires the right specialist sub-agents. Content is itself a small team: it
 * picks a FORMAT (text / picture / carousel / reels / long-form / newsletter) and
 * the matching producer writes it. The user only ever talks to the CEO.
 *
 * SCOPE: this build is marketing-only. The org is CEO -> CMO, plus Research as a
 * shared specialist reporting to the CEO. There is deliberately no COO / CTO /
 * CRO — every instruction lands on the CMO.
 *
 * This is the static topology + the routing brain's option space. The live run
 * (`/api/jarvis/run`) walks this tree and emits jarvis-events as it goes.
 */

import type { JarvisNodeId, RouteAssignment } from "./jarvis-events";
import type { AgentKey } from "./knowledge-map";

export type OrgKind = "ceo" | "department" | "specialist" | "format";

export type OrgNode = {
  id: JarvisNodeId;
  kind: OrgKind;
  /** Short codename shown on the node ("CEO", "CMO", "Research", "Carousel"). */
  title: string;
  /** The human role ("Reads every document", "Marketing", "Text posts"). */
  label: string;
  color: string;
  /** Phosphor icon name, resolved on the client. */
  icon: string;
  parent: JarvisNodeId | null;
  /** For producers: which GTM agent config + knowledge scope it borrows. */
  agentKey?: AgentKey;
};

export const CEO_ID: JarvisNodeId = "kronos";

export const ORG: Record<JarvisNodeId, OrgNode> = {
  kronos: {
    id: "kronos",
    kind: "ceo",
    title: "CEO",
    label: "Reads every document",
    color: "#22d3ee",
    icon: "Brain",
    parent: null,
  },

  /* ---- department head (marketing-only build: the CMO is the whole C-suite) ---- */
  cmo: { id: "cmo", kind: "department", title: "CMO", label: "Marketing", color: "#a78bfa", icon: "Megaphone", parent: "kronos" },

  /* ---- specialists ---- */
  // Research is a SHARED specialist: it reports to the CEO, not to the CMO, and
  // runs once up front for a market/angle read before the content team writes.
  research: { id: "research", kind: "specialist", title: "Research", label: "Trends & angles", color: "#22d3ee", icon: "Binoculars", parent: "kronos", agentKey: "research" },
  content: { id: "content", kind: "specialist", title: "Content", label: "Posts in your voice", color: "#a78bfa", icon: "PenNib", parent: "cmo", agentKey: "content" },

  /* ---- content formats (under Content) ---- */
  text: { id: "text", kind: "format", title: "Text", label: "Text posts", color: "#a78bfa", icon: "Article", parent: "content", agentKey: "content" },
  picture: { id: "picture", kind: "format", title: "Picture", label: "Single-image posts", color: "#c084fc", icon: "Image", parent: "content", agentKey: "content" },
  carousel: { id: "carousel", kind: "format", title: "Carousel", label: "Swipe-through decks", color: "#d946ef", icon: "Cards", parent: "content", agentKey: "content" },
  reels: { id: "reels", kind: "format", title: "Reels", label: "Short-form scripts", color: "#f472b6", icon: "VideoCamera", parent: "content", agentKey: "content" },
  longform: { id: "longform", kind: "format", title: "Long-form", label: "Long-form scripts", color: "#818cf8", icon: "FilmSlate", parent: "content", agentKey: "content" },
  newsletter: { id: "newsletter", kind: "format", title: "Newsletter", label: "Email newsletters", color: "#fb7185", icon: "EnvelopeSimple", parent: "content", agentKey: "content" },
};

export const ALL_NODES: OrgNode[] = Object.values(ORG);
export const DEPARTMENTS: OrgNode[] = ALL_NODES.filter((n) => n.kind === "department");

export const FORMAT_IDS: JarvisNodeId[] = ["text", "picture", "carousel", "reels", "longform", "newsletter"];
export function isFormat(id: JarvisNodeId): boolean {
  return FORMAT_IDS.includes(id);
}

/**
 * Shared specialists are not owned by a department — the CEO fires them once for
 * the whole team before delegating. Research is the only one.
 */
export const SHARED_SPECIALISTS: JarvisNodeId[] = ["research"];
export function isShared(id: JarvisNodeId): boolean {
  return SHARED_SPECIALISTS.includes(id);
}

export function node(id: JarvisNodeId): OrgNode {
  return ORG[id];
}

/** Direct children of a node (the CMO under the CEO, specialists under a dept, formats under Content). */
export function childrenOf(id: JarvisNodeId): OrgNode[] {
  return ALL_NODES.filter((n) => n.parent === id);
}

/** Producing leaves in a node's subtree (nodes that actually do work). */
export function leavesOf(id: JarvisNodeId): JarvisNodeId[] {
  const kids = childrenOf(id);
  if (kids.length === 0) return [id];
  return kids.flatMap((k) => leavesOf(k.id));
}

/** Chain from a node up to (and excluding) the CEO: [self, ...ancestors-below-ceo]. */
export function chainToCeo(id: JarvisNodeId): JarvisNodeId[] {
  const out: JarvisNodeId[] = [id];
  let cur = node(id).parent;
  while (cur && cur !== "kronos") {
    out.push(cur);
    cur = node(cur).parent;
  }
  return out;
}

/* --------------------------- routing --------------------------- */

export type TeamPlan = {
  /** one entry per department head assigned — marketing-only, so always the CMO */
  assignments: RouteAssignment[];
  /** shared specialists (e.g. research) that run ONCE first for the whole team */
  shared: JarvisNodeId[];
  rationale: string;
};

/**
 * Deterministic keyword router — the fast, always-available fallback when the
 * LLM router is unavailable or returns something invalid. Marketing-only: every
 * instruction routes to the CMO, so the only real decision is which content FORMAT.
 */
export function keywordRoute(instruction: string): TeamPlan {
  const t = instruction.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  let format: JarvisNodeId = "text";
  if (has("newsletter", "email newsletter", "broadcast", "email blast", "email campaign", "weekly email")) format = "newsletter";
  else if (
    has(
      "carousel",
      "slides",
      "slide deck",
      "swipe",
      "cheatsheet",
      "cheat sheet",
      "listicle",
      "deck",
      "swipe post"
    )
  )
    format = "carousel";
  else if (
    has(
      "picture",
      "image post",
      "graphic",
      "single image",
      "generate image",
      "generate an image",
      "generate images",
      "create an image",
      "create image",
      "dall-e",
      "dalle",
      "midjourney",
      "canva",
      "visual asset",
      "designed asset",
      "course profile"
    )
  )
    // API brain renders visuals via the carousel pipeline (branded slides).
    format = "carousel";
  else if (has("reel", "short form", "short-form", "tiktok")) format = "reels";
  else if (has("long form", "long-form", "youtube", "video script", "vsl")) format = "longform";
  // Bare "image" / "images" / "visual" (avoid matching "imaginative")
  else if (/\b(images?|visuals?|artwork|poster)\b/i.test(t)) format = "carousel";

  return {
    assignments: [{ department: "cmo", plan: [format] }],
    shared: ["research"],
    rationale:
      format === "text"
        ? "Content writes a post in your voice."
        : `Content writes the ${node(format).title.toLowerCase()}.`,
  };
}

/** The valid option space handed to the LLM router (so it can only pick real producing leaves). */
export const ROUTER_OPTIONS = {
  departments: DEPARTMENTS.map((d) => ({ id: d.id, label: d.label, produces: leavesOf(d.id) })),
  shared: SHARED_SPECIALISTS.map((id) => ({ id, label: node(id).label })),
};
