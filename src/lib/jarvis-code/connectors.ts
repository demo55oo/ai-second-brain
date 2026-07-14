import fs from "node:fs";
import path from "node:path";

/**
 * MCP connectors for /jarvis-code. This is the "connect any tool" layer: the
 * dashboard manages a set of MCP servers (token-config), and the run engine
 * writes an `--mcp-config` from the ENABLED ones so Claude Code gains their tools
 * (e.g. Apify → scrape ANY site/actor, not just LinkedIn). Secrets live in a
 * local file on the runner (like .env), never in a shared DB — which also keeps
 * the whole thing portable to a persistent, subscription-authed container.
 */

export type McpTransport = "http" | "sse" | "stdio";

export type Connector = {
  id: string; // slug
  name: string; // display name
  transport: McpTransport;
  url?: string; // http / sse
  headers?: Record<string, string>; // http / sse auth
  command?: string; // stdio
  args?: string[]; // stdio
  env?: Record<string, string>; // stdio
  enabled: boolean;
  source: "builtin" | "custom";
  description?: string;
  /** what tools this unlocks, for the dashboard card */
  toolsHint?: string;
};

type StoreFile = {
  /** enabled overrides for builtins, keyed by id */
  overrides: Record<string, { enabled: boolean }>;
  custom: Connector[];
};

const DIR = path.join(process.cwd(), ".jarvis-code");
const FILE = path.join(DIR, "connectors.json");

function readStore(): StoreFile {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return {
      overrides: raw.overrides && typeof raw.overrides === "object" ? raw.overrides : {},
      custom: Array.isArray(raw.custom) ? raw.custom : [],
    };
  } catch {
    return { overrides: {}, custom: [] };
  }
}

function writeStore(s: StoreFile) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
}

/** Builtin connectors auto-detected from existing env (the ones they already have). */
function detectBuiltins(): Connector[] {
  const out: Connector[] = [];

  if (process.env.APIFY_TOKEN) {
    out.push({
      id: "apify",
      name: "Apify",
      transport: "http",
      url: process.env.APIFY_MCP_URL || "https://mcp.apify.com",
      headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}` },
      enabled: true,
      source: "builtin",
      description: "Web scraping + automation. Search and run any Apify Actor.",
      toolsHint: "Scrape any site, run any Apify Actor, fetch datasets",
    });
  }

  if (process.env.ZAPIER_MCP_URL) {
    out.push({
      id: "zapier",
      name: "Zapier",
      transport: "http",
      url: process.env.ZAPIER_MCP_URL,
      headers: process.env.ZAPIER_MCP_TOKEN ? { Authorization: `Bearer ${process.env.ZAPIER_MCP_TOKEN}` } : undefined,
      enabled: true,
      source: "builtin",
      description: "Your connected apps via Zapier (Gmail, Slack, Notion, Calendar, ...).",
      toolsHint: "Read/act across your connected Zapier apps",
    });
  }

  return out;
}

/** The full connector list (builtins + custom), with enabled overrides applied. */
export function listConnectors(): Connector[] {
  const store = readStore();
  const builtins = detectBuiltins().map((b) => {
    const ov = store.overrides[b.id];
    return ov ? { ...b, enabled: ov.enabled } : b;
  });
  return [...builtins, ...store.custom];
}

export function enabledConnectors(): Connector[] {
  return listConnectors().filter((c) => c.enabled);
}

const mask = (v: string): string => (v.length <= 8 ? "••••" : `${"•".repeat(6)}${v.slice(-4)}`);

/** Same list but with secret header/env values masked — safe for the client. */
export function listConnectorsMasked(): Connector[] {
  return listConnectors().map((c) => ({
    ...c,
    headers: c.headers ? Object.fromEntries(Object.entries(c.headers).map(([k, v]) => [k, mask(v)])) : undefined,
    env: c.env ? Object.fromEntries(Object.entries(c.env).map(([k, v]) => [k, mask(v)])) : undefined,
  }));
}

export function setEnabled(id: string, enabled: boolean) {
  const store = readStore();
  const custom = store.custom.find((c) => c.id === id);
  if (custom) {
    custom.enabled = enabled;
  } else {
    store.overrides[id] = { enabled };
  }
  writeStore(store);
}

export function upsertCustom(input: Partial<Connector> & { id: string }) {
  const store = readStore();
  const id = input.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const connector: Connector = {
    id,
    name: input.name || id,
    transport: (input.transport as McpTransport) || "http",
    url: input.url,
    headers: input.headers,
    command: input.command,
    args: input.args,
    env: input.env,
    enabled: input.enabled ?? true,
    source: "custom",
    description: input.description,
    toolsHint: input.toolsHint,
  };
  const idx = store.custom.findIndex((c) => c.id === id);
  if (idx >= 0) store.custom[idx] = { ...store.custom[idx], ...connector };
  else store.custom.push(connector);
  writeStore(store);
}

export function removeCustom(id: string) {
  const store = readStore();
  store.custom = store.custom.filter((c) => c.id !== id);
  delete store.overrides[id];
  writeStore(store);
}

type McpServerEntry =
  | { type: "http" | "sse"; url: string; headers?: Record<string, string> }
  | { command: string; args?: string[]; env?: Record<string, string> };

/** Build a Claude Code `--mcp-config` object from a set of connectors. */
export function buildMcpConfig(connectors: Connector[]): { mcpServers: Record<string, McpServerEntry> } {
  const mcpServers: Record<string, McpServerEntry> = {};
  for (const c of connectors) {
    if (c.transport === "stdio") {
      if (!c.command) continue;
      mcpServers[c.id] = { command: c.command, args: c.args, env: c.env };
    } else {
      if (!c.url) continue;
      mcpServers[c.id] = { type: c.transport, url: c.url, headers: c.headers };
    }
  }
  return { mcpServers };
}

/** Write the mcp-config for the enabled connectors into `dir`; returns its path (or null if none). */
export function writeMcpConfig(connectors: Connector[], dir: string): string | null {
  const config = buildMcpConfig(connectors);
  if (Object.keys(config.mcpServers).length === 0) return null;
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "mcp-config.json");
  fs.writeFileSync(p, JSON.stringify(config));
  return p;
}
