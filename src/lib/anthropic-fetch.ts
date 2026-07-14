/**
 * AI SDK v4 hardcodes a default `temperature: 0` and ALWAYS sends it (see the `// TODO v5 remove
 * default 0 for temperature` in the `ai` package). Opus 4.7/4.8 REMOVED the sampling params
 * (`temperature`, `top_p`, `top_k`) and the Anthropic API now 400s when any is present. They also
 * removed `budget_tokens` thinking — `thinking: {type: "enabled", budget_tokens}` 400s; callers must
 * use adaptive thinking or omit it (we do not mutate thinking here; that is the caller's choice).
 *
 * This shim strips the removed SAMPLING params from the outgoing request body so nothing 400s,
 * whatever default the SDK injects. Pass it as the `fetch` option to
 * `createAnthropic({ apiKey, fetch: anthropicFetch })`. Harmless on any Claude model — they use
 * their own default sampling.
 */
const STRIP_KEYS = ["temperature", "top_p", "top_k"];

export const anthropicFetch: typeof fetch = async (input, init) => {
  if (init && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (body && typeof body === "object") {
        let changed = false;
        for (const key of STRIP_KEYS) {
          if (key in body) {
            delete body[key];
            changed = true;
          }
        }
        if (changed) init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      /* body isn't JSON — forward untouched */
    }
  }
  return fetch(input, init);
};
