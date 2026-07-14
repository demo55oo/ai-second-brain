import { NextResponse } from "next/server";
import { defaultClient } from "@/lib/client-knowledge";
import { carouselSlidePrompt, generateImage, generateImageWithRefs, imageModelConfigured } from "@/lib/openai-image";
import { getBrandKit, loadBrandFace, loadBrandTemplate, slideRole, brandCarouselSlidePrompt } from "@/lib/brand-kit";

export const runtime = "nodejs";
export const maxDuration = 300; // ONE gpt-image slide (~125s at high quality) fits comfortably

type SlideReq = {
  index: number;
  kind?: "hook" | "body" | "cta";
  title: string;
  body: string;
  layout?: "split" | "stacked" | "statement";
  visual?: string;
  logos?: string[];
};

/**
 * POST /api/carousel/image — render ONE on-brand carousel slide via gpt-image.
 * Called once per slide from the browser (CarouselArtifact), so a full deck never
 * hits the run's serverless timeout and the client can retry any single image that
 * fails. The deck text is written server-side; only the pixels are produced here.
 */
export async function POST(req: Request) {
  if (!imageModelConfigured()) {
    return NextResponse.json({ error: "Image model not configured (set OPENAI_API_KEY)." }, { status: 503 });
  }

  let payload: { topic?: string; total?: number; styleBible?: string; slide?: SlideReq };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { topic = "", total = 1, styleBible = "", slide } = payload;
  if (!slide || typeof slide.index !== "number" || !slide.title) {
    return NextResponse.json({ error: "Missing slide data." }, { status: 400 });
  }

  const client = await defaultClient();
  const brand = await getBrandKit(client);
  const face = brand ? await loadBrandFace(brand) : null;
  const template = brand ? await loadBrandTemplate(client) : null;
  const onBrand = Boolean(brand && face);
  const quality = (process.env.OPENAI_IMAGE_QUALITY as "low" | "medium" | "high" | "auto") || "high";

  const i = slide.index;
  const layout = slide.layout ?? "stacked";

  try {
    const image = onBrand
      ? await generateImageWithRefs(
          brandCarouselSlidePrompt({
            kit: brand!,
            index: i,
            total,
            role: slideRole(i, total),
            layout,
            title: slide.title,
            body: slide.body,
            visual: slide.visual ?? "",
            logos: slide.logos ?? [],
            topic,
            styleRef: Boolean(template),
          }),
          [face!, ...(template ? [template] : [])],
          { quality, size: "1088x1360" }
        )
      : await generateImage(
          carouselSlidePrompt({ index: i + 1, total, title: slide.title, body: slide.body, art: slide.visual ?? "", styleBible, topic }),
          { quality, size: "1088x1360" }
        );
    if (!image) return NextResponse.json({ error: "Image generation returned empty." }, { status: 502 });
    return NextResponse.json({ image });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Image generation failed." }, { status: 502 });
  }
}
