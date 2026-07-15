/**
 * Deployable API brain engine — Anthropic / Vercel AI Gateway.
 * Emits Jarvis NDJSON so /jarvis-code UI works without Claude CLI.
 *
 * Supports:
 * - Grounded text answers from BRAIN.md / vault / bundled knowledge
 * - Brand kit injection (Blob / Supabase)
 * - Carousel / visual decks → artifact event (CarouselArtifact renders images via /api/carousel/image)
 */
import { APP_CLIENT } from "./client";
import { encodeCodeEvent, type JarvisCodeEvent } from "./jarvis-code/events";
import { hybridSearch, getIdentityContext, buildIdentityPreamble } from "./vault";
import { searchBusinessDocs, loadClientDocsForBrain } from "./client-knowledge";
import { keywordRoute, node } from "./org";
import { getBrandKit, type BrandKit } from "./brand-kit";
import { NO_EMDASH_RULE, deDash, stripEmDashes } from "./sanitize";
import type { CarouselArtifactData, CarouselSlide, JarvisNodeId } from "./jarvis-events";

export function apiBrainConfigured(): boolean {
  return !!(process.env.AI_GATEWAY_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export function shouldUseApiBrain(): boolean {
  const mode = (process.env.BRAIN_ENGINE || "api").toLowerCase();
  if (mode === "cli") return false;
  if (mode === "api") return true;
  if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
  return apiBrainConfigured();
}

function emit(controller: ReadableStreamDefaultController<Uint8Array>, e: JarvisCodeEvent) {
  controller.enqueue(new TextEncoder().encode(encodeCodeEvent(e)));
}

async function gatherContext(
  instruction: string,
  clientNotes?: Array<{ path: string; title: string; body: string; folder?: string }>
): Promise<{
  hits: Awaited<ReturnType<typeof hybridSearch>>;
  docs: string;
  preamble: string;
  source: "vault" | "bundled";
  brainDoc?: string;
}> {
  let hits: Awaited<ReturnType<typeof hybridSearch>> = [];

  let userVault = false;
  try {
    const { hasUserVault } = await import("./vault-supabase");
    userVault = await hasUserVault();
  } catch {
    userVault = false;
  }
  try {
    const {
      hasOwnerKnowledge,
      listOwnerNotes,
      readOwnerBrainMarkdown,
      searchOwnerNotes,
    } = await import("./owner-knowledge");
    if ((await hasOwnerKnowledge()) && !userVault) {
      const brainDoc = (await readOwnerBrainMarkdown()) || "";
      hits = await searchOwnerNotes(instruction, 8);
      if (!hits.length) {
        const notes = await listOwnerNotes();
        hits = notes.slice(0, 8).map((n, i) => ({
          id: n.path,
          title: n.title,
          folder: n.folder,
          excerpt: n.body.slice(0, 600),
          source: { keyword: i, semantic: null as number | null },
          score: 1,
        }));
      }
      return { hits, docs: "", preamble: "", source: "vault", brainDoc };
    }
  } catch {
    /* ignore */
  }

  if (userVault) {
    try {
      hits = await hybridSearch(instruction, 8);
    } catch (err) {
      console.warn("[api-brain] vault search failed:", err);
    }
    return { hits, docs: "", preamble: "", source: "vault" };
  }

  if (clientNotes && clientNotes.length > 0) {
    const { buildBrainMarkdown, rankNotes } = await import("./owner-knowledge");
    const notes = clientNotes.map((n) => ({
      path: n.path,
      title: n.title,
      body: n.body,
      folder: n.folder || "owner",
    }));
    hits = rankNotes(notes, instruction, 8);
    if (!hits.length) {
      hits = notes.slice(0, 8).map((n, i) => ({
        id: n.path,
        title: n.title,
        folder: n.folder,
        excerpt: n.body.slice(0, 600),
        source: { keyword: i, semantic: null as number | null },
        score: 1,
      }));
    }
    const brainDoc = buildBrainMarkdown(
      clientNotes.map((n) => ({ filename: n.path, title: n.title, body: n.body }))
    );
    return { hits, docs: "", preamble: "", source: "vault", brainDoc };
  }

  try {
    hits = await hybridSearch(instruction, 8);
  } catch (err) {
    console.warn("[api-brain] vault search failed:", err);
  }

  let docs = "";
  try {
    const business = await searchBusinessDocs({ query: instruction, limit: 4 });
    if (business.results.length) {
      docs = business.results
        .map((d) => `### ${d.title} (${d.docType})\n${d.excerpt.slice(0, 2500)}`)
        .join("\n\n");
    } else {
      const { docs: all } = await loadClientDocsForBrain();
      docs = all
        .slice(0, 3)
        .map((d) => `### ${d.title} (${d.docType})\n${d.body.slice(0, 1800)}`)
        .join("\n\n");
    }
  } catch {
    /* curated knowledge optional */
  }

  let preamble = "";
  try {
    const identity = await getIdentityContext();
    preamble = buildIdentityPreamble(identity);
  } catch {
    /* optional */
  }

  return { hits, docs, preamble, source: "bundled" };
}

async function loadBrandBlock(): Promise<{ kit: BrandKit | null; block: string }> {
  try {
    const kit = await getBrandKit(APP_CLIENT);
    if (!kit) return { kit: null, block: "" };
    const block = [
      "LOCKED BRAND KIT (use for voice, naming, accent, and visual style):",
      `Display name: ${kit.displayName || "the founder"}`,
      kit.handle ? `Handle: @${kit.handle.replace(/^@/, "")}` : "",
      kit.tagline ? `Tagline: ${kit.tagline}` : "",
      `Accent: ${kit.accentHex}`,
      kit.fonts ? `Fonts: ${kit.fonts}` : "",
      kit.styleSpec ? `Style bible:\n${kit.styleSpec.slice(0, 4000)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { kit, block };
  } catch {
    return { kit: null, block: "" };
  }
}

async function completeChat(
  system: string,
  user: string,
  signal?: AbortSignal,
  maxTokens = 4096
): Promise<string> {
  const gateway = process.env.AI_GATEWAY_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const rawModel = process.env.AI_MODEL || "anthropic/claude-sonnet-4-6";

  if (gateway) {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gateway}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: rawModel,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI Gateway chat failed (${res.status}): ${body.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  if (anthropicKey) {
    const model = rawModel.includes("/") ? rawModel.split("/").slice(1).join("/") : rawModel;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic chat failed (${res.status}): ${body.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    return (data.content || [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n")
      .trim();
  }

  throw new Error(
    "No LLM key configured. Set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY to run the API brain."
  );
}

function parseSlideCount(instruction: string, def = 5): number {
  const t = instruction.toLowerCase();
  const NUM_WORDS: Record<string, number> = {
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  let n =
    Number((t.match(/(\d{1,2})\s*-?\s*slide/) || [])[1]) ||
    Number((t.match(/carousel\s+(?:of|with|in)\s+(\d{1,2})/) || [])[1]) ||
    NUM_WORDS[(t.match(/\b(three|four|five|six|seven|eight|nine|ten)\b\s+slide/) || [])[1] || ""] ||
    0;
  if (!n) return def;
  return Math.max(3, Math.min(10, Math.round(n)));
}

function extractJsonObject(text: string): Record<string, unknown> {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model did not return JSON for the carousel deck.");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function vaultBlockFromContext(ctx: Awaited<ReturnType<typeof gatherContext>>): string {
  if (ctx.brainDoc) return ctx.brainDoc.slice(0, 100_000);
  if (ctx.hits.length) {
    return ctx.hits
      .map((h, i) => `[${i + 1}] [[${h.title}]] (${h.folder})\n${h.excerpt}`)
      .join("\n\n");
  }
  if (ctx.source === "vault") {
    return "(no close vault matches — stay within the owner's uploaded notes; do not invent a Danny/demo identity)";
  }
  return ctx.docs || "(no vault chunks yet)";
}

async function buildCarouselDeck(opts: {
  instruction: string;
  vaultBlock: string;
  brandBlock: string;
  kit: BrandKit | null;
  grounding: string[];
  signal?: AbortSignal;
}): Promise<CarouselArtifactData> {
  const slideCount = parseSlideCount(opts.instruction);
  const who = opts.kit?.displayName || "the founder";

  const system = `You are ${who}'s Carousel specialist inside their AI Second Brain.
You produce LinkedIn/Instagram swipe decks as STRICT JSON (no markdown prose outside JSON).
Ground every claim in the second-brain notes and brand kit. Never invent metrics.
Never claim you cannot generate images — the dashboard renders branded slide images from your deck.
${NO_EMDASH_RULE}

${opts.brandBlock ? opts.brandBlock + "\n" : ""}
Second brain / knowledge:
${opts.vaultBlock}

Return ONLY a JSON object with this shape:
{
  "topic": "3-6 word subject",
  "hook": "scroll-stopping first line",
  "styleBible": "ONE concrete paragraph: shared visual template, colors (use brand accent if given), typography, mood",
  "caption": "LinkedIn caption, no hashtag spam",
  "slides": [
    {
      "kind": "hook" | "body" | "cta",
      "layout": "split" | "stacked" | "statement",
      "title": "3-6 word headline",
      "body": "1-2 punchy sentences",
      "logos": ["BrandName"],
      "visual": "concrete main visual: real logos / UI mockups, not abstract art"
    }
  ]
}
EXACTLY ${slideCount} slides. Slide 1 kind=hook, last kind=cta, middle kind=body.`;

  const raw = await completeChat(system, opts.instruction, opts.signal, 6000);
  const obj = deDash(extractJsonObject(raw));
  const slidesRaw = Array.isArray(obj.slides) ? obj.slides : [];
  const slides: CarouselSlide[] = slidesRaw.slice(0, slideCount).map((s, i) => {
    const row = (s || {}) as Record<string, unknown>;
    const kind = row.kind === "hook" || row.kind === "cta" || row.kind === "body" ? row.kind : i === 0 ? "hook" : i === slidesRaw.length - 1 ? "cta" : "body";
    const layout =
      row.layout === "split" || row.layout === "stacked" || row.layout === "statement"
        ? row.layout
        : kind === "hook" || kind === "cta"
          ? "statement"
          : "split";
    return {
      n: i + 1,
      kind,
      title: String(row.title || `Slide ${i + 1}`),
      body: String(row.body || ""),
      layout,
      visual: String(row.visual || ""),
      logos: Array.isArray(row.logos) ? row.logos.map(String) : [],
    };
  });

  while (slides.length < Math.min(3, slideCount)) {
    slides.push({
      n: slides.length + 1,
      kind: slides.length === 0 ? "hook" : "body",
      title: "Your edge",
      body: "Make the offer unmistakable.",
      layout: "statement",
      visual: "",
      logos: [],
    });
  }
  if (slides.length) {
    slides[0].kind = "hook";
    slides[slides.length - 1].kind = "cta";
  }

  const styleBible =
    String(obj.styleBible || "").trim() ||
    opts.kit?.styleSpec?.slice(0, 1200) ||
    `Clean dark founder carousel. Accent ${opts.kit?.accentHex || "#ED1846"}. Bold condensed headlines, short body copy, real product logos.`;

  return {
    topic: String(obj.topic || "Carousel").slice(0, 80),
    hook: String(obj.hook || slides[0]?.title || "").slice(0, 200),
    slides,
    caption: String(obj.caption || "").slice(0, 1200),
    grounding: opts.grounding,
    styleBible,
  };
}

function formatLeaf(plan: JarvisNodeId[]): JarvisNodeId {
  const formats: JarvisNodeId[] = ["carousel", "newsletter", "picture", "reels", "longform", "text"];
  for (const f of formats) {
    if (plan.includes(f)) return f === "picture" ? "carousel" : f;
  }
  return "text";
}

export function runApiBrainStream(
  instruction: string,
  signal?: AbortSignal,
  clientNotes?: Array<{ path: string; title: string; body: string; folder?: string }>
): ReadableStream<Uint8Array> {
  const runId = `api_${Date.now().toString(36)}`;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const at = () => Date.now();
      try {
        const plan = keywordRoute(instruction);
        const leaf = formatLeaf(plan.assignments[0]?.plan || ["text"]);
        const routePlan: JarvisNodeId[] =
          leaf === "carousel" ? ["research", "content", "carousel"] : ["research", "content", "text"];

        emit(controller, { type: "run.start", runId, instruction, at: at() });
        emit(controller, {
          type: "route",
          rationale: plan.rationale || "Grounding in your second brain, then producing the deliverable.",
          assignments: [{ department: "cmo", plan: routePlan }],
          shared: ["research"],
          at: at(),
        });
        emit(controller, { type: "agent.activate", node: "research", label: "Second Brain", at: at() });
        emit(controller, {
          type: "agent.tool",
          node: "research",
          tool: "Second Brain",
          detail: instruction.slice(0, 80),
          at: at(),
        });

        const [{ hits, docs, preamble, source, brainDoc }, brand] = await Promise.all([
          gatherContext(instruction, clientNotes),
          loadBrandBlock(),
        ]);

        const grounding = hits.map((h) => h.title).slice(0, 6);
        if (brand.kit?.displayName) grounding.unshift(`brand: ${brand.kit.displayName}`);

        emit(controller, {
          type: "agent.status",
          node: "research",
          status:
            source === "vault"
              ? brainDoc
                ? `Your BRAIN.md · ${hits.length} sections · ${grounding.slice(0, 3).join(", ")}`
                : hits.length
                  ? `Your vault · ${hits.length} hits · ${grounding.slice(0, 3).join(", ")}`
                  : "Your vault is indexed — answering from uploaded notes"
              : docs
                ? "Using bundled demo knowledge (upload your markdown to replace it)"
                : "No knowledge yet — upload notes on /brain",
          at: at(),
        });
        emit(controller, {
          type: "agent.output",
          node: "research",
          summary:
            source === "vault"
              ? `Using your brain${brand.kit ? " + brand kit" : ""} — Danny demo ignored`
              : "Using bundled demo knowledge",
          at: at(),
        });
        emit(controller, {
          type: "agent.report",
          from: "research",
          to: "kronos",
          summary: source === "vault" ? `brain · ${hits.length}` : "bundled demo",
          at: at(),
        });

        const vaultBlock = vaultBlockFromContext({ hits, docs, preamble, source, brainDoc });

        if (leaf === "carousel") {
          emit(controller, {
            type: "agent.activate",
            node: "carousel",
            label: node("carousel").label,
            at: at(),
          });
          emit(controller, {
            type: "agent.status",
            node: "carousel",
            status: brand.kit ? `Writing on-brand deck for ${brand.kit.displayName || "you"}` : "Writing carousel deck",
            at: at(),
          });

          const deck = await buildCarouselDeck({
            instruction,
            vaultBlock,
            brandBlock: brand.block,
            kit: brand.kit,
            grounding,
            signal,
          });

          emit(controller, {
            type: "agent.output",
            node: "carousel",
            summary: `${deck.slides.length} slides · "${deck.topic}"`,
            at: at(),
          });
          emit(controller, {
            type: "agent.status",
            node: "carousel",
            status: "Deck ready · rendering visuals in the Carousel tab",
            at: at(),
          });
          emit(controller, { type: "artifact", kind: "carousel", data: deck, at: at() });
          emit(controller, {
            type: "agent.report",
            from: "carousel",
            to: "kronos",
            summary: "Carousel delivered",
            at: at(),
          });

          const briefing = stripEmDashes(
            [
              `## ${deck.topic}`,
              "",
              `**${deck.slides.length}-slide carousel** is in the **Carousel** tab — slides render with your brand kit${brand.kit?.displayName ? ` (${brand.kit.displayName})` : ""}.`,
              "",
              deck.hook ? `**Hook:** ${deck.hook}` : "",
              "",
              "**Slide outline**",
              ...deck.slides.map((s) => `- **${s.n}. ${s.title}** — ${s.body}`),
              "",
              deck.caption ? `**Caption**\n${deck.caption}` : "",
              "",
              grounding.length ? `_Grounded in: ${grounding.join(", ")}_` : "",
            ]
              .filter(Boolean)
              .join("\n")
          );

          emit(controller, {
            type: "response",
            format: "blocks",
            markdown: briefing,
            at: at(),
          });
        } else {
          emit(controller, { type: "agent.activate", node: "text", label: "Writing", at: at() });
          emit(controller, {
            type: "agent.status",
            node: "text",
            status: "Drafting the answer",
            at: at(),
          });

          const system =
            source === "vault"
              ? `You are the owner's second-brain operator and marketing strategist.
Ground answers ONLY in the second-brain document and brand kit below.
Do NOT use any Danny / demo founder profile unless it appears in the owner's notes.
Cite sources inline as [[Section Title]]. Be direct and specific.
You are NOT a text-only chatbot. When the user wants a carousel, swipe deck, graphic, or designed visual, tell them to ask for a "carousel" / "swipe deck" and that the Carousel tab will render branded slides — do NOT invent Midjourney/Canva workarounds or claim you cannot generate images.
For this text reply: write sharp, usable copy (hooks, posts, profiles, briefs) from their knowledge.
${NO_EMDASH_RULE}

${brand.block ? brand.block + "\n" : ""}
Second brain document:
${vaultBlock}`
              : `You are the founder's second-brain operator for the bundled demo client "${APP_CLIENT}".
Answer using retrieved notes when relevant. Cite [[Note Title]].
You are NOT text-only — carousel/visual asks are handled by the carousel pipeline; do not claim you cannot generate images.
${NO_EMDASH_RULE}

${brand.block ? brand.block + "\n" : ""}
${preamble ? `Identity context:\n${preamble}\n` : ""}
Retrieved vault chunks:
${vaultBlock}

${docs ? `Curated knowledge docs:\n${docs}` : ""}`;

          const full = stripEmDashes(await completeChat(system, instruction, signal));

          emit(controller, {
            type: "agent.output",
            node: "text",
            summary: "Answer ready",
            at: at(),
          });
          emit(controller, {
            type: "agent.report",
            from: "text",
            to: "kronos",
            summary: "Delivered",
            at: at(),
          });
          emit(controller, {
            type: "response",
            format: "blocks",
            markdown: full || "_No response generated._",
            at: at(),
          });
        }

        emit(controller, {
          type: "meta",
          at: at(),
          model: process.env.AI_MODEL || "anthropic/claude-sonnet-4-6",
          numTurns: 1,
        });
        emit(controller, { type: "run.complete", at: at() });
      } catch (err) {
        emit(controller, {
          type: "run.error",
          message: err instanceof Error ? err.message : String(err),
          at: Date.now(),
        });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
}
