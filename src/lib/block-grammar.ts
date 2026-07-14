/**
 * The block grammar the GTM agents emit. The UI renders these via the shared
 * token-driven block library (src/components/blocks). Keep this in sync with
 * src/components/blocks/parse.ts — every token listed here must be parseable,
 * or it renders as literal text.
 *
 * v1 = the proven CORE blocks. Agent-specific ARTIFACT blocks (post, carousel,
 * trendcard, prospects, …) are appended per-agent once registered in parse.ts.
 */

export const CORE_BLOCK_GRAMMAR = `OUTPUT FORMAT — RICH BLOCKS, NOT A WALL OF PROSE.
Render every answer as the rich UI blocks below, with only thin connective prose between them. Lead a substantive answer with a \`# \` title and a 2-3 sentence framing summary, then the blocks. Pick each block by the SHAPE of the content. Always close every token you open ([[x]] … [[/x]]). For paramless blocks (keypoints, actions, stats) the content begins on the LINE AFTER the opening token.

PROSE / EMPHASIS
- [[callout:insight|win|risk|note]] one or two sentences [[/callout]] — a single spotlight takeaway.
- [[quote:Who]] the exact line [[/quote]] — a verbatim pull-quote.
- [[define:Term]] the meaning in 1-2 sentences [[/define]] — one canonical definition.

LISTS & SEQUENCES
- [[keypoints]] then a \`- \` bullet per line [[/keypoints]] — unordered takeaways, each a full specific sentence.
- [[actions]] then a \`- \` bullet per line [[/actions]] — concrete next steps.
- [[steps:Name]] then "Step title | what you do" per line [[/steps]] — an ordered, auto-numbered playbook.
- [[timeline:Title]] then "When | Title | detail" per line [[/timeline]] — a chronological arc; fill all three fields per event.

NUMBERS & DATA
- [[kpi:cyan|violet|emerald|amber|sky|rose]] then "Value | Label | delta | context" [[/kpi]] — one hero number.
- [[stats]] then "Label | Value | sub" per line [[/stats]] — a small grid of equal headline numbers.
- [[meter:Title]] then "Label | current | target | unit" per line [[/meter]] — progress toward a goal.
- [[bars:Title]] then "Label | value | unit" per line [[/bars]] — compare 2-7 like quantities.
- [[table:Title]] header row, then one row per line, cells split by | [[/table]] — relational rows-by-columns. Never hand-write a raw markdown table.

ENTITIES & RULES
- [[people:Title]] then "Name | Role @ Company | note" per line [[/people]] — a roster of humans.
- [[chips:Title]] item, item, item [[/chips]] — a flat pill row of tags/topics.
- [[decision:Rule]] **When:** condition **Then:** action **Because:** rationale [[/decision]] — one conditional rule.

DEPTH: substantive answers use MANY blocks (aim for 4-6+). Never return a sparse 3-line skeleton when the content supports more. One block per distinct idea; do not nest tokens; vary which blocks you use. Cite a source document inline as [[Doc Title]] when you used it.`;

/** Per-agent artifact-block grammar. Filled in as parse.ts gains the tokens. */
export const ARTIFACT_BLOCK_GRAMMAR: Partial<Record<string, string>> = {};

export function blockGrammarFor(agentKey: string): string {
  const extra = ARTIFACT_BLOCK_GRAMMAR[agentKey];
  return extra ? `${CORE_BLOCK_GRAMMAR}\n\n${extra}` : CORE_BLOCK_GRAMMAR;
}
