/**
 * The operator-chat wire protocol (NDJSON) for /jarvis-code/dashboard. Distinct
 * from the org-viz protocol: this is a conversational stream (assistant text +
 * tool chips + a human-in-the-loop approval card + a session id for the next
 * turn), parsed from the same `claude -p --output-format stream-json`.
 */

export type ActionProposal = {
  app?: string;
  action?: string;
  title: string;
  summary: string;
  details?: { label: string; value: string }[];
  risk?: "low" | "medium" | "high";
};

export type AgentChatEvent =
  | { type: "session"; sessionId: string; model?: string }
  | { type: "text"; text: string }
  | { type: "tool"; tool: string; detail?: string }
  | { type: "proposal"; proposal: ActionProposal }
  | { type: "done"; costUsd?: number; numTurns?: number }
  | { type: "error"; message: string };

export function encodeAgentEvent(e: AgentChatEvent): string {
  return JSON.stringify(e) + "\n";
}

export function drainAgentEvents(buffer: string): { events: AgentChatEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: AgentChatEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as AgentChatEvent);
    } catch {
      /* ignore partial/garbage */
    }
  }
  return { events, rest };
}
