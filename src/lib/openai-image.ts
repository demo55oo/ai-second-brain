/**
 * OpenAI image generation (gpt-image). Used to render real carousel slide
 * visuals from per-slide art direction — the same shape as lollo's nano-banana
 * pipeline (write an image prompt per slide, then generate), but on OpenAI's
 * image model. Set OPENAI_API_KEY (and optionally OPENAI_IMAGE_MODEL /
 * OPENAI_IMAGE_QUALITY) in the env. Degrades gracefully to null so a run still
 * completes with text-only slides when no key is present.
 */

const ENDPOINT = "https://api.openai.com/v1/images/generations";
const EDIT_ENDPOINT = "https://api.openai.com/v1/images/edits";

// gpt-image-2 accepts any size where BOTH dims are divisible by 16. 1088x1360 is
// the exact 4:5 portrait (the founder's carousel format); 1024x1536 is 2:3.
export type ImageSize = "1024x1024" | "1024x1536" | "1088x1360" | "1536x1024" | "auto";

export function imageModelConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export type RefImage = { data: Uint8Array | Buffer; name?: string; type?: string };

/**
 * Generate one image FROM reference images (gpt-image-2 edits endpoint). The refs
 * are used as likeness/style context — e.g. the founder's face shot so they
 * appear on cover/closing slides, plus a brand style frame for consistency.
 * Returns a `data:` URL, or null if unavailable/failed.
 */
export async function generateImageWithRefs(
  prompt: string,
  refs: RefImage[],
  opts?: { size?: ImageSize; quality?: "low" | "medium" | "high" | "auto" }
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!refs.length) return generateImage(prompt, opts);
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
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
      // cast: a Uint8Array is a valid BlobPart at runtime; TS's generic ArrayBufferLike trips here
      const blob = new Blob([bytes as unknown as BlobPart], { type: r.type || "image/png" });
      // gpt-image accepts multiple reference images via repeated image[] fields
      form.append("image[]", blob, r.name || `ref-${i}.png`);
    });
    const res = await fetch(EDIT_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      console.error("[openai-image] edit error", res.status, (await res.text().catch(() => "")).slice(0, 400));
      return null;
    }
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const d = json.data?.[0];
    if (d?.b64_json) return `data:image/png;base64,${d.b64_json}`;
    if (d?.url) return d.url;
    return null;
  } catch (err) {
    console.error("[openai-image] edit exception", err);
    return null;
  }
}

/** Generate one image. Returns a `data:` URL, or null if unavailable/failed. */
export async function generateImage(
  prompt: string,
  opts?: { size?: ImageSize; quality?: "low" | "medium" | "high" | "auto" }
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const quality = opts?.quality || (process.env.OPENAI_IMAGE_QUALITY as "high") || "high";
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        prompt,
        size: opts?.size || "1088x1360",
        quality,
        n: 1,
      }),
    });
    if (!res.ok) {
      console.error("[openai-image] error", res.status, (await res.text().catch(() => "")).slice(0, 400));
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
 * Build the image prompt for ONE carousel slide. The on-slide text is rendered
 * verbatim and a shared style bible is repeated on every slide so the set reads
 * as one cohesive carousel (gpt-image generations can't take reference images,
 * so the style bible is how we hold consistency).
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
  const overlay = [title, body].filter(Boolean).join(" — ");
  return [
    `Premium Instagram carousel slide ${index} of ${total}, portrait orientation, high-end social design.`,
    `Topic of the whole carousel: ${topic}.`,
    `Render this text overlay on the slide VERBATIM (no paraphrasing, no spelling changes), in a sleek modern sans-serif with strong hierarchy: "${overlay}".`,
    `Background art for THIS slide: ${art}.`,
    `High contrast between text and background, generous margins, clean composition, editorial polish, no watermark, no UI chrome, no borders.`,
    `SHARED STYLE BIBLE — match exactly on every slide so the set is cohesive: ${styleBible}.`,
  ].join(" ");
}
