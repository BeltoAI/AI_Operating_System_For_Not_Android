import {
  createBrainSyncClient,
  createBrowserMemoryStore,
  planPrompt,
  type AgentAction,
  type AgentPlan,
  type BrainSyncClient,
  type MemoryItem
} from "@badscientist/agent-core";
import "./styles.css";

type ShellScreen =
  | "boot"
  | "lock"
  | "home"
  | "now"
  | "people"
  | "memory"
  | "research"
  | "apps"
  | "manual"
  | "setup"
  | "expenses"
  | "look";

interface WaitingThread {
  contact: string;
  app: string;
  why: string;
  last: string;
  draft: string;
}

interface Shortcut {
  label: string;
  kind: ShellScreen;
  glyph: string;
}

const memoryStore = createBrowserMemoryStore(window.localStorage, "slyos");
const queriedRoot = document.querySelector<HTMLDivElement>("#app");
if (!queriedRoot) throw new Error("Missing #app root.");
const appRoot: HTMLDivElement = queriedRoot;

let screen: ShellScreen = "boot";
let promptText = "";
let memoryQuery = "";
let memoryAnswer = "";
let lastPlan: AgentPlan | null = null;
let syncClient: BrainSyncClient | null = null;
let syncStatus = "not connected";
let agentPaused = false;

const waitingThreads: WaitingThread[] = [
  {
    contact: "Dana",
    app: "Messages",
    why: "needs the contract before 2pm",
    last: "Can you send the latest version before the call?",
    draft: "Yes, sending the latest version now. I’ll flag the two clauses we changed."
  },
  {
    contact: "Mom",
    app: "Phone",
    why: "missed call last night",
    last: "Call me when you can.",
    draft: "Sorry I missed you last night. I can call in a little bit."
  },
  {
    contact: "Sam",
    app: "WhatsApp",
    why: "asked about Friday",
    last: "Still good for Friday?",
    draft: "Yes, Friday still works. I’ll send the exact time once I’m out of this meeting."
  }
];

const shortcuts: Shortcut[] = [
  { label: "Look", kind: "look", glyph: "◉" },
  { label: "Docs", kind: "research", glyph: "✎" },
  { label: "Expenses", kind: "expenses", glyph: "$" },
  { label: "Setup", kind: "setup", glyph: "⚙" }
];

setTimeout(() => {
  if (screen === "boot") {
    screen = "lock";
    render();
  }
}, 1600);

render();

function render(): void {
  appRoot.innerHTML = `
    <main class="os-stage">
      <section class="device-shell ${screen === "boot" ? "booting" : ""}" aria-label="SlyOS shell">
        <div class="screen-body">
          ${renderScreen()}
        </div>
        ${shouldShowNav(screen) ? renderBottomNav() : ""}
        <div class="busy-dog" aria-hidden="true"><span></span><span></span><span></span></div>
      </section>
    </main>
  `;
  wireEvents();
}

function renderScreen(): string {
  switch (screen) {
    case "boot":
      return renderBoot();
    case "lock":
      return renderLock();
    case "home":
      return renderHome();
    case "now":
      return renderNow();
    case "people":
      return renderPeople();
    case "memory":
      return renderMemory();
    case "research":
      return renderResearch();
    case "apps":
      return renderApps();
    case "manual":
      return renderManual();
    case "setup":
      return renderSetup();
    case "expenses":
      return renderExpenses();
    case "look":
      return renderLook();
  }
}

function renderBoot(): string {
  return `
    <div class="boot-screen tap-screen" data-screen="lock">
      <div class="wordmark big">SlyOS</div>
      <div class="subtle wake">waking up…</div>
    </div>
  `;
}

function renderLock(): string {
  const priorities = [
    `Reply to Dana before the 2pm call`,
    `Flight check-in opens in 40 min`,
    lastPlan ? `${lastPlan.actions.length} brain step${lastPlan.actions.length === 1 ? "" : "s"} held from last prompt` : `Rent draft is ready to send`
  ];
  return `
    <div class="lock-screen tap-screen" data-screen="home">
      <div class="lock-top">
        <div class="time">9:41</div>
        <div class="battery">82%</div>
      </div>
      <div class="matter">You have ${priorities.length} things that matter.</div>
      <div class="priority-list">
        ${priorities.map((item) => `<div class="priority"><span class="dot"></span><span>${escapeHtml(item)}</span></div>`).join("")}
      </div>
      <div class="talk-target">
        <div class="ring">●</div>
        <div>hold to speak</div>
      </div>
    </div>
  `;
}

function renderHome(): string {
  const memories = memoryStore.list().slice(0, 2);
  return `
    <div class="home-screen">
      <div class="top-row">
        <button class="wordmark navless" data-screen="lock">SlyOS</button>
        <button class="pause" data-screen="manual">${agentPaused ? "paused" : "pause"}</button>
      </div>
      <div class="shortcut-row">
        ${shortcuts.map((shortcut) => renderShortcut(shortcut)).join("")}
      </div>
      <div class="home-spacer"></div>
      <div class="prompt-title">what should happen?</div>
      <form id="prompt-form" class="ask-row">
        <input id="prompt-input" value="${escapeAttr(promptText)}" autocomplete="off" placeholder="ask me anything…" />
        <button class="camera-button" type="button" data-screen="look" aria-label="Look">◉</button>
        <button class="send-button" type="submit">Send</button>
      </form>
      <div class="talk-target home-talk">
        <div class="ring">●</div>
        <div>hold to talk</div>
      </div>
      ${lastPlan ? renderBrainCard(lastPlan) : ""}
      <div class="today-line">Today · 2 meetings · ${waitingThreads.length} drafts waiting · calm afternoon</div>
      ${memories.length ? `<div class="remember-strip">${memories.map((m) => `<span>${escapeHtml(m.title)}</span>`).join("")}</div>` : ""}
    </div>
  `;
}

function renderShortcut(shortcut: Shortcut): string {
  return `
    <button class="shortcut" data-screen="${shortcut.kind}">
      <span>${shortcut.glyph}</span>
      <small>${escapeHtml(shortcut.label)}</small>
    </button>
  `;
}

function renderBrainCard(plan: AgentPlan): string {
  const visibleActions = [...plan.actions].sort((a, b) => Number(b.requiresConfirmation) - Number(a.requiresConfirmation));
  const actionRows = visibleActions.map((action) => renderAction(action)).join("");
  return `
    <section class="brain-card">
      <div class="brain-head">
        <span>Brain</span>
        <small>${escapeHtml(plan.summary)}</small>
      </div>
      <div class="brain-flow">
        ${actionRows}
      </div>
      <div class="brain-note">${escapeHtml(plan.platformNotes[0] ?? "Everything routes through the brain.")}</div>
    </section>
  `;
}

function renderAction(action: AgentAction): string {
  return `
    <article class="action-row ${action.requiresConfirmation ? "held" : ""}">
      <div>
        <strong>${escapeHtml(action.title)}</strong>
        <span>${escapeHtml(action.type)} · ${escapeHtml(action.risk)}</span>
      </div>
      <b>${action.requiresConfirmation ? "Confirm" : "Auto"}</b>
    </article>
  `;
}

function renderNow(): string {
  return `
    <div class="panel-screen">
      ${screenHeader("Now")}
      <div class="mini-row">
        <span>${new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
        <button>Sent for you</button>
        <button>Reconnect</button>
      </div>
      <section class="suggestion-card">
        <div class="eyebrow">Suggested for you</div>
        <strong>Add Dana's 2pm contract call to calendar</strong>
        <span>Calendar · Messages · brain context</span>
        <div class="button-pair">
          <button>Confirm ✓</button>
          <button class="quiet-button">Dismiss</button>
        </div>
      </section>
      <section class="brief-card">
        <div class="brief-head">
          <span>✦ What you missed</span>
          <button>⟳</button>
        </div>
        <p>Dana needs the contract, Mom called, and Sam is waiting on Friday. Text back Dana first; the rest can wait.</p>
      </section>
      <div class="section-label">Waiting on you · ${waitingThreads.length}</div>
      <div class="thread-list">
        ${waitingThreads.map(renderThread).join("")}
      </div>
    </div>
  `;
}

function renderPeople(): string {
  return `
    <div class="panel-screen">
      ${screenHeader("People")}
      <div class="thread-list people-list">
        ${waitingThreads.map(renderThread).join("")}
      </div>
    </div>
  `;
}

function renderThread(thread: WaitingThread): string {
  return `
    <article class="thread-card">
      <div class="avatar-wrap">
        <div class="avatar">${escapeHtml(thread.contact[0] ?? "•")}</div>
        <div class="app-badge">${escapeHtml(thread.app[0] ?? "A")}</div>
      </div>
      <div class="thread-body">
        <div class="thread-top">
          <strong>${escapeHtml(thread.contact)}</strong>
          <span>${escapeHtml(thread.app)}</span>
        </div>
        <p>${escapeHtml(thread.why)}</p>
        <blockquote>${escapeHtml(thread.last)}</blockquote>
        <div class="draft">
          <span>✦ reply in your voice</span>
          <p>${escapeHtml(thread.draft)}</p>
        </div>
      </div>
    </article>
  `;
}

function renderMemory(): string {
  const memories = memoryStore.list();
  const shown = memoryQuery ? memoryStore.search(memoryQuery) : memories;
  return `
    <div class="panel-screen memory-screen">
      ${screenHeader("Memory")}
      <div class="caption-line">${memories.length} memories mapped · drag to rotate, pinch to zoom</div>
      <form id="memory-search-form" class="memory-search">
        <input id="memory-query" value="${escapeAttr(memoryQuery)}" placeholder="Ask your memory…" />
        <button type="submit">Ask</button>
        <button class="text-button" type="button" data-screen="setup">⚙ Settings</button>
      </form>
      ${memoryAnswer ? `<section class="memory-answer"><span>✦</span><p>${escapeHtml(memoryAnswer)}</p></section>` : ""}
      <div class="memory-legend">
        ${["Person", "Fact", "Task", "Paper", "Recall", "Network", "Note"].map((label) => `<span><i></i>${label}</span>`).join("")}
      </div>
      <div class="memory-map" aria-label="Memory graph preview">
        ${renderMemoryGraph(shown)}
      </div>
      <form id="remember-form" class="remember-form">
        <input id="remember-title" placeholder="Title" />
        <input id="remember-body" placeholder="Remember this…" />
        <button type="submit">Remember</button>
      </form>
    </div>
  `;
}

function renderMemoryGraph(items: MemoryItem[]): string {
  const graphItems = items.slice(0, 8);
  if (!graphItems.length) {
    return `<p>Your brain is still filling in — as you chat and import, memories appear here.</p>`;
  }
  return graphItems
    .map((item, index) => {
      const x = 18 + ((index * 29) % 64);
      const y = 18 + ((index * 41) % 58);
      return `<button class="memory-node" style="left:${x}%;top:${y}%">${escapeHtml(item.title.slice(0, 18))}</button>`;
    })
    .join("");
}

function renderResearch(): string {
  return `
    <div class="panel-screen">
      ${screenHeader("Research")}
      <section class="brief-card">
        <div class="eyebrow">Paper workspace</div>
        <p>Ask the brain to research, cite, draft, revise, and hand off to Cowork. External publishing still waits for confirmation.</p>
      </section>
      <div class="tool-list">
        ${["Write paper", "Read PDF", "Create slides", "Open Cowork", "Publish to Zenodo"].map((tool) => rowTool(tool)).join("")}
      </div>
    </div>
  `;
}

function renderApps(): string {
  const apps = ["Phone", "Messages", "Camera", "Browser", "Files", "Settings", "Calendar", "Mail", "Terminal", "Shortcuts"];
  return `
    <div class="panel-screen">
      ${screenHeader("Apps")}
      <button class="manual-link" data-screen="manual">⏸ Manual mode — pause the agent</button>
      <div class="tool-list">
        ${apps.map((app) => rowTool(app)).join("")}
      </div>
    </div>
  `;
}

function renderManual(): string {
  agentPaused = true;
  const tools = ["Phone", "Messages", "Camera", "Browser", "Files", "Settings", "Checklist", "Outreach emails"];
  return `
    <div class="panel-screen manual-screen">
      <h2>Manual Mode</h2>
      <div class="paused">Agent paused.</div>
      <div class="tool-list">
        ${tools.map((tool) => rowTool(tool)).join("")}
      </div>
      <button class="resume-button" data-resume="true">▸ Resume agent</button>
    </div>
  `;
}

function renderSetup(): string {
  return `
    <div class="panel-screen setup-screen">
      ${screenHeader("Setup")}
      <div class="caption-line">Step 1 of 5</div>
      <section class="setup-block">
        <h3>Pick your brain</h3>
        <p>SlyOS runs on your own model key. Gemini can start free; Claude/OpenAI can be added for stronger work.</p>
        <div class="chip-row"><button>Gemini · free</button><button>Claude</button><button>OpenAI</button></div>
      </section>
      <section class="setup-block">
        <h3>Sync account</h3>
        <p>Optional Supabase memory/settings sync. Use only a publishable client key.</p>
        <div class="sync-grid">
          <input id="supabase-url" placeholder="https://project-ref.supabase.co" />
          <input id="supabase-key" placeholder="publishable key" />
          <input id="supabase-email" placeholder="you@example.com" />
        </div>
        <div class="button-pair">
          <button id="sync-configure" type="button">Configure</button>
          <button id="sync-login" type="button">Magic link</button>
          <button id="sync-push" type="button">Push brain</button>
          <button id="sync-pull" type="button">Pull brain</button>
        </div>
        <div class="caption-line">${escapeHtml(syncStatus)}</div>
      </section>
      <section class="setup-block">
        <h3>Bring in your data</h3>
        <p>WhatsApp .txt · LinkedIn messages.csv · Instagram/Telegram .json · PDFs · receipts.</p>
      </section>
    </div>
  `;
}

function renderExpenses(): string {
  return `
    <div class="panel-screen">
      ${screenHeader("Expenses")}
      <section class="brief-card">
        <div class="eyebrow">Receipt brain</div>
        <p>Receipts, invoices, and Gmail/PDF imports become searchable spending memory.</p>
      </section>
      <div class="tool-list">
        ${["Snap receipt", "Import invoice", "Ask spending", "Monthly totals"].map((tool) => rowTool(tool)).join("")}
      </div>
    </div>
  `;
}

function renderLook(): string {
  return `
    <div class="panel-screen look-screen">
      ${screenHeader("Look")}
      <div class="camera-frame">
        <div class="focus-ring">◉</div>
        <p>Point the camera, screenshot, receipt, form, or person at the brain.</p>
      </div>
      <div class="tool-list">
        ${["Identify this", "Save as memory", "Log receipt", "File document"].map((tool) => rowTool(tool)).join("")}
      </div>
    </div>
  `;
}

function renderBottomNav(): string {
  const items: Array<{ id: ShellScreen; label: string; icon: string; badge?: number }> = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "now", label: "Now", icon: "ϟ", badge: waitingThreads.length },
    { id: "research", label: "Research", icon: "⌬" },
    { id: "apps", label: "Apps", icon: "▦" }
  ];
  return `
    <nav class="bottom-nav" aria-label="SlyOS bottom navigation">
      ${items.slice(0, 2).map(renderNavItem).join("")}
      <button class="brain-tab ${screen === "memory" ? "active" : ""}" data-screen="memory">
        <span>◌</span>
        <small>Brain</small>
      </button>
      ${items.slice(2).map(renderNavItem).join("")}
    </nav>
  `;
}

function renderNavItem(item: { id: ShellScreen; label: string; icon: string; badge?: number }): string {
  return `
    <button class="nav-tab ${screen === item.id ? "active" : ""}" data-screen="${item.id}">
      <span>${item.icon}${item.badge ? `<b>${item.badge}</b>` : ""}</span>
      <small>${item.label}</small>
    </button>
  `;
}

function screenHeader(title: string): string {
  return `
    <header class="screen-header">
      <button data-screen="home" aria-label="Back">‹</button>
      <h2>${escapeHtml(title)}</h2>
    </header>
  `;
}

function rowTool(label: string): string {
  return `<button class="tool-row" type="button"><span>${escapeHtml(label)}</span></button>`;
}

function shouldShowNav(current: ShellScreen): boolean {
  return ["home", "now", "memory", "research", "apps", "manual"].includes(current);
}

function wireEvents(): void {
  document.querySelectorAll<HTMLElement>("[data-screen]").forEach((element) => {
    element.addEventListener("click", () => {
      const next = element.dataset.screen as ShellScreen | undefined;
      if (!next) return;
      if (next !== "manual") agentPaused = false;
      screen = next;
      render();
    });
  });

  document.querySelector("[data-resume]")?.addEventListener("click", () => {
    agentPaused = false;
    screen = "home";
    render();
  });

  document.querySelector("#prompt-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>("#prompt-input");
    promptText = input?.value ?? "";
    lastPlan = planPrompt(promptText);
    if (promptText.trim()) {
      memoryStore.add({
        kind: "message",
        title: `Prompt: ${promptText.trim().slice(0, 34)}`,
        body: `Brain planned ${lastPlan.actions.length} steps for: ${promptText.trim()}`,
        tags: ["prompt", "brain"],
        source: "home"
      });
    }
    promptText = "";
    render();
  });

  document.querySelector("#memory-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>("#memory-query");
    memoryQuery = input?.value ?? "";
    const hits = memoryStore.search(memoryQuery).slice(0, 3);
    memoryAnswer = hits.length
      ? hits.map((item) => `${item.title}: ${item.body}`).join(" ")
      : "I don't have anything on that yet.";
    render();
  });

  document.querySelector("#remember-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = document.querySelector<HTMLInputElement>("#remember-title")?.value.trim() || "Remembered";
    const body = document.querySelector<HTMLInputElement>("#remember-body")?.value.trim();
    if (!body) return;
    memoryStore.add({ kind: "fact", title, body, tags: ["manual"], source: "memory" });
    render();
  });

  document.querySelector("#sync-configure")?.addEventListener("click", () => {
    const url = document.querySelector<HTMLInputElement>("#supabase-url")?.value.trim();
    const publishableKey = document.querySelector<HTMLInputElement>("#supabase-key")?.value.trim();
    if (!url || !publishableKey) {
      syncStatus = "Missing URL or key.";
    } else {
      syncClient = createBrainSyncClient({ url, publishableKey });
      syncStatus = "Configured. Send a magic link next.";
    }
    render();
  });

  document.querySelector("#sync-login")?.addEventListener("click", () => {
    void syncAction(async () => {
      const email = document.querySelector<HTMLInputElement>("#supabase-email")?.value.trim();
      if (!syncClient || !email) throw new Error("Configure sync and enter email first.");
      await syncClient.signInWithOtp(email);
      syncStatus = "Magic link sent.";
    });
  });

  document.querySelector("#sync-push")?.addEventListener("click", () => {
    void syncAction(async () => {
      if (!syncClient) throw new Error("Configure sync first.");
      await syncClient.pushMemory(memoryStore.list());
      await syncClient.pushSettings(memoryStore.listSettings());
      syncStatus = "Pushed local brain.";
    });
  });

  document.querySelector("#sync-pull")?.addEventListener("click", () => {
    void syncAction(async () => {
      if (!syncClient) throw new Error("Configure sync first.");
      const remote = await syncClient.pullMemory();
      for (const item of remote) {
        memoryStore.add({
          kind: item.kind,
          title: item.title,
          body: item.body,
          tags: item.tags,
          source: item.source
        });
      }
      syncStatus = `Pulled ${remote.length} memories.`;
    });
  });
}

async function syncAction(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    syncStatus = error instanceof Error ? error.message : String(error);
  }
  render();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
