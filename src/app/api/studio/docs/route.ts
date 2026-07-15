import { NextResponse } from "next/server";
import {
  loadClientDocsForBrain,
  writeBusinessDoc,
} from "@/lib/client-knowledge";
import { isDocType } from "@/lib/knowledge-map";

export const runtime = "nodejs";

/** GET /api/studio/docs — list curated knowledge docs for the settings editor. */
export async function GET() {
  try {
    const { client, docs } = await loadClientDocsForBrain();
    return NextResponse.json({
      ok: true,
      client,
      docs: docs.map((d) => ({
        docType: d.docType,
        title: d.title,
        summary: d.summary,
        authority: d.authority,
        body: d.body,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** PUT /api/studio/docs — save a curated doc body. */
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { docType?: string; body?: string };
    if (!body.docType || !isDocType(body.docType)) {
      return NextResponse.json({ ok: false, error: "invalid docType" }, { status: 400 });
    }
    if (typeof body.body !== "string") {
      return NextResponse.json({ ok: false, error: "missing body" }, { status: 400 });
    }
    const result = await writeBusinessDoc({ docType: body.docType, body: body.body });
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Save failed — need Blob (Deploy button) or a writable disk. Document may be missing.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({
      ok: true,
      client: result.client,
      title: result.title,
      summary: result.summary,
      backend: result.backend,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
