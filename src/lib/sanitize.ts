/**
 * Em-dash eradication — the founder hates the AI em-dash tell. Two layers:
 *   1. NO_EMDASH_RULE — a hard prompt instruction injected into every writer.
 *   2. stripEmDashes / deDash / emDashTransform — a deterministic safety net that
 *      scrubs any dash the model slips through, on EVERY output (text, structured
 *      objects, and live streams).
 */

/** The hard rule. Inject into every system prompt that produces prose. */
export const NO_EMDASH_RULE =
  "ABSOLUTE WRITING RULE, NO EM DASHES OR EN DASHES: never output an em dash (the long — character), an en dash (–), or a horizontal bar (―) anywhere, under any circumstance. Not as a pause, an aside, a parenthetical, a range, or for emphasis. Use a comma, a period, a colon, parentheses, or the word 'to' for ranges instead. This is non-negotiable, overrides any stylistic habit or source formatting, and applies to every sentence, title, headline, label, list item, caption, and block, INCLUDING any text rendered inside generated images.";

/**
 * Replace em / en / figure / horizontal-bar dashes with human punctuation.
 * Leaves the plain hyphen-minus (-) and tight numeric ranges (5–10) intact.
 */
export function stripEmDashes(input: string): string {
  if (!input || typeof input !== "string") return input;
  let out = input;
  // em dash + horizontal bar (the classic AI tell) → comma, the usual pause/aside
  out = out.replace(/\s*[—―]\s*/g, ", ");
  // a SPACED en/figure dash is a pause too (but keep "5–10" ranges untouched)
  out = out.replace(/(\S)\s+[‒–]\s+(\S)/g, "$1, $2");
  // unicode minus sign → plain hyphen
  out = out.replace(/−/g, "-");
  // tidy the substitutions
  out = out
    .replace(/ +,/g, ",") // no space before a comma
    .replace(/,(?:\s*,)+/g, ",") // collapse doubled commas
    .replace(/,\s*([.!?;:])/g, "$1") // drop a comma that landed before terminal punctuation
    .replace(/(^|\n)[ \t]*,[ \t]*/g, "$1"); // drop a comma left at the start of a line
  return out;
}

/** Recursively scrub every string in an object / array (for structured outputs). */
export function deDash<T>(value: T): T {
  if (typeof value === "string") return stripEmDashes(value) as T;
  if (Array.isArray(value)) return value.map((v) => deDash(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deDash(v);
    return out as T;
  }
  return value;
}

/**
 * A streamText `experimental_transform` that scrubs em-dashes from live text
 * deltas as they stream to the client. Em-dashes are a single codepoint per
 * token so they never split across deltas. Tool calls + all other stream parts
 * pass through untouched.
 */
export function emDashTransform() {
  return () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new TransformStream<any, any>({
      transform(part, controller) {
        if (part?.type === "text-delta" && typeof part.textDelta === "string") {
          controller.enqueue({ ...part, textDelta: stripEmDashes(part.textDelta) });
        } else {
          controller.enqueue(part);
        }
      },
    });
}
