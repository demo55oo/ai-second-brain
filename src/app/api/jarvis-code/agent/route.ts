import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getIdentityContext, buildIdentityPreamble } from "@/lib/vault";
import { buildOperatorSystemPrompt } from "@/lib/jarvis-code/system-prompt";
import { spawnClaude } from "@/lib/jarvis-code/spawn";
import { enabledConnectors, writeMcpConfig } from "@/lib/jarvis-code/connectors";
import { advertisedConnectors, dedupeConnectors } from "@/lib/jarvis-code/mcp-cli";
import { stripEmDashes } from "@/lib/sanitize";
import { encodeAgentEvent, type AgentChatEvent, type ActionProposal } from "@/lib/jarvis-code/agent-events";

export const runtime = "nodejs";
export const maxDuration = 300;

const PROPOSAL = /<<JARVIS_PROPOSAL\s+file=(\S+)\s*>>/g;

function chatTool(name: string, input: Record<string, unknown>): { tool: string; detail: string } {
  if (name === "Skill") return { tool: String(input.command ?? input.name ?? "skill"), detail: "" };
  if (name === "Bash") {
    const cmd = String(input.command ?? "");
    const m = cmd.match(/\.claude\/skills\/([a-z0-9-]+)\//);
    if (m) return { tool: m[1], detail: "" };
    return { tool: "Bash", detail: String(input.description ?? cmd.split("\n")[0]).slice(0, 80) };
  }
  if (name.startsWith("mcp__")) {
    const [, server = "mcp", ...rest] = name.split("__");
    return { tool: server, detail: rest.join(" ").replace(/-/g, " ") };
  }
  const detail = String(input.query ?? input.pattern ?? input.url ?? input.file_path ?? input.description ?? "");
  return { tool: name, detail: detail.split("/").pop()?.slice(0, 80) ?? "" };
}

export async function POST(req: Request) {
  let message = "";
  let sessionId: string | undefined;
  try {
    const body = (await req.json()) as { message?: string; sessionId?: string };
    message = String(body.message ?? "").trim();
    sessionId = body.sessionId || undefined;
  } catch {
    /* ignore */
  }
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  const projectRoot = process.cwd();
  const runDir = path.join(projectRoot, ".jarvis-code", "agent", `t_${Date.now().toString(36)}`);
  try {
    fs.mkdirSync(path.join(runDir, "artifacts"), { recursive: true });
  } catch {
    /* non-fatal */
  }

  const reqUrl = new URL(req.url);
  const baseUrl = process.env.JARVIS_CODE_BASE_URL || process.env.APP_URL || `${reqUrl.protocol}//${reqUrl.host}`;

  let preamble = "";
  let founderName: string | undefined;
  try {
    const identity = await getIdentityContext();
    preamble = buildIdentityPreamble(identity);
    founderName = (identity as { displayName?: string })?.displayName;
  } catch {
    /* best-effort */
  }

  const connectors = enabledConnectors();
  const mcpConfigPath = writeMcpConfig(connectors, runDir);
  const promptConnectors = dedupeConnectors([
    ...connectors.map((c) => ({ id: c.id, name: c.name, toolsHint: c.toolsHint })),
    ...advertisedConnectors(),
  ]);
  const systemPrompt = buildOperatorSystemPrompt({ preamble, founderName, connectors: promptConnectors });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit = (e: AgentChatEvent) => {
        if (!closed) controller.enqueue(encoder.encode(encodeAgentEvent(e)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      let child: ReturnType<typeof spawnClaude>;
      try {
        child = spawnClaude({
          instruction: message,
          systemPrompt,
          cwd: projectRoot,
          model: process.env.JARVIS_CODE_MODEL || undefined,
          maxTurns: Number(process.env.JARVIS_CODE_AGENT_MAX_TURNS) || 30,
          mcpConfigPath: mcpConfigPath || undefined,
          resumeSessionId: sessionId,
          baseUrl,
          runDir,
        });
      } catch (err) {
        emit({ type: "error", message: `Could not start Claude Code: ${(err as Error)?.message ?? err}` });
        close();
        return;
      }

      let buffer = "";
      let sawResult = false;
      let stderr = "";

      const handle = (obj: Record<string, unknown>) => {
        if (obj.type === "system" && obj.subtype === "init") {
          emit({ type: "session", sessionId: String(obj.session_id ?? ""), model: String(obj.model ?? "") });
        } else if (obj.type === "assistant") {
          const content = (obj.message as { content?: unknown[] })?.content ?? [];
          for (const raw of content) {
            const b = raw as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
              emit({ type: "text", text: stripEmDashes(b.text) });
            } else if (b.type === "tool_use") {
              const { tool, detail } = chatTool(String(b.name ?? ""), (b.input as Record<string, unknown>) ?? {});
              emit({ type: "tool", tool, detail });
            }
          }
        } else if (obj.type === "user") {
          const content = (obj.message as { content?: unknown[] })?.content ?? [];
          const stdout = (obj.tool_use_result as { stdout?: string })?.stdout ?? "";
          for (const raw of content) {
            const b = raw as Record<string, unknown>;
            if (b.type !== "tool_result") continue;
            const text = `${typeof b.content === "string" ? b.content : JSON.stringify(b.content)}\n${stdout}`;
            PROPOSAL.lastIndex = 0;
            const seen = new Set<string>();
            let m: RegExpExecArray | null;
            while ((m = PROPOSAL.exec(text))) {
              if (seen.has(m[1])) continue;
              seen.add(m[1]);
              try {
                const proposal = JSON.parse(fs.readFileSync(m[1], "utf8")) as ActionProposal;
                emit({ type: "proposal", proposal });
              } catch {
                /* ignore unreadable proposal */
              }
            }
          }
        } else if (obj.type === "result") {
          sawResult = true;
          emit({
            type: "done",
            costUsd: typeof obj.total_cost_usd === "number" ? obj.total_cost_usd : undefined,
            numTurns: typeof obj.num_turns === "number" ? obj.num_turns : undefined,
          });
        }
      };

      const onLine = (line: string) => {
        const t = line.trim();
        if (!t) return;
        try {
          handle(JSON.parse(t));
        } catch {
          /* ignore non-JSON */
        }
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          onLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      });
      child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
      child.on("error", (err) => {
        emit({ type: "error", message: `Claude Code failed to launch: ${err.message}` });
        close();
      });
      child.on("close", (code) => {
        if (buffer.trim()) onLine(buffer);
        if (!sawResult) emit({ type: "error", message: stderr.trim().split("\n").slice(-2).join(" ") || `ended (code ${code})` });
        close();
      });

      req.signal.addEventListener("abort", () => {
        try {
          child.kill("SIGTERM");
        } catch {
          /* gone */
        }
        close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
