import { NextResponse } from "next/server";
import { APP_CLIENT } from "@/lib/client";
import { loadBrandAssetBytes, saveBrandAsset } from "@/lib/brand-kit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/studio/brand/asset?kind=face|logo — proxy private Blob / kit assets for <img>. */
export async function GET(req: Request) {
  try {
    const kind = new URL(req.url).searchParams.get("kind");
    if (kind !== "face" && kind !== "logo") {
      return NextResponse.json({ ok: false, error: "kind=face|logo required" }, { status: 400 });
    }
    const asset = await loadBrandAssetBytes(APP_CLIENT, kind);
    if (!asset) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return new NextResponse(Buffer.from(asset.data), {
      headers: {
        "content-type": asset.contentType,
        "cache-control": "private, max-age=60",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const kind = String(form.get("kind") || "");
    const file = form.get("file");
    if ((kind !== "face" && kind !== "logo") || !file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "kind + file required" }, { status: 400 });
    }
    const name = file.name || "asset.png";
    const ext = name.includes(".") ? name.split(".").pop()! : "png";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = await saveBrandAsset(APP_CLIENT, kind, bytes, ext, file.type || undefined);
    if (!url) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Upload failed — need BLOB_READ_WRITE_TOKEN (auto via Deploy button) or Supabase branding bucket",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
