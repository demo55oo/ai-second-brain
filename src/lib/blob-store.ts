/**
 * Shared Vercel Blob helpers for durable app data (brain, brand kit, knowledge).
 * Token is injected when the Deploy button provisions a Blob store — no paste.
 */
export function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function token() {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

export async function blobPutText(
  pathname: string,
  body: string,
  contentType = "text/plain; charset=utf-8"
): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(pathname, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    token: token(),
  });
}

export async function blobPutBytes(
  pathname: string,
  body: Uint8Array,
  contentType: string
): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(pathname, Buffer.from(body), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    token: token(),
  });
}

export async function blobGetText(pathname: string): Promise<string | null> {
  const bytes = await blobGetBytes(pathname);
  if (!bytes) return null;
  return new TextDecoder().decode(bytes.data);
}

export async function blobGetBytes(
  pathname: string
): Promise<{ data: Uint8Array; contentType: string } | null> {
  if (!blobConfigured()) return null;
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(pathname, { access: "private", token: token() });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
    return {
      data: new Uint8Array(buf),
      contentType: result.blob?.contentType || "application/octet-stream",
    };
  } catch {
    try {
      const { head } = await import("@vercel/blob");
      const info = await head(pathname, { token: token() });
      if (!info?.url) return null;
      const res = await fetch(info.url, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) return null;
      return {
        data: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get("content-type") || "application/octet-stream",
      };
    } catch {
      return null;
    }
  }
}

export async function blobList(prefix: string): Promise<string[]> {
  if (!blobConfigured()) return [];
  try {
    const { list } = await import("@vercel/blob");
    const result = await list({ prefix, token: token(), limit: 1000 });
    return result.blobs.map((b) => b.pathname);
  } catch {
    return [];
  }
}

export async function blobDel(pathname: string): Promise<void> {
  if (!blobConfigured()) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(pathname, { token: token() });
  } catch {
    /* ignore */
  }
}
