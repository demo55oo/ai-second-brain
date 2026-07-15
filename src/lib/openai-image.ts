/**
 * Image generation for carousel slides (gpt-image via OpenAI or Vercel AI Gateway).
 *
 * Auth (either works):
 * - OPENAI_API_KEY → api.openai.com
 * - AI_GATEWAY_API_KEY → ai-gateway.vercel.sh (no separate OpenAI key needed)
 */

const OPENAI_GEN = "https://api.openai.com/v1/images/generations";
const OPENAI_EDIT = "https://api.openai.com/v1/images/edits";
const GATEWAY_GEN = "https://ai-gateway.vercel.sh/v1/images/generations";
const GATEWAY_EDIT = "https://ai-gateway.vercel.sh/v1/images/edits";

export type ImageSize = "1024x1024" | "1024x1536" | "1088x1360" | "1536x1024" | "auto";

function imageAuth(): { key: string; via: "openai" | "gateway" } | null {
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai) return { key: openai, via: "openai" };
  const gateway = process.env.AI_GATEWAY_API_KEY?.trim();
  if (gateway) return { key: gateway, via: "gateway" };
  return null;
}

export function imageModelConfigured(): boolean {
  return imageAuth() !== null;
}

function endpoints(via: "openai" | "gateway") {
  return via === "gateway"
    ? { gen: GATEWAY_GEN, edit: GATEWAY_EDIT }
    : { gen: OPENAI_GEN, edit: OPENAI_EDIT };
}

function imageModel(via: "openai" | "gateway") {
  const raw = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  if (via === "gateway" && !raw.includes("/")) return `openai/${raw}`;
  return raw;
}

export type RefImage = { data: Uint8Array | Buffer; name?: string; type?: string };

/**
 * Generate one image FROM reference images (gpt-image edits endpoint).
 * Returns a `data:` URL, or null if unavailable/failed.
 */
export async function generateImageWithRefs(
  prompt: string,
  refs: RefImage[],
  opts?: { size?: ImageSize; quality?: "low" | "medium" | "high" | "auto" }
): Promise<string | null> {
  const auth = imageAuth();
  if (!auth) return null;
  if (!refs.length) return generateImage(prompt, opts);

  const { gen: _g, edit } = endpoints(auth.via);
  const model = imageModel(auth.via);
  const quality = opts?.quality || (process.env.OPENAI_IMAGE_QUALITY as "high") || "high";
  try {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", opts?.size || "1088x1360");
    form.append("quality", quality);
    form.append("n", "1");
    refs.forEach((r, i) => {
      const bytes = r.data instanceof Uint8Array ? r.data : new Uint8Array(r.data);
      const blob = new Blob([bytes as unknown as BlobPart], { type: r.type || "image/png" });
      form.append("image[]", blob, r.name || `ref-${i}.png`);
    });
    const res = await fetch(edit, {
      method: "POST",
      headers: { authorization: `Bearer ${auth.key}` },
      body: form,
    });
    if (!res.ok) {
      console.error(
        "[openai-image] edit error",
        auth.via,
        res.status,
        (await res.text().catch(() => "")).slice(0, 400)
      );
      // Gateway may not support edits — fall back to text-only generation.
      return generateImage(prompt, opts);
    }
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const d = json.data?.[0];
    if (d?.b64_json) return `data:image/png;base64,${d.b64_json}`;
    if (d?.url) return d.url;
    return null;
  } catch (err) {
    console.error("[openai-image] edit exception", err);
    return generateImage(prompt, opts);
  }
}

/** Generate one image. Returns a `data:` URL, or null if unavailable/failed. */
export async function generateImage(
  prompt: string,
  opts?: { size?: ImageSize; quality?: "low" | "medium" | "high" | "auto" }
): Promise<string | null> {
  const auth = imageAuth();
  if (!auth) return null;
  const { gen } = endpoints(auth.via);
  const model = imageModel(auth.via);
  const quality = opts?.quality || (process.env.OPENAI_IMAGE_QUALITY as "high") || "high";
  try {
    const res = await fetch(gen, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth.key}` },
      body: JSON.stringify({
        model,
        prompt,
        size: opts?.size || "1088x1360",
        quality,
        n: 1,
      }),
    });
    if (!res.ok) {
      console.error(
        "[openai-image] error",
        auth.via,
        res.status,
        (await res.text().catch(() => "")).slice(0, 400)
      );
      return null;
    }
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const d = json.data?.[0];
    if (d?.b64_json) return `data:image/png;base64,${d.b64_json}`;
    if (d?.url) return d.url;
    return null;
  } catch (err) {
    console.error("[openai-image] exception", err);
    return null;
  }
}

/**
 * Build the image prompt for ONE carousel slide.
 */
export function carouselSlidePrompt(args: {
  index: number;
  total: number;
  title: string;
  body: string;
  art: string;
  styleBible: string;
  topic: string;
}): string {
  const { index, total, title, body, art, styleBible, topic } = args;
  return [
    styleBible ? `SHARED STYLE (identical on every slide): ${styleBible}` : "",
    `Carousel topic: ${topic}. Slide ${index} of ${total}.`,
    `HEADLINE (render VERBATIM): "${title}"`,
    body ? `BODY (render VERBATIM): "${body}"` : "",
    art ? `MAIN VISUAL: ${art}` : "",
    `Portrait 4:5 slide. Clean, professional, founder-led. No watermarks, no gibberish text.`,
  ]
    .filter(Boolean)
    .join("\n");
}
