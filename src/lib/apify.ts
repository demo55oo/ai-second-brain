/**
 * Thin Apify REST client.
 *
 * The Apify MCP tools are available to the *developer's* assistant, but the
 * running Next.js app cannot use them — it calls Apify's HTTP API directly with
 * an APIFY_TOKEN. `runActorSync` runs an actor and returns its dataset items in
 * a single synchronous request (run-sync-get-dataset-items), which is exactly
 * the shape a tool call / specialist needs.
 *
 * Everything degrades gracefully: with no token, callers get a clear
 * `{ ok: false }` and decide how to proceed (we never fabricate scraped data).
 */

const APIFY_BASE = "https://api.apify.com/v2";

export function apifyToken(): string | undefined {
  return process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || undefined;
}

export function apifyConfigured(): boolean {
  return Boolean(apifyToken());
}

export type RunActorResult<T> =
  | { ok: true; items: T[] }
  | { ok: false; error: string; status?: number };

/**
 * Run an Apify actor synchronously and return its dataset items.
 *
 * @param actor  full name "username/name" (e.g. "harvestapi/linkedin-profile-search")
 * @param input  the actor input JSON (per its input schema)
 * @param opts   maxItems (billing/result cap), timeoutMs (client + server run timeout), memoryMbytes
 */
export async function runActorSync<T = Record<string, unknown>>(
  actor: string,
  input: Record<string, unknown>,
  opts: { maxItems?: number; timeoutMs?: number; memoryMbytes?: number } = {}
): Promise<RunActorResult<T>> {
  const token = apifyToken();
  if (!token) return { ok: false, error: "APIFY_TOKEN is not set" };

  const actorId = actor.replace("/", "~");
  const timeoutMs = opts.timeoutMs ?? 240_000;

  const params = new URLSearchParams({ token });
  if (opts.maxItems) params.set("maxItems", String(opts.maxItems));
  if (opts.memoryMbytes) params.set("memory", String(opts.memoryMbytes));
  // give the actor run a generous server-side timeout (seconds)
  params.set("timeout", String(Math.ceil(timeoutMs / 1000)));

  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?${params.toString()}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: `Apify ${res.status}: ${body.slice(0, 300)}` };
    }
    const items = (await res.json()) as T[];
    return { ok: true, items: Array.isArray(items) ? items : [] };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: aborted ? "Apify run timed out" : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
