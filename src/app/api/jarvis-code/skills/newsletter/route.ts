import { NextResponse } from "next/server";
import { getBrandKit } from "@/lib/brand-kit";
import { defaultClient } from "@/lib/client-knowledge";
import { generateImage, imageModelConfigured } from "@/lib/openai-image";
import { buildNewsletterHtml, type NewsletterContent } from "@/lib/newsletter";
import type { NewsletterArtifactData } from "@/lib/jarvis-events";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Skill service: `write-newsletter`. Claude Code writes the newsletter CONTENT
 * (subject, intro, sections, quote, CTA) on the user's subscription and POSTs it
 * here. This route does the deterministic rendering: up to two light-themed
 * gpt-image assets + the brand-DNA HTML template, returning the exact
 * `NewsletterArtifactData` the dashboard's NewsletterArtifact renders in an
 * iframe. Mirrors the `/jarvis` engine's `runNewsletter`, minus the LLM step.
 */

const newsletterImagePrompt = (desc: string, accent: string) =>
  `A premium, purpose-built editorial illustration for a founder's newsletter — ONE strong, intentional idea, designed by a top brand studio, NOT a generic stock image.\n` +
  `CONCEPT (what is literally in the frame, and the idea it conveys): ${desc}.\n` +
  `STYLE: modern editorial vector illustration with subtle dimensional shading and a fine paper grain; bold, simple, confident shapes; ONE clear focal subject; deliberate composition with generous negative space and intentional use of scale.\n` +
  `PALETTE: warm off-white / cream background, soft warm neutrals, and ${accent} crimson as the SINGLE bold accent. Light, airy, high-key, calm, expensive.\n` +
  `STRICTLY AVOID: photographic stock look, corporate clip-art, smiling business people, hands pointing at floating charts, glossy 3D chrome spheres, random gradient blobs, neon, lens flares, busy clutter — and absolutely NO text, words, letters, numbers, logos, watermarks, or fake UI.`;

type Body = Partial<NewsletterContent> & {
  heroPrompt?: string;
  inlinePrompt?: string;
  grounding?: string[];
};

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* keep defaults */
  }

  const client = await defaultClient();
  const brand = await getBrandKit(client);
  const accent = brand?.accentHex || "#ED1846";
  const signoffDefault = brand?.displayName || "Daniel Paul";

  const content: NewsletterContent = {
    kicker: body.kicker || "The Founder's Note",
    subject: body.subject || "An update from the desk",
    preview: body.preview || body.title || "",
    title: body.title || body.subject || "This week",
    intro: body.intro || "",
    sections: Array.isArray(body.sections) ? body.sections : [],
    quote: body.quote,
    cta: body.cta && body.cta.label && body.cta.url ? body.cta : { label: "Reply and let me know", url: "#" },
    signoff: body.signoff || signoffDefault,
    ps: body.ps,
  };

  try {
    if (imageModelConfigured() && body.heroPrompt) {
      const quality = (process.env.OPENAI_IMAGE_QUALITY as "low" | "medium" | "high" | "auto") || "high";
      const [hero, inline] = await Promise.all([
        generateImage(newsletterImagePrompt(body.heroPrompt, accent), { quality, size: "1536x1024" }),
        body.inlinePrompt
          ? generateImage(newsletterImagePrompt(body.inlinePrompt, accent), { quality, size: "1024x1024" })
          : Promise.resolve(null),
      ]);
      content.heroImage = hero ?? undefined;
      content.inlineImage = inline ?? undefined;
    }
  } catch {
    /* images are best-effort — a text-only newsletter still renders */
  }

  const html = buildNewsletterHtml(brand, content);
  const data: NewsletterArtifactData = {
    subject: content.subject,
    preview: content.preview,
    html,
    grounding: Array.from(new Set(body.grounding || [])),
  };
  return NextResponse.json(data);
}
