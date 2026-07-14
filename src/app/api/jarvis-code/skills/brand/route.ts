import { NextResponse } from "next/server";
import { getBrandKit } from "@/lib/brand-kit";
import { defaultClient } from "@/lib/client-knowledge";

export const runtime = "nodejs";

/**
 * Skill helper: returns the founder's LOCKED brand kit (accent, display name,
 * handle, tagline, style bible) so Claude Code can write carousel / post /
 * newsletter copy that is on-voice and on-brand. Visual rendering of carousel
 * slides is still enforced server-side by /api/carousel/image regardless, but
 * this lets the COPY match the brand. No heavy image assets are returned.
 */
export async function GET() {
  const client = await defaultClient();
  const kit = await getBrandKit(client);
  if (!kit) {
    return NextResponse.json({
      ok: false,
      note: "No brand kit configured; use a clean, confident, founder-led voice.",
      brand: { displayName: "Daniel Paul", handle: null, tagline: null, accentHex: "#ED1846", styleBible: "" },
    });
  }
  return NextResponse.json({
    ok: true,
    brand: {
      displayName: kit.displayName,
      handle: kit.handle,
      tagline: kit.tagline,
      accentHex: kit.accentHex,
      fonts: kit.fonts,
      styleBible: kit.styleSpec,
    },
  });
}
