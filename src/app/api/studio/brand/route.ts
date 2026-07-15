import { NextResponse } from "next/server";
import { APP_CLIENT } from "@/lib/client";
import { getBrandKit, saveBrandKit } from "@/lib/brand-kit";

export const runtime = "nodejs";

export async function GET() {
  try {
    const kit = await getBrandKit(APP_CLIENT);
    return NextResponse.json({ ok: true, kit, client: APP_CLIENT });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { fields?: Record<string, unknown> };
    if (!body.fields) {
      return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
    }
    const ok = await saveBrandKit(APP_CLIENT, body.fields as Parameters<typeof saveBrandKit>[1]);
    if (!ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Save failed — need Blob (Deploy button) or Supabase brand_kits. No storage configured.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
