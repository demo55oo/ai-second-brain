import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Spawn the local `claude` CLI in headless stream-json mode. This is the engine
 * of /jarvis-code: the reasoning runs on the USER'S OWN Claude Code subscription
 * (we strip ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN so the CLI falls back to the
 * logged-in OAuth session — verified via `apiKeySource: "none"`), and it runs
 * fully autonomously (`--permission-mode bypassPermissions`) with no prompts.
 */

/** Resolve the `claude` binary — the Next server's PATH may be trimmed. */
export function resolveClaudeBin(): string {
  const candidates = [
    process.env.CLAUDE_BIN,
    path.join(os.homedir(), ".local/bin/claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "claude"; // last resort: rely on PATH
}

export type SpawnClaudeOpts = {
  /** the user's instruction, passed as the -p prompt */
  instruction: string;
  /** the appended system prompt (identity + skills + block grammar) */
  systemPrompt: string;
  /** working dir — the project root, so `.claude/skills/*` + the run dir resolve */
  cwd: string;
  /** model alias/id; defaults to the user's configured default when omitted */
  model?: string;
  /** path to an MCP config JSON built from the user's enabled connectors */
  mcpConfigPath?: string;
  /** cap on agentic turns (safety) */
  maxTurns?: number;
  /** resume a prior headless session (multi-turn operator chat) */
  resumeSessionId?: string;
  /** base URL the skills' helper scripts curl to reach the internal API */
  baseUrl?: string;
  /** run-scoped artifact dir the skills write into */
  runDir?: string;
};

export function spawnClaude(opts: SpawnClaudeOpts): ChildProcess {
  const bin = resolveClaudeBin();

  const args = [
    "-p",
    opts.instruction,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "bypassPermissions",
    "--append-system-prompt",
    opts.systemPrompt,
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.maxTurns) args.push("--max-turns", String(opts.maxTurns));
  if (opts.mcpConfigPath) args.push("--mcp-config", opts.mcpConfigPath);
  if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);

  // Force subscription auth: with these unset, the CLI uses the logged-in
  // Claude Code session instead of billing an API key.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;

  // Skills reach the internal API + write artifacts through these.
  env.JARVIS_CODE_BASE_URL = opts.baseUrl || env.JARVIS_CODE_BASE_URL || "http://localhost:3000";
  if (opts.runDir) env.JARVIS_CODE_RUN_DIR = opts.runDir;

  return spawn(bin, args, { cwd: opts.cwd, env, shell: false });
}
