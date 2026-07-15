/**
 * Client knowledge — the student's ingested business-doc set.
 *
 * Notes live at content/knowledge/<client>/knowledge/<doc_type>.md (bundled demo)
 * and can be overridden on Vercel Blob at knowledge/<client>/<doc_type>.md.
 */
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  type AgentKey,
  type DocType,
  AGENT_KNOWLEDGE_SCOPE,
  KNOWLEDGE_MAP,
  isDocType,
} from "./knowledge-map";
import { APP_CLIENT } from "./client";
import { blobConfigured, blobGetText, blobList, blobPutText } from "./blob-store";

export type BusinessDoc = {
  docType: DocType;
  title: string;
  client: string;
  authority: number;
  servesAgents: string[];
  answers: string[];
  provides: string[];
  pillars: string[];
  summary: string;
  sourceFile: string;
  body: string;
  storagePath: string;
};

const KNOWLEDGE_ROOT = path.join(process.cwd(), "content", "knowledge");
const TTL_MS = 60_000;

type Cache = { docs: BusinessDoc[]; loadedAt: number };
const cacheByClient = new Map<string, Cache>();

export async function defaultClient(): Promise<string> {
  return APP_CLIENT;
}

function parseDocRaw(client: string, file: string, raw: string, storagePath: string): BusinessDoc | null {
  try {
    const { data, content } = matter(raw);
    const dt = String(data.doc_type || file.replace(/\.md$/i, ""));
    if (!isDocType(dt)) return null;
    return {
      docType: dt,
      title: String(data.title || KNOWLEDGE_MAP[dt].label),
      client,
      authority: Number(data.authority ?? KNOWLEDGE_MAP[dt].authority),
      servesAgents: Array.isArray(data.serves_agents)
        ? data.serves_agents.map(String)
        : KNOWLEDGE_MAP[dt].servesAgents,
      answers: Array.isArray(data.answers) ? data.answers.map(String) : KNOWLEDGE_MAP[dt].answers,
      provides: Array.isArray(data.provides) ? data.provides.map(String) : [],
      pillars: Array.isArray(data.pillars) ? data.pillars.map(String) : [],
      summary: String(data.summary || KNOWLEDGE_MAP[dt].summary),
      sourceFile: String(data.source_file || file),
      body: content.trim(),
      storagePath,
    };
  } catch {
    return null;
  }
}

async function loadDocsFromDisk(client: string): Promise<BusinessDoc[]> {
  const dir = path.join(KNOWLEDGE_ROOT, client, "knowledge");
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }
  const docs: BusinessDoc[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const doc = parseDocRaw(client, file, raw, `content/knowledge/${client}/knowledge/${file}`);
      if (doc) docs.push(doc);
    } catch {
      /* skip */
    }
  }
  return docs;
}

async function loadDocsFromBlob(client: string): Promise<BusinessDoc[]> {
  if (!blobConfigured()) return [];
  const prefix = `knowledge/${client}/`;
  const paths = (await blobList(prefix)).filter((p) => p.endsWith(".md"));
  const docs: BusinessDoc[] = [];
  for (const p of paths) {
    const raw = await blobGetText(p);
    if (!raw) continue;
    const file = path.basename(p);
    const doc = parseDocRaw(client, file, raw, p);
    if (doc) docs.push(doc);
  }
  return docs;
}

async function loadDocs(client: string): Promise<BusinessDoc[]> {
  const cached = cacheByClient.get(client);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached.docs;

  const byType = new Map<DocType, BusinessDoc>();
  for (const d of await loadDocsFromDisk(client)) byType.set(d.docType, d);
  for (const d of await loadDocsFromBlob(client)) byType.set(d.docType, d);

  const docs = Array.from(byType.values()).sort((a, b) => b.authority - a.authority);
  cacheByClient.set(client, { docs, loadedAt: Date.now() });
  return docs;
}

function resolveScope(opts: { agent?: AgentKey; docTypes?: DocType[] }): DocType[] | null {
  if (opts.docTypes && opts.docTypes.length) return opts.docTypes;
  if (opts.agent) return AGENT_KNOWLEDGE_SCOPE[opts.agent] ?? null;
  return null;
}

export async function listBusinessDocs(opts: { agent?: AgentKey; client?: string } = {}) {
  const client = opts.client || (await defaultClient());
  const docs = await loadDocs(client);
  const have = new Map(docs.map((d) => [d.docType, d]));
  const scope = resolveScope(opts);
  const types = scope ?? (Object.keys(KNOWLEDGE_MAP) as DocType[]);
  return {
    client,
    documents: types.map((dt) => {
      const meta = KNOWLEDGE_MAP[dt];
      const doc = have.get(dt);
      return {
        docType: dt,
        label: meta.label,
        authority: meta.authority,
        summary: doc?.summary || meta.summary,
        answers: doc?.answers?.length ? doc.answers : meta.answers,
        available: !!doc,
      };
    }),
  };
}

export async function loadClientDocsForBrain(
  client?: string
): Promise<{ client: string; docs: BusinessDoc[] }> {
  const c = client || (await defaultClient());
  const docs = await loadDocs(c);
  return { client: c, docs };
}

export async function readBusinessDoc(opts: { docType: DocType; client?: string }) {
  const client = opts.client || (await defaultClient());
  const docs = await loadDocs(client);
  const doc = docs.find((d) => d.docType === opts.docType);
  if (!doc) {
    return { found: false as const, docType: opts.docType, client };
  }
  return {
    found: true as const,
    docType: doc.docType,
    title: doc.title,
    summary: doc.summary,
    authority: doc.authority,
    pillars: doc.pillars,
    body: doc.body,
  };
}

/**
 * Overwrite a doc body. Prefers Blob when configured (deploy-safe);
 * otherwise writes disk when writable.
 */
export async function writeBusinessDoc(opts: {
  docType: DocType;
  body: string;
  client?: string;
}): Promise<{ ok: boolean; client: string; title?: string; summary?: string; backend?: string }> {
  const client = opts.client || (await defaultClient());
  const docs = await loadDocs(client);
  let doc = docs.find((d) => d.docType === opts.docType);

  const meta = KNOWLEDGE_MAP[opts.docType];
  if (!doc && meta) {
    doc = {
      docType: opts.docType,
      title: meta.label,
      client,
      authority: meta.authority,
      servesAgents: meta.servesAgents,
      answers: meta.answers,
      provides: [],
      pillars: [],
      summary: meta.summary,
      sourceFile: `${opts.docType}.md`,
      body: "",
      storagePath: `knowledge/${client}/${opts.docType}.md`,
    };
  }
  if (!doc) return { ok: false, client };

  const frontmatter = {
    title: doc.title,
    doc_type: doc.docType,
    authority: doc.authority,
    serves_agents: doc.servesAgents,
    answers: doc.answers,
    provides: doc.provides,
    pillars: doc.pillars,
    summary: doc.summary,
    source_file: doc.sourceFile,
  };
  const next = matter.stringify(opts.body.trim() + "\n", frontmatter);

  if (blobConfigured()) {
    const blobPath = `knowledge/${client}/${opts.docType}.md`;
    await blobPutText(blobPath, next, "text/markdown; charset=utf-8");
    cacheByClient.delete(client);
    return { ok: true, client, title: doc.title, summary: doc.summary, backend: "blob" };
  }

  const file = `${opts.docType}.md`;
  const full = path.join(KNOWLEDGE_ROOT, client, "knowledge", file);
  try {
    await fs.mkdir(path.dirname(full), { recursive: true });
    let data = frontmatter;
    try {
      const raw = await fs.readFile(full, "utf8");
      data = { ...matter(raw).data, ...frontmatter } as typeof frontmatter;
    } catch {
      /* new file */
    }
    await fs.writeFile(full, matter.stringify(opts.body.trim() + "\n", data), "utf8");
    cacheByClient.delete(client);
    return { ok: true, client, title: doc.title, summary: doc.summary, backend: "disk" };
  } catch (err) {
    console.error("[client-knowledge] disk write failed:", err);
    return { ok: false, client };
  }
}

export type DocSearchHit = {
  docType: DocType;
  title: string;
  summary: string;
  authority: number;
  score: number;
  excerpt: string;
};

export async function searchBusinessDocs(opts: {
  query: string;
  agent?: AgentKey;
  docTypes?: DocType[];
  client?: string;
  limit?: number;
}): Promise<{ client: string; scope: DocType[] | "all"; count: number; results: DocSearchHit[] }> {
  const client = opts.client || (await defaultClient());
  const all = await loadDocs(client);
  const scope = resolveScope(opts);
  const pool = scope ? all.filter((d) => scope.includes(d.docType)) : all;

  const terms = opts.query
    .toLowerCase()
    .split(/[^\w]+/)
    .filter((t) => t.length > 2);
  const limit = opts.limit ?? 5;

  const scored = pool.map((d) => {
    const high = (
      d.title +
      "\n" +
      d.summary +
      "\n" +
      d.answers.join("\n") +
      "\n" +
      d.provides.join(" ")
    ).toLowerCase();
    const body = d.body.toLowerCase();
    let score = 0;
    for (const t of terms) {
      score += (high.match(new RegExp(t, "g")) || []).length * 6;
      score += (body.match(new RegExp(t, "g")) || []).length;
    }
    score += d.authority * 0.5;
    return { d, score };
  });

  const results = scored
    .filter((s) => s.score > 0 || !terms.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ d, score }) => ({
      docType: d.docType,
      title: d.title,
      summary: d.summary,
      authority: d.authority,
      score: Math.round(score * 100) / 100,
      excerpt: bestExcerpt(d.body, terms),
    }));

  return { client, scope: scope ?? "all", count: results.length, results };
}

function bestExcerpt(body: string, terms: string[], window = 480): string {
  if (!terms.length) return body.slice(0, window);
  const lower = body.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return body.slice(0, window);
  const start = Math.max(0, at - 120);
  return (start > 0 ? "…" : "") + body.slice(start, start + window).trim() + "…";
}
