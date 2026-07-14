import { NextResponse } from "next/server";
import { APP_CLIENT } from "@/lib/client";
import { saveBrandAsset } from "@/lib/brand-kit";

export const runtime = "nodejs";
export const maxDuration = 60;

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
      return NextResponse.json({ ok: false, error: "upload failed — check Supabase storage bucket `branding`" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
