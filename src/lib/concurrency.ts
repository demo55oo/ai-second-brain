/**
 * Bounded-concurrency map: run an async fn over items with at most `limit`
 * in flight at once. Preserves input order in the result. Used to fan out work
 * (image generation, Apify enrichment) concurrently while staying under provider
 * rate / concurrent-request limits.
 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Math.max(1, Math.min(limit, items.length));
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  return out;
}
