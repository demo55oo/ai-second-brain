import type { JarvisEvent } from "@/lib/jarvis-events";

/**
 * The Claude-Code mission control (`/jarvis-code`) speaks the SAME live protocol
 * as `/jarvis` — so it reuses OrgPyramid / ResponsePanel / the artifact
 * components verbatim — plus ONE extra event: `meta`, which carries the live run
 * telemetry unique to running on the user's own Claude Code subscription
 * (session id, model, running cost in USD, turns taken). The mission-control
 * footer renders it.
 */
export type JarvisCodeMetaEvent = {
  type: "meta";
  at: number;
  sessionId?: string;
  model?: string;
  /** cumulative cost so far, from the final `result` line */
  costUsd?: number;
  numTurns?: number;
};

export type JarvisCodeEvent = JarvisEvent | JarvisCodeMetaEvent;

/** Encode one event as a single NDJSON line (shared server + client). */
export function encodeCodeEvent(e: JarvisCodeEvent): string {
  return JSON.stringify(e) + "\n";
}

/** Parse a buffered NDJSON chunk into events + the leftover partial line. */
export function drainCodeEvents(buffer: string): { events: JarvisCodeEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: JarvisCodeEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as JarvisCodeEvent);
    } catch {
      // ignore a malformed line rather than killing the stream
    }
  }
  return { events, rest };
}
