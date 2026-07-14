import { spawn, execFile, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveClaudeBin } from "./spawn";
import { CONNECTOR_CATALOG } from "./catalog";

/**
 * Thin wrappers around the `claude mcp` CLI. This is how /jarvis-code's one-click
 * connectors actually connect: `claude mcp add -s user` registers a server in
 * ~/.claude.json (user scope → auto-loads into every `claude -p` run), and
 * `claude mcp login` runs the OAuth loopback flow, opening the user's browser.
 * We never touch the OAuth tokens ourselves — the CLI owns them (keychain /
 * its own store), exactly as it does for an interactive Claude Code session.
 */

const CLAUDE_JSON = path.join(os.homedir(), ".claude.json");
const ANSI = /\[[0-9;]*m/g;

/** Claude Code env — strip API keys so the CLI acts as the logged-in subscription. */
function claudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

export type RegisteredServer = { type?: string; url?: string; command?: string };

/** User-scope MCP servers registered in ~/.claude.json (fast, no health check). */
export function readRegisteredServers(): Record<string, RegisteredServer> {
  try {
    const j = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf8")) as { mcpServers?: Record<string, RegisteredServer> };
    return j.mcpServers && typeof j.mcpServers === "object" ? j.mcpServers : {};
  } catch {
    return {};
  }
}

export function isRegistered(id: string): boolean {
  return id in readRegisteredServers();
}

type RunResult = { code: number; stdout: string; stderr: string };

function runClaude(args: string[], timeoutMs = 20000): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      resolveClaudeBin(),
      args,
      { env: claudeEnv(), timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: number }).code === "number" ? (err as { code?: number }).code! : err ? 1 : 0;
        resolve({ code, stdout: stdout || "", stderr: stderr || "" });
      },
    );
  });
}

export type McpStatus = "connected" | "needs-auth" | "failed";
export type McpListEntry = { id: string; target: string; status: McpStatus };

/** Health-checked status of every registered server, via `claude mcp list`. */
export async function mcpList(timeoutMs = 25000): Promise<McpListEntry[]> {
  const { stdout } = await runClaude(["mcp", "list"], timeoutMs);
  const out: McpListEntry[] = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.replace(ANSI, "").trim();
    // "name: <url-or-command> [(TRANSPORT)] - <status text>"
    const m = line.match(/^([A-Za-z0-9_.-]+):\s+(.+?)\s+-\s+(.+)$/);
    if (!m) continue;
    const [, id, target, statusText] = m;
    let status: McpStatus = "failed";
    if (/connected|✔|✓/i.test(statusText)) status = "connected";
    else if (/auth/i.test(statusText)) status = "needs-auth";
    out.push({ id, target: target.trim(), status });
  }
  return out;
}

/** Register a server at user scope (idempotent — no-op if already present). */
export async function mcpAddUser(id: string, url: string, transport: "http" | "sse"): Promise<RunResult | null> {
  if (isRegistered(id)) return null;
  return runClaude(["mcp", "add", "-s", "user", "-t", transport, id, url]);
}

export async function mcpRemove(id: string): Promise<RunResult> {
  return runClaude(["mcp", "remove", "-s", "user", id]);
}

export async function mcpLogout(id: string): Promise<RunResult> {
  return runClaude(["mcp", "logout", id]);
}

/**
 * Spawn `claude mcp login <id>` — this OPENS THE USER'S BROWSER and runs the
 * OAuth loopback, self-completing when they finish signing in. Returns the child
 * so the connect route can stream its progress.
 *
 * The catch: `claude mcp login` puts the terminal in raw mode (for its "^C to
 * cancel" spinner) and REFUSES to run if stdin isn't a TTY ("stdin isn't a
 * terminal"). A server-spawned child has piped stdio, so we allocate a real
 * pseudo-terminal with the OS-native `script` utility (zero deps, unlike
 * node-pty). We never write to stdin — the browser loopback completes the auth;
 * the PTY is only there to satisfy the raw-mode check.
 */
export function spawnMcpLogin(id: string): ChildProcess {
  const bin = resolveClaudeBin();
  const env = claudeEnv();
  const stdio: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];

  if (process.platform === "darwin") {
    // BSD script: `script -q /dev/null <command> [args...]`
    return spawn("script", ["-q", "/dev/null", bin, "mcp", "login", id], { env, stdio, shell: false });
  }
  if (process.platform === "linux") {
    // util-linux script: `script -qec "<command>" /dev/null`
    const cmd = `${JSON.stringify(bin)} mcp login ${JSON.stringify(id)}`;
    return spawn("script", ["-qec", cmd, "/dev/null"], { env, stdio, shell: false });
  }
  // Windows / other: no `script`. Direct spawn works only if a PTY is present;
  // otherwise the route surfaces guidance to run `claude mcp login <id>` once.
  return spawn(bin, ["mcp", "login", id], { env, stdio, shell: false });
}

/** Authoritative post-login check: is this one server connected / needs-auth / gone? */
export async function mcpStatusOf(id: string): Promise<McpStatus | "missing"> {
  const list = await mcpList(15000);
  const e = list.find((x) => x.id === id);
  return e ? e.status : "missing";
}

export type AdvertisedConnector = { id: string; name: string; toolsHint?: string };

/**
 * Every user-scope MCP server registered with the CLI, described for KRONOS's
 * system prompt. These auto-load into `claude -p`, so advertising them tells the
 * model what it can actually reach (Notion, GitHub, Supabase, ...). Catalog
 * connectors get their friendly name + tools hint; anything else is passed
 * through by id.
 */
export function advertisedConnectors(): AdvertisedConnector[] {
  const registered = readRegisteredServers();
  return Object.keys(registered).map((id) => {
    const cat = CONNECTOR_CATALOG.find((c) => c.id === id);
    return { id, name: cat?.name ?? id, toolsHint: cat?.toolsHint };
  });
}

/** Dedupe an advertised-connector list by id, keeping the first (token) entry. */
export function dedupeConnectors(list: AdvertisedConnector[]): AdvertisedConnector[] {
  const seen = new Set<string>();
  const out: AdvertisedConnector[] = [];
  for (const c of list) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}
