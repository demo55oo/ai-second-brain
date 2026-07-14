/**
 * Deployable API brain engine — raw Anthropic Messages API or Vercel AI Gateway.
 * Emits the same NDJSON Jarvis protocol as the Claude Code CLI path so the
 * existing /jarvis-code UI works without spawning a local binary.
 *
 * Uses fetch (no @ai-sdk runtime) so serverless deploys stay lean.
 */
import { APP_CLIENT } from "./client";
import { encodeCodeEvent, type JarvisCodeEvent } from "./jarvis-code/events";
import { hybridSearch, getIdentityContext, buildIdentityPreamble } from "./vault";
import { searchBusinessDocs, loadClientDocsForBrain } from "./client-knowledge";

export function apiBrainConfigured(): boolean {
  return !!(process.env.AI_GATEWAY_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/** Prefer API brain on serverless, or when BRAIN_ENGINE=api (default). */
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

async function gatherContext(instruction: string): Promise<{
  hits: Awaited<ReturnType<typeof hybridSearch>>;
  docs: string;
  preamble: string;
  source: "vault" | "bundled";
}> {
  let hits: Awaited<ReturnType<typeof hybridSearch>> = [];
  let userVault = false;
  try {
    const { hasUserVault } = await import("./vault-supabase");
    userVault = await hasUserVault();
  } catch {
    userVault = false;
  }

  // User-uploaded vault is the source of truth — do NOT mix in Danny's bundled profile.
  if (userVault) {
    try {
      hits = await hybridSearch(instruction, 8);
    } catch (err) {
      console.warn("[api-brain] vault search failed:", err);
    }
    return { hits, docs: "", preamble: "", source: "vault" };
  }

  // No uploads yet → fall back to bundled content/knowledge (Danny demo).
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

async function completeChat(system: string, user: string, signal?: AbortSignal): Promise<string> {
  const gateway = process.env.AI_GATEWAY_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const rawModel = process.env.AI_MODEL || "anthropic/claude-sonnet-4-6";

  if (gateway) {
    // OpenAI-compatible chat completions via Vercel AI Gateway
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gateway}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: rawModel,
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
        max_tokens: 4096,
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

export function runApiBrainStream(instruction: string, signal?: AbortSignal): ReadableStream<Uint8Array> {
  const runId = `api_${Date.now().toString(36)}`;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const at = () => Date.now();
      try {
        emit(controller, { type: "run.start", runId, instruction, at: at() });
        emit(controller, {
          type: "route",
          rationale: "Grounding in your second brain, then answering.",
          assignments: [{ department: "cmo", plan: ["research", "content", "text"] }],
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

        const { hits, docs, preamble, source } = await gatherContext(instruction);

        const grounding = hits.map((h) => h.title).slice(0, 6);
        emit(controller, {
          type: "agent.status",
          node: "research",
          status:
            source === "vault"
              ? hits.length
                ? `Your vault · ${hits.length} hits · ${grounding.slice(0, 3).join(", ")}`
                : "Your vault is indexed but no close matches — answering from uploaded notes only"
              : docs
                ? "Using bundled demo knowledge (upload your markdown to replace it)"
                : "No knowledge yet — upload notes in settings",
          at: at(),
        });
        emit(controller, {
          type: "agent.output",
          node: "research",
          summary:
            source === "vault"
              ? `Using your uploaded vault only (${hits.length} hits) — Danny demo ignored`
              : "Using bundled demo knowledge",
          at: at(),
        });
        emit(controller, {
          type: "agent.report",
          from: "research",
          to: "kronos",
          summary: source === "vault" ? `vault · ${hits.length}` : "bundled demo",
          at: at(),
        });

        emit(controller, { type: "agent.activate", node: "text", label: "Writing", at: at() });
        emit(controller, { type: "agent.status", node: "text", status: "Drafting the answer", at: at() });

        const vaultBlock = hits.length
          ? hits
              .map((h, i) => `[${i + 1}] [[${h.title}]] (${h.folder})\n${h.excerpt}`)
              .join("\n\n")
          : source === "vault"
            ? "(no close vault matches — stay within the owner's uploaded notes; do not invent a Danny/demo identity)"
            : "(no vault chunks yet)";

        const system =
          source === "vault"
            ? `You are the owner's second-brain operator.
Ground answers ONLY in the retrieved vault notes below (their uploaded markdown).
Do NOT use any Danny / demo founder profile, voice, ICP, or branding.
Cite sources inline as [[Note Title]]. Be direct and specific.
If the notes do not cover the question, say what is missing.

Retrieved vault chunks:
${vaultBlock}`
            : `You are the founder's second-brain operator for the bundled demo client "${APP_CLIENT}".
Answer using the retrieved notes when relevant. Cite sources inline as [[Note Title]].
Be direct, specific, and useful. Prefer short structured answers with markdown.
If knowledge is thin, say so briefly.

${preamble ? `Identity context:\n${preamble}\n` : ""}
Retrieved vault chunks:
${vaultBlock}

${docs ? `Curated knowledge docs:\n${docs}` : ""}`;

        const full = await completeChat(system, instruction, signal);

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
