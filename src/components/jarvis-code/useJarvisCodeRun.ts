"use client";

import { useCallback, useRef, useState } from "react";
import { node } from "@/lib/org";
import { sounds } from "@/lib/sounds";
import { drainCodeEvents, type JarvisCodeEvent } from "@/lib/jarvis-code/events";
import type { JarvisNodeId } from "@/lib/jarvis-events";
import type { JarvisRunState, FeedEntry } from "@/components/jarvis/useJarvisRun";

/**
 * The /jarvis-code run hook. Same live protocol + reducer shape as
 * `useJarvisRun`, so it drives the SAME OrgPyramid / ResponsePanel verbatim —
 * but it POSTs to the Claude-Code engine and folds in the extra `meta` event
 * (live subscription cost / turns / model) that the footer renders.
 */

export type JarvisCodeRunState = JarvisRunState & {
  costUsd?: number;
  numTurns?: number;
  model?: string;
  sessionId?: string;
};

const TOOL_HUMAN: Record<string, string> = {
  "gpt-image": "Generating the visuals",
  "Second Brain": "Searching your second brain",
};
function humanizeTool(tool: string): string {
  if (TOOL_HUMAN[tool]) return TOOL_HUMAN[tool];
  const t = tool.toLowerCase();
  if (t.includes("image")) return "Generating the visuals";
  if (t.includes("web") || t.includes("search")) return "Searching the web";
  if (t.includes("apify") || t.includes("scrap") || t.includes("lead")) return "Finding the right people";
  if (t.includes("brain") || t.includes("vault") || t.includes("research")) return "Searching your second brain";
  if (t.includes("mcp")) return "Using a connector";
  return tool;
}

let lastTick = 0;
function playEventSound(e: JarvisCodeEvent) {
  const throttled = (fn: () => void) => {
    const now = Date.now();
    if (now - lastTick < 110) return;
    lastTick = now;
    fn();
  };
  switch (e.type) {
    case "agent.activate":
      throttled(sounds.switchAgent);
      break;
    case "agent.output":
    case "agent.report":
      throttled(sounds.message);
      break;
    case "artifact":
      sounds.reply();
      break;
    case "response":
      sounds.notify();
      break;
    case "run.complete":
      sounds.complete();
      break;
    case "run.error":
      sounds.error();
      break;
    default:
      break;
  }
}

const EMPTY: JarvisCodeRunState = {
  running: false,
  instruction: "",
  plan: [],
  phases: {},
  litPath: [],
  feed: [],
  pulse: 0,
  done: false,
};

function ancestors(id: JarvisNodeId): JarvisNodeId[] {
  const out: JarvisNodeId[] = [id];
  let cur = node(id).parent;
  while (cur) {
    out.push(cur);
    cur = node(cur).parent;
  }
  return out;
}

function reduce(s: JarvisCodeRunState, e: JarvisCodeEvent, nextId: () => number): JarvisCodeRunState {
  const bump = (extra: Partial<JarvisCodeRunState>, feed?: Omit<FeedEntry, "id">): JarvisCodeRunState => ({
    ...s,
    ...extra,
    pulse: s.pulse + 1,
    feed: feed ? [...s.feed, { id: nextId(), ...feed }].slice(-60) : s.feed,
  });

  switch (e.type) {
    case "run.start":
      return s;
    case "meta":
      return bump({
        model: e.model || s.model,
        sessionId: e.sessionId || s.sessionId,
        costUsd: e.costUsd ?? s.costUsd,
        numTurns: e.numTurns ?? s.numTurns,
      });
    case "route": {
      const departments = e.assignments.map((a) => a.department);
      const plan = [...e.shared, ...e.assignments.flatMap((a) => a.plan)];
      return bump(
        { departments, department: departments[0], plan, rationale: e.rationale, active: "kronos", litPath: ["kronos"] },
        { node: "kronos", kind: "route", text: e.rationale, at: e.at },
      );
    }
    case "agent.activate":
      return bump(
        { active: e.node, litPath: ancestors(e.node), phases: { ...s.phases, [e.node]: "working" } },
        { node: e.node, kind: "activate", text: e.label, at: e.at },
      );
    case "agent.status":
      return bump({ active: e.node }, { node: e.node, kind: "status", text: e.status, at: e.at });
    case "agent.tool":
      return bump({}, { node: e.node, kind: "tool", text: humanizeTool(e.tool) + (e.detail ? ` · ${e.detail}` : ""), at: e.at });
    case "agent.output":
      return bump({ phases: { ...s.phases, [e.node]: "done" } }, { node: e.node, kind: "output", text: e.summary, at: e.at });
    case "agent.report":
      return bump(
        { active: e.to, litPath: ancestors(e.from), phases: { ...s.phases, [e.from]: "done" } },
        { node: e.from, kind: "report", text: `${node(e.from).title} → ${node(e.to).title}: ${e.summary}`, at: e.at },
      );
    case "artifact":
      if (e.kind === "newsletter") return bump({ newsletter: e.data });
      if (e.kind === "carousel") return bump({ artifact: e.data });
      // leads / other kinds: marketing org has no leads panel — ignore visual
      return s;
    case "response":
      return bump({ response: e.markdown });
    case "run.complete":
      return bump({ running: false, done: true, active: "kronos", litPath: ["kronos"] });
    case "run.error":
      return bump({ running: false, error: e.message });
    default:
      return s;
  }
}

export function useJarvisCodeRun() {
  const [state, setState] = useState<JarvisCodeRunState>(EMPTY);
  const feedId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (instruction: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    feedId.current = 0;
    const nextId = () => feedId.current++;
    setState({ ...EMPTY, running: true, instruction });
    sounds.send();

    try {
      const res = await fetch("/api/jarvis-code/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction }),
        signal: ac.signal,
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = drainCodeEvents(buffer);
        buffer = rest;
        for (const e of events) {
          setState((s) => reduce(s, e, nextId));
          playEventSound(e);
        }
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        setState((s) => ({ ...s, running: false, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(EMPTY);
  }, []);

  return { state, run, reset };
}
