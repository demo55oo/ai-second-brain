import { NextResponse } from "next/server";
import { shouldUseApiBrain, runApiBrainStream, apiBrainConfigured } from "@/lib/api-brain";
import fs from "node:fs";
import path from "node:path";
import { getIdentityContext, buildIdentityPreamble } from "@/lib/vault";
import { buildCodeSystemPrompt } from "@/lib/jarvis-code/system-prompt";
import { spawnClaude } from "@/lib/jarvis-code/spawn";
import { enabledConnectors, writeMcpConfig } from "@/lib/jarvis-code/connectors";
import { advertisedConnectors, dedupeConnectors } from "@/lib/jarvis-code/mcp-cli";
import { StreamMapper } from "@/lib/jarvis-code/stream-map";
import { encodeCodeEvent, type JarvisCodeEvent } from "@/lib/jarvis-code/events";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * /api/jarvis-code/run
 *
 * Default on Vercel/Netlify (or BRAIN_ENGINE=api): API brain — search vault +
 * stream an answer via Anthropic / AI Gateway. No Claude CLI required.
 *
 * Local CLI mode (BRAIN_ENGINE=cli or Claude available): original Claude Code
 * spawn path for the full skill/org cockpit.
 */
export async function POST(req: Request) {
  let instruction = "What should I know about my ICP?";
  try {
    const body = (await req.json()) as { instruction?: string };
    if (body?.instruction && typeof body.instruction === "string") instruction = body.instruction.trim();
  } catch {
    /* keep default */
  }

  if (shouldUseApiBrain()) {
    if (!apiBrainConfigured()) {
      return NextResponse.json(
        {
          error:
            "API brain needs AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY. Add one in your host env vars.",
        },
        { status: 503 }
      );
    }
    const stream = runApiBrainStream(instruction, req.signal);
    return new NextResponse(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  return runClaudeCli(req, instruction);
}

async function runClaudeCli(req: Request, instruction: string) {
  const runId = `code_${Date.now().toString(36)}`;
  const projectRoot = process.cwd();
  const runDir = path.join(projectRoot, ".jarvis-code", "runs", runId);
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
    founderName =
      (identity as { displayName?: string; name?: string })?.displayName ||
      (identity as { name?: string })?.name;
  } catch {
    /* identity is best-effort */
  }

  const connectors = enabledConnectors();
  const mcpConfigPath = writeMcpConfig(connectors, runDir);
  const promptConnectors = dedupeConnectors([
    ...connectors.map((c) => ({ id: c.id, name: c.name, toolsHint: c.toolsHint })),
    ...advertisedConnectors(),
  ]);
  const systemPrompt = buildCodeSystemPrompt({ preamble, founderName, connectors: promptConnectors });

  const mapper = new StreamMapper();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit = (e: JarvisCodeEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeCodeEvent(e)));
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

      emit({ type: "run.start", runId, instruction, at: Date.now() });

      let child: ReturnType<typeof spawnClaude>;
      try {
        child = spawnClaude({
          instruction,
          systemPrompt,
          cwd: projectRoot,
          model: process.env.JARVIS_CODE_MODEL || undefined,
          maxTurns: Number(process.env.JARVIS_CODE_MAX_TURNS) || 50,
          mcpConfigPath: mcpConfigPath || undefined,
          baseUrl,
          runDir,
        });
      } catch (err) {
        emit({
          type: "run.error",
          message: `Could not start Claude Code: ${(err as Error)?.message ?? err}. Set BRAIN_ENGINE=api and an API key to use the deployable brain.`,
          at: Date.now(),
        });
        close();
        return;
      }

      let sawResult = false;
      let buffer = "";

      const onLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let obj: Record<string, unknown>;
        try {
          obj = JSON.parse(trimmed);
        } catch {
          return;
        }
        if (obj.type === "result") sawResult = true;
        for (const e of mapper.map(obj)) emit(e);
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          onLine(line);
        }
      });

      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (err) => {
        emit({
          type: "run.error",
          message: `Claude Code failed to launch: ${err.message}. Set BRAIN_ENGINE=api for the API brain.`,
          at: Date.now(),
        });
        close();
      });

      child.on("close", (code) => {
        if (buffer.trim()) onLine(buffer);
        if (!sawResult) {
          const detail = stderr.trim().split("\n").slice(-3).join(" ") || `exited with code ${code}`;
          for (const e of mapper.fail(`Claude Code ended early: ${detail}`)) emit(e);
        }
        close();
      });

      req.signal.addEventListener("abort", () => {
        try {
          child.kill("SIGTERM");
        } catch {
          /* already gone */
        }
        close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
