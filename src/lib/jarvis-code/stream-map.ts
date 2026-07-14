import fs from "node:fs";
import { node as orgNode } from "@/lib/org";
import type { JarvisNodeId } from "@/lib/jarvis-events";
import { stripEmDashes } from "@/lib/sanitize";
import type { JarvisCodeEvent } from "./events";

/**
 * Translate the `claude -p --output-format stream-json` line stream into the
 * live /jarvis org protocol. Claude Code IS "KRONOS"; its real skill/tool calls
 * light the org chart:
 *   - a skill (search-brain / scrape-leads / build-carousel / …) → its org node
 *   - Bash / Read / Grep / WebFetch / an MCP tool → a tool row on the active node
 *   - a skill writes an artifact file + prints a sentinel → an `artifact` event
 *   - the final `result` line → the rich block `response` + run.complete + cost
 */

/** which org node a skill lights up */
const SKILL_NODE: Record<string, JarvisNodeId> = {
  "search-brain": "research",
  "scrape-leads": "research",
  "build-carousel": "carousel",
  "write-newsletter": "newsletter",
  "write-post": "text",
};

/** which org node an artifact kind belongs to */
const ARTIFACT_NODE: Record<string, JarvisNodeId> = {
  leads: "research",
  carousel: "carousel",
  newsletter: "newsletter",
};

const SENTINEL = /<<JARVIS_ARTIFACT\s+kind=([a-z]+)\s+file=(\S+)\s*>>/g;

type ArtifactKind = "carousel" | "leads" | "newsletter";

function firstLine(text: string): string {
  const line = (text || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return "";
  // strip common markdown noise for a clean feed line
  return line.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").slice(0, 140);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === "string" ? b : typeof (b as { text?: string })?.text === "string" ? (b as { text: string }).text : ""))
      .join("\n");
  }
  return "";
}

function readArtifact(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function artifactSummary(kind: string, data: unknown): string {
  const d = (data || {}) as Record<string, unknown>;
  if (kind === "leads") return `${d.returned ?? d.requested ?? "0"} prospects scraped`;
  if (kind === "carousel") return `${Array.isArray(d.slides) ? d.slides.length : "?"} slides on "${d.topic ?? ""}"`;
  if (kind === "newsletter") return `"${d.subject ?? "Newsletter"}" ready`;
  return "Deliverable ready";
}

export class StreamMapper {
  private active: JarvisNodeId = "kronos";
  private kronosUp = false;
  private activated = new Set<JarvisNodeId>();
  /** tool_use id → the node + whether it was a skill invocation */
  private toolNode = new Map<string, { node: JarvisNodeId; skill: boolean }>();
  private lastText = "";
  private now = () => Date.now();

  /** Fold one raw claude stream-json object into zero or more protocol events. */
  map(ev: Record<string, unknown>): JarvisCodeEvent[] {
    const out: JarvisCodeEvent[] = [];
    switch (ev.type) {
      case "system":
        if (ev.subtype === "init") {
          out.push({ type: "meta", at: this.now(), sessionId: String(ev.session_id ?? ""), model: String(ev.model ?? "") });
          if (!this.kronosUp) {
            this.kronosUp = true;
            this.activated.add("kronos");
            out.push({ type: "agent.activate", node: "kronos", label: "Reading the intent", at: this.now() });
            out.push({ type: "agent.status", node: "kronos", status: "Planning the work", at: this.now() });
          }
        }
        break;

      case "assistant": {
        const content = (ev.message as { content?: unknown[] })?.content ?? [];
        for (const raw of content) {
          const b = raw as Record<string, unknown>;
          if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
            this.lastText = b.text;
            const line = firstLine(b.text);
            if (line) out.push({ type: "agent.status", node: this.active, status: line, at: this.now() });
          } else if (b.type === "tool_use") {
            this.onToolUse(b, out);
          }
        }
        break;
      }

      case "user": {
        const content = (ev.message as { content?: unknown[] })?.content ?? [];
        const stdout = (ev.tool_use_result as { stdout?: string })?.stdout ?? "";
        for (const raw of content) {
          const b = raw as Record<string, unknown>;
          if (b.type !== "tool_result") continue;
          this.onToolResult(b, stdout, out);
        }
        break;
      }

      case "result": {
        out.push({
          type: "meta",
          at: this.now(),
          sessionId: String(ev.session_id ?? ""),
          costUsd: typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : undefined,
          numTurns: typeof ev.num_turns === "number" ? ev.num_turns : undefined,
        });
        const md = stripEmDashes(String(ev.result ?? this.lastText ?? "")).trim();
        if (md) out.push({ type: "response", format: "blocks", markdown: md, at: this.now() });
        out.push({ type: "run.complete", at: this.now() });
        break;
      }
    }
    return out;
  }

  /** the run died / was aborted before a `result` line */
  fail(message: string): JarvisCodeEvent[] {
    return [{ type: "run.error", message, at: this.now() }];
  }

  private activate(node: JarvisNodeId, label: string, out: JarvisCodeEvent[]) {
    this.active = node;
    if (this.activated.has(node)) {
      out.push({ type: "agent.status", node, status: label, at: this.now() });
      return;
    }
    this.activated.add(node);
    out.push({ type: "agent.activate", node, label, at: this.now() });
  }

  private toolRow(tool: string, detail: string, out: JarvisCodeEvent[]) {
    out.push({ type: "agent.tool", node: this.active, tool, detail: detail.slice(0, 120), at: this.now() });
  }

  private onToolUse(b: Record<string, unknown>, out: JarvisCodeEvent[]) {
    const name = String(b.name ?? "");
    const id = String(b.id ?? "");
    const input = (b.input as Record<string, unknown>) ?? {};

    // 1) explicit Skill tool
    if (name === "Skill") {
      const skill = String(input.command ?? input.name ?? input.skill ?? input.skillName ?? "");
      const node = SKILL_NODE[skill];
      if (node) {
        this.toolNode.set(id, { node, skill: true });
        this.activate(node, `${orgNode(node).title} · ${orgNode(node).label}`, out);
        return;
      }
    }

    // 2) Bash running one of our skills' helper scripts → light that skill's node
    if (name === "Bash") {
      const cmd = String(input.command ?? "");
      const m = cmd.match(/\.claude\/skills\/([a-z0-9-]+)\//);
      const node = m ? SKILL_NODE[m[1]] : undefined;
      if (node) {
        this.toolNode.set(id, { node, skill: true });
        this.activate(node, `${orgNode(node).title} · ${orgNode(node).label}`, out);
        this.toolRow(orgNode(node).title, "running", out);
        return;
      }
      this.toolNode.set(id, { node: this.active, skill: false });
      this.toolRow("Bash", String(input.description ?? cmd.split("\n")[0]), out);
      return;
    }

    // 3) an MCP connector tool (Apify + anything the user connects)
    if (name.startsWith("mcp__")) {
      const [, server = "mcp", ...rest] = name.split("__");
      this.toolNode.set(id, { node: this.active, skill: false });
      this.toolRow(`${server} MCP`, rest.join(" ").replace(/-/g, " "), out);
      return;
    }

    // 4) built-in file / web tools
    this.toolNode.set(id, { node: this.active, skill: false });
    const label = FRIENDLY_TOOL[name] ?? name;
    this.toolRow(label, toolDetail(name, input), out);
  }

  private onToolResult(b: Record<string, unknown>, stdout: string, out: JarvisCodeEvent[]) {
    const toolId = String(b.tool_use_id ?? "");
    const mapped = this.toolNode.get(toolId);
    const text = `${extractText(b.content)}\n${stdout}`;
    let sawArtifact = false;

    SENTINEL.lastIndex = 0;
    let match: RegExpExecArray | null;
    const seenFiles = new Set<string>();
    while ((match = SENTINEL.exec(text))) {
      const kind = match[1] as ArtifactKind;
      const file = match[2];
      // the sentinel shows up in BOTH tool_result.content and stdout — dedupe.
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      const data = readArtifact(file);
      if (!data || !ARTIFACT_NODE[kind]) continue;
      sawArtifact = true;
      const node = ARTIFACT_NODE[kind];
      out.push({ type: "artifact", kind, data, at: this.now() } as unknown as JarvisCodeEvent);
      out.push({ type: "agent.output", node, summary: artifactSummary(kind, data), at: this.now() });
      out.push({ type: "agent.report", from: node, to: orgNode(node).parent ?? "kronos", summary: artifactSummary(kind, data), at: this.now() });
    }

    if (b.is_error) {
      out.push({ type: "agent.status", node: mapped?.node ?? this.active, status: "Hit a snag, adjusting", at: this.now() });
      return;
    }

    if (!sawArtifact && mapped?.skill) {
      out.push({ type: "agent.output", node: mapped.node, summary: "Done", at: this.now() });
      out.push({ type: "agent.report", from: mapped.node, to: orgNode(mapped.node).parent ?? "kronos", summary: "Delivered", at: this.now() });
    }
  }
}

const FRIENDLY_TOOL: Record<string, string> = {
  Read: "Read",
  Grep: "Search",
  Glob: "Search",
  Write: "Write",
  Edit: "Edit",
  WebFetch: "Web search",
  WebSearch: "Web search",
  Task: "Delegate",
};

function toolDetail(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Read":
    case "Write":
    case "Edit": {
      const p = String(input.file_path ?? input.path ?? "");
      return p.split("/").pop() ?? p;
    }
    case "Grep":
    case "Glob":
      return String(input.pattern ?? input.query ?? "");
    case "WebFetch":
      return String(input.url ?? "");
    case "WebSearch":
      return String(input.query ?? "");
    case "Task":
      return String(input.description ?? input.subagent_type ?? "");
    default:
      return String(input.description ?? "");
  }
}
