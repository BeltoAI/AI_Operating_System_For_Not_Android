export type ActionRisk =
  | "read_only"
  | "local_write"
  | "external_open"
  | "external_send"
  | "destructive"
  | "financial"
  | "security_sensitive";

export type ActionType =
  | "open_app"
  | "open_url"
  | "web_search"
  | "memory_search"
  | "read_url"
  | "find_contact"
  | "calendar_lookup"
  | "add_event"
  | "send_sms"
  | "send_email"
  | "message"
  | "remind"
  | "create_doc"
  | "create_sheet"
  | "create_pdf"
  | "expense_lookup"
  | "expense_record"
  | "camera_look"
  | "screen_read"
  | "screen_operate"
  | "run_command"
  | "create_mini_app"
  | "revise_mini_app";

export interface AgentAction {
  id: string;
  type: ActionType;
  title: string;
  args: Record<string, unknown>;
  requiresConfirmation: boolean;
  risk: ActionRisk;
  source: "agent" | "user" | "system";
  taintedByUntrustedContext: boolean;
  createdAt: string;
}

export interface AgentPlan {
  id: string;
  prompt: string;
  summary: string;
  actions: AgentAction[];
  createdAt: string;
  platformNotes: string[];
}

const confirmRisks = new Set<ActionRisk>([
  "external_send",
  "destructive",
  "financial",
  "security_sensitive"
]);

export function requiresConfirmation(risk: ActionRisk): boolean {
  return confirmRisks.has(risk);
}

export function makeAction(
  type: ActionType,
  title: string,
  risk: ActionRisk,
  args: Record<string, unknown> = {}
): AgentAction {
  return {
    id: cryptoId("action"),
    type,
    title,
    args,
    requiresConfirmation: requiresConfirmation(risk),
    risk,
    source: "agent",
    taintedByUntrustedContext: false,
    createdAt: new Date().toISOString()
  };
}

export function planPrompt(prompt: string): AgentPlan {
  const text = prompt.trim();
  const lower = text.toLowerCase();
  const actions: AgentAction[] = [];
  const notes: string[] = [];

  if (!text) {
    return {
      id: cryptoId("plan"),
      prompt,
      summary: "Waiting for a command.",
      actions: [],
      createdAt: new Date().toISOString(),
      platformNotes: ["Type a goal or command to generate an Android-style action plan."]
    };
  }

  if (/\b(send|text|dm|message|email|reply)\b/.test(lower)) {
    actions.push(
      makeAction("find_contact", "Find the right contact", "read_only", { prompt: text }),
      makeAction("message", "Draft the outbound message", "external_send", { prompt: text })
    );
    notes.push("Outbound messages must stay draft/confirm-first on every platform.");
  }

  if (/\b(receipt|expense|invoice|spend|spent|purchase)\b/.test(lower)) {
    actions.push(
      makeAction("expense_record", "Extract and save expense details", "local_write", {
        prompt: text
      })
    );
  }

  if (/\b(calendar|meeting|schedule|remind|reminder)\b/.test(lower)) {
    actions.push(
      makeAction("calendar_lookup", "Check calendar context", "read_only", { prompt: text }),
      makeAction("add_event", "Prepare calendar/reminder change", "external_send", { prompt: text })
    );
  }

  if (/\b(screen|app|click|tap|operate|open|control)\b/.test(lower)) {
    actions.push(
      makeAction("screen_read", "Read current screen context", "read_only", { prompt: text }),
      makeAction("screen_operate", "Plan safe screen operation", "external_open", { prompt: text })
    );
    notes.push("Desktop can use accessibility automation; iOS must use Shortcuts/App Intents or handoff.");
  }

  if (/\b(search|web|who won|weather|research|find)\b/.test(lower)) {
    actions.unshift(makeAction("web_search", "Search live web/context", "read_only", { prompt: text }));
  }

  if (/\b(remember|memory|brain|recall|know about me)\b/.test(lower)) {
    actions.push(makeAction("memory_search", "Search the memory brain", "read_only", { prompt: text }));
  }

  if (actions.length === 0) {
    actions.push(
      makeAction("memory_search", "Gather personal context", "read_only", { prompt: text }),
      makeAction("web_search", "Gather live context if needed", "read_only", { prompt: text })
    );
  }

  return {
    id: cryptoId("plan"),
    prompt: text,
    summary: summarizePlan(actions),
    actions,
    createdAt: new Date().toISOString(),
    platformNotes: notes.length ? notes : ["This plan is portable; platform adapters decide exact execution."]
  };
}

function summarizePlan(actions: AgentAction[]): string {
  const risky = actions.filter((action) => action.requiresConfirmation).length;
  const reads = actions.filter((action) => action.risk === "read_only").length;
  return `${actions.length} step plan: ${reads} read/context step(s), ${risky} confirmation-gated step(s).`;
}

export function cryptoId(prefix: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

