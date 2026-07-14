import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Optional brand style extraction — not required for the AI brain path. */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Style extraction is optional and not enabled in this slim brain build. Paste a style spec manually.",
    },
    { status: 501 }
  );
}
