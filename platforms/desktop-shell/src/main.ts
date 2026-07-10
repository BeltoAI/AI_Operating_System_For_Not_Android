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

const nativePlatform = new URLSearchParams(window.location.search).get("native");
if (nativePlatform) {
  document.documentElement.dataset.nativePlatform = nativePlatform;
  document.body.classList.add(`native-${nativePlatform}`);
}

type ShellScreen =
  | "boot"
  | "lock"
  | "home"
  | "now"
  | "outbox"
  | "reconnect"
  | "people"
  | "memory"
  | "memory-settings"
  | "mission"
  | "network"
  | "research"
  | "cowork"
  | "apps"
  | "manual"
  | "setup"
  | "expenses"
  | "look"
  | "voice";

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

interface SentItem {
  to: string;
  platform: string;
  time: string;
  body: string;
}

interface SettingsCard {
  title: string;
  subtitle?: string;
  glyph?: string;
  screen?: ShellScreen;
}

const memoryStore = createBrowserMemoryStore(window.localStorage, "slyos");
const queriedRoot = document.querySelector<HTMLDivElement>("#app");
if (!queriedRoot) throw new Error("Missing #app root.");
const appRoot: HTMLDivElement = queriedRoot;
const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const envSupabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

let screen: ShellScreen = "boot";
let promptText = "";
let memoryQuery = "";
let memoryAnswer = "";
let lastPlan: AgentPlan | null = null;
let syncClient: BrainSyncClient | null = null;
let syncStatus = "not connected";
let supabaseUrl = window.localStorage.getItem("slyos:supabaseUrl") ?? envSupabaseUrl;
let supabasePublishableKey =
  window.localStorage.getItem("slyos:supabasePublishableKey") ?? envSupabasePublishableKey;
let supabaseEmail = window.localStorage.getItem("slyos:supabaseEmail") ?? "";
let agentPaused = false;
let deviceBridgeUrl = window.localStorage.getItem("slyos:deviceBridgeUrl") ?? "http://127.0.0.1:4317";
let deviceBridgeToken = window.localStorage.getItem("slyos:deviceBridgeToken") ?? "";
let deviceBridgeStatus = "device bridge not checked";
let deviceBridgeObservation = "";

const routeScreens = new Set<ShellScreen>([
  "boot",
  "lock",
  "home",
  "now",
  "outbox",
  "reconnect",
  "memory",
  "memory-settings",
  "mission",
  "network",
  "research",
  "cowork",
  "apps",
  "manual",
  "setup",
  "expenses",
  "look",
  "voice"
]);

const initialScreen = new URLSearchParams(window.location.search).get("screen") as ShellScreen | null;
if (initialScreen && routeScreens.has(initialScreen)) {
  screen = initialScreen;
}

const waitingThreads: WaitingThread[] = [
  {
    contact: "Screenshot saved",
    app: "Samsung capture",
    why: "Tap here to see your screenshot.",
    last: "Screenshot saved from Samsung.",
    draft: "Open"
  }
];

const shortcuts: Shortcut[] = [
  { label: "Look", kind: "look", glyph: "◉" },
  { label: "Docs", kind: "research", glyph: "✎" },
  { label: "Expenses", kind: "expenses", glyph: "$" },
  { label: "Setup", kind: "setup", glyph: "⚙" }
];

const sentItems: SentItem[] = [
  {
    to: "Elon Musk",
    platform: "X",
    time: "1m ago",
    body: "the press release funnel adds three approval layers just to say less than one honest post from the CEO"
  },
  {
    to: "Elon Musk reposted",
    platform: "X",
    time: "6m ago",
    body: "19,600 hours and still got the seat five years ago instead of six decades ago. respect to anyone who just kept flying anyway"
  },
  {
    to: "Elon Musk",
    platform: "X",
    time: "6m ago",
    body: "symmetric 10Gbps anywhere basically kills the \"edge is too far from the datacenter\" excuse. latency's the only boss fight left"
  },
  {
    to: "Elon Musk reposted",
    platform: "X",
    time: "10m ago",
    body: "29% mean pass is the real story here, benchmarks are getting honest about how hard actual work is"
  }
];

const settingsCards: SettingsCard[] = [
  { title: "Character", subtitle: "How the agent should sound like you" },
  { title: "Your details", subtitle: "Address, contact & booking link" },
  { title: "API keys & model", subtitle: "Paste a key - SlyOS checks it's actually valid. Gemini is free.", screen: "setup" },
  { title: "Efficiency", subtitle: "How much time SlyOS is saving you" },
  { title: "On-device model", subtitle: "Free, private, offline - no key needed" },
  { title: "Appearance" },
  { title: "Investing" },
  { title: "Banking link" },
  { title: "Talk to your agent", screen: "voice" },
  { title: "Your writing voice" },
  { title: "Persona per platform" },
  { title: "Your uploads", subtitle: "See exactly what's in your brain" },
  { title: "Import & voice" },
  { title: "Models & spending" },
  { title: "Connections" },
  { title: "Per-app responses" },
  { title: "Document Q&A" },
  { title: "Lock screen" },
  { title: "Floating nav panel", subtitle: "A SlyOS bar over every app + read-this-screen" },
  { title: "Brain backup", subtitle: "Backed up 2 hours ago", glyph: "🛡" }
];

const missionChoices = [
  { title: "Find buyers for my product", subtitle: "Web-find companies that would buy it" },
  { title: "Find a job", subtitle: "Web-find companies hiring + people to reach" },
  { title: "Find people & opportunities", subtitle: "Web-find useful people/orgs to connect with" }
];

setTimeout(() => {
  if (screen === "boot") {
    screen = "lock";
    render();
  }
}, 1600);

render();
registerServiceWorker();

function render(): void {
  appRoot.innerHTML = `
    <main class="os-stage">
      <section class="device-shell ${screen === "boot" ? "booting" : ""}" aria-label="SlyOS shell">
        <div class="screen-body ${screen === "voice" ? "edge-to-edge" : ""}">
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
    case "outbox":
      return renderOutbox();
    case "reconnect":
      return renderReconnect();
    case "people":
      return renderPeople();
    case "memory":
      return renderMemory();
    case "memory-settings":
      return renderMemorySettings();
    case "mission":
      return renderMission();
    case "network":
      return renderNetwork();
    case "research":
      return renderResearch();
    case "cowork":
      return renderCowork();
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
    case "voice":
      return renderVoice();
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
  return `
    <div class="home-screen">
      <div class="home-status">
        <span>Thu&nbsp;&nbsp;7:19 PM</span>
        <span>100%</span>
      </div>
      <div class="home-spacer" aria-hidden="true"></div>
      <div class="prompt-title">what should happen?</div>
      <form id="prompt-form" class="ask-row">
        <input id="prompt-input" value="${escapeAttr(promptText)}" autocomplete="off" placeholder="ask me anything…" />
        <button class="camera-button" type="button" data-screen="look" aria-label="Look">◉</button>
        <button class="send-button" type="submit">Send</button>
      </form>
      <button class="talk-target home-talk" type="button" data-screen="voice">
        <div class="ring">●</div>
        <div>tap to talk</div>
      </button>
      ${lastPlan ? renderBrainCard(lastPlan) : ""}
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
  const hasDeviceLoop = visibleActions.some((action) => action.type === "screen_operate");
  return `
    <section class="brain-card">
      <div class="brain-head">
        <span>Brain</span>
        <small>${escapeHtml(plan.summary)}</small>
      </div>
      <div class="brain-flow">
        ${actionRows}
      </div>
      ${
        hasDeviceLoop
          ? `<button class="device-loop-button" type="button" data-device-loop="true">Run device loop</button>
             ${deviceBridgeObservation ? `<div class="bridge-observation">${escapeHtml(deviceBridgeObservation)}</div>` : ""}`
          : ""
      }
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
        <span>Thursday, Jul 9</span>
        <button data-screen="outbox">Sent for you</button>
        <button data-screen="reconnect">Reconnect</button>
      </div>
      <section class="brief-card">
        <div class="brief-head">
          <span>✨ What you missed</span>
          <button>⟳</button>
        </div>
        <p>Hey Emil. Nothing urgent in your queue right now-just a screenshot saved from Samsung. Everything's quiet on the reply front.</p>
        <strong>Text back: nobody right now.</strong>
      </section>
      <div class="section-label">Waiting on you · 1</div>
      <div class="thread-list">
        ${waitingThreads.map(renderThread).join("")}
      </div>
    </div>
  `;
}

function renderOutbox(): string {
  return `
    <div class="panel-screen outbox-screen">
      ${screenHeader("Sent for you", "now")}
      <p class="screen-subtitle">Everything the agent did on your behalf - what, to whom, and why. Recall copies a retraction you can paste.</p>
      <div class="sent-list">
        ${sentItems.map(renderSentItem).join("")}
      </div>
    </div>
  `;
}

function renderSentItem(item: SentItem): string {
  return `
    <article class="sent-card">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(item.to)}</h3>
          <span>${escapeHtml(item.platform)} · ${escapeHtml(item.time)}</span>
        </div>
        <b>sent</b>
      </div>
      <p>${escapeHtml(item.body)}</p>
      <small>↳ auto-replied on your behalf (full) - drafted in your voice from your brain + persona</small>
      <button type="button">Recall</button>
    </article>
  `;
}

function renderReconnect(): string {
  return `
    <div class="panel-screen reconnect-screen">
      ${screenHeader("Reconnect", "now")}
      <div class="segmented">
        <button class="active" type="button">Quiet contacts</button>
        <button type="button">My network</button>
      </div>
      <p class="screen-subtitle">People you haven't spoken with in over a week - message ready to send.</p>
      <p class="empty-state large">Nobody you've chatted with has gone quiet. ✨</p>
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
        <div class="app-badge">▣</div>
      </div>
      <div class="thread-body">
        <div class="thread-top">
          <strong>${escapeHtml(thread.contact)}</strong>
        </div>
        <p><span>via ${escapeHtml(thread.app)}</span></p>
        <blockquote>${escapeHtml(thread.why)}</blockquote>
        <div class="open-row">
          <button type="button">${escapeHtml(thread.draft)} ↗</button>
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
      <div class="caption-line">437 memories mapped · drag to rotate, pinch to zoom</div>
      <form id="memory-search-form" class="memory-search">
        <input id="memory-query" value="${escapeAttr(memoryQuery)}" placeholder="Ask your memory…" />
        <button type="submit">Ask</button>
        <button class="text-button" type="button" data-screen="memory-settings">⚙ Settings</button>
      </form>
      ${memoryAnswer ? `<section class="memory-answer"><span>✦</span><p>${escapeHtml(memoryAnswer)}</p></section>` : ""}
      <div class="recent-row">
        <span>Recent</span>
        <button type="button">Clear</button>
      </div>
      <div class="recent-list">
        <button type="button">↻ whats my name?</button>
        <button type="button">↻ who is daria</button>
      </div>
      <div class="memory-legend">
        ${["Person", "Fact", "Task", "Paper", "Recall", "Netw"].map((label, index) => `<span><i class="legend-${index}"></i>${label}</span>`).join("")}
      </div>
      <div class="memory-map" aria-label="Memory graph preview">
        ${renderMemoryGraph(shown, "SlyOS")}
      </div>
      <div class="divider"></div>
      <div class="settings-list compact">
        ${renderSettingsCard({ title: "Mission", subtitle: "Set a goal - SlyOS will plan and pursue it", screen: "mission" })}
        ${renderSettingsCard({ title: "My network", subtitle: "Find people you know & message them", screen: "network" })}
      </div>
    </div>
  `;
}

function renderMemoryGraph(items: MemoryItem[], centerLabel = ""): string {
  const count = Math.max(80, Math.min(140, 88 + items.length * 4));
  const nodes = Array.from({ length: count }, (_, index) => {
    const angle = index * 137.508;
    const ring = index % 17 === 0 ? 42 + ((index * 5) % 14) : 7 + ((index * 17) % 28);
    const x = 50 + Math.cos((angle * Math.PI) / 180) * ring;
    const y = 50 + Math.sin((angle * Math.PI) / 180) * ring * 0.86;
    const size = 2 + ((index * 11) % 6);
    const color = ["person", "fact", "task", "paper", "recall", "network"][index % 6];
    return `<span class="graph-node ${color}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;width:${size}px;height:${size}px"></span>`;
  }).join("");
  const spokes = Array.from({ length: 34 }, (_, index) => {
    const angle = (index * 23) % 360;
    const length = 32 + ((index * 19) % 46);
    const top = 48 + ((index * 7) % 10) - 5;
    return `<span class="graph-line" style="top:${top}%;left:50%;width:${length}%;transform:rotate(${angle}deg)"></span>`;
  }).join("");
  return `${spokes}${nodes}<span class="graph-core">${escapeHtml(centerLabel)}</span>`;
}

function renderMemorySettings(): string {
  return `
    <div class="panel-screen memory-settings-screen">
      ${screenHeader("Memory", "memory")}
      <div class="build-pill">✦ Settings build v21 · on-device test gate</div>
      <div class="settings-list">
        ${settingsCards.map(renderSettingsCard).join("")}
      </div>
      <p class="privacy-note">The agent reads this on every request. Nothing here leaves your phone except as part of a prompt you trigger.</p>
    </div>
  `;
}

function renderSettingsCard(card: SettingsCard): string {
  const screenAttr = card.screen ? `data-screen="${card.screen}"` : "";
  return `
    <button class="settings-card" type="button" ${screenAttr}>
      <span class="settings-copy">
        <strong>${card.glyph ? `<i>${card.glyph}</i>` : ""}${escapeHtml(card.title)}</strong>
        ${card.subtitle ? `<small>${escapeHtml(card.subtitle)}</small>` : ""}
      </span>
      <b>›</b>
    </button>
  `;
}

function renderMission(): string {
  return `
    <div class="panel-screen mission-screen">
      ${screenHeader("Mission", "memory")}
      <div class="section-label">Pick a mission</div>
      <div class="settings-list compact">
        ${missionChoices.map((choice) => renderSettingsCard(choice)).join("")}
      </div>
      <textarea class="mission-input" placeholder="Or type your own mission (include a location)..."></textarea>
      <button class="primary-wide" type="button">Run custom mission</button>
    </div>
  `;
}

function renderNetwork(): string {
  return `
    <div class="panel-screen network-screen">
      ${screenHeader("My network", "memory")}
      <textarea class="network-input" placeholder="Who are you looking for? e.g. CTOs, investors, people at Google"></textarea>
      <button class="primary-wide orange" type="button">Search my network</button>
    </div>
  `;
}

function renderResearch(): string {
  return `
    <div class="panel-screen">
      ${screenHeader("Research")}
      <p class="screen-subtitle">Opus · 6/6 left today (new paper + each suggestion)</p>
      <div class="research-actions">
        <button class="primary-pill" type="button">+ New paper</button>
        <button class="secondary-pill" type="button" data-screen="cowork">⌘ Cowork</button>
      </div>
      <div class="search-card">🔍 <span>Search papers...</span></div>
      <p class="empty-state">No papers yet. Tap New paper to write one.</p>
    </div>
  `;
}

function renderCowork(): string {
  return `
    <div class="panel-screen cowork-screen">
      ${screenHeader("Cowork", "research")}
      <p class="screen-subtitle">A local agent that builds real files - give it a task, it does it step by step.</p>
      <div class="cowork-actions">
        <button class="primary-pill" type="button">+ New chat</button>
        <button type="button">Files</button>
      </div>
      <div class="search-card">🔍 <span>Search chats...</span></div>
      <p class="empty-state">No chats yet. Tap New chat to start.</p>
    </div>
  `;
}

function renderApps(): string {
  const apps = ["Phone", "Messages", "Camera", "Browser", "Files", "Settings", "Calendar", "Mail", "Terminal", "Shortcuts", "Look", "Expenses"];
  return `
    <div class="panel-screen">
      ${screenHeader("Apps")}
      <button class="manual-link" data-screen="manual">⏸ Manual mode — pause the agent</button>
      <div class="shortcut-row app-shortcuts">
        ${shortcuts.map((shortcut) => renderShortcut(shortcut)).join("")}
      </div>
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
          <input id="supabase-url" value="${escapeAttr(supabaseUrl)}" placeholder="https://project-ref.supabase.co" />
          <input id="supabase-key" value="${escapeAttr(supabasePublishableKey)}" placeholder="publishable key" />
          <input id="supabase-email" value="${escapeAttr(supabaseEmail)}" placeholder="you@example.com" />
          <input id="supabase-password" type="password" placeholder="account password" />
        </div>
        <div class="button-pair">
          <button id="sync-configure" type="button">Configure</button>
          <button id="sync-signup" type="button">Sign up</button>
          <button id="sync-login" type="button">Sign in</button>
          <button id="sync-push" type="button">Push brain</button>
          <button id="sync-pull" type="button">Pull brain</button>
        </div>
        <div class="caption-line">${escapeHtml(syncStatus)}</div>
      </section>
      <section class="setup-block">
        <h3>Device control</h3>
        <p>Local bridge for observe, click, type, hotkeys, clipboard, and app control.</p>
        <div class="sync-grid">
          <input id="device-bridge-url" value="${escapeAttr(deviceBridgeUrl)}" placeholder="http://127.0.0.1:4317" />
          <input id="device-bridge-token" value="${escapeAttr(deviceBridgeToken)}" placeholder="agent token" />
        </div>
        <div class="button-pair">
          <button id="device-save" type="button">Save</button>
          <button id="device-check" type="button">Check bridge</button>
          <button id="device-observe" type="button">Observe</button>
        </div>
        <div class="caption-line">${escapeHtml(deviceBridgeStatus)}</div>
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

function renderVoice(): string {
  return `
    <div class="voice-screen">
      <button class="voice-end" type="button" data-screen="home"><span>●</span>End</button>
      <div class="voice-graph" aria-hidden="true">${renderMemoryGraph([], "")}</div>
      <div class="listening">listening...</div>
    </div>
  `;
}

function renderBottomNav(): string {
  const items: Array<{ id: ShellScreen; label: string; icon: string; badge?: number }> = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "now", label: "Now", icon: "⚡", badge: screen === "research" ? 2 : 1 },
    { id: "research", label: "Research", icon: "⚗" },
    { id: "apps", label: "Apps", icon: "▦" }
  ];
  return `
    <nav class="bottom-nav" aria-label="SlyOS bottom navigation">
      ${items.slice(0, 2).map(renderNavItem).join("")}
      <button class="brain-tab ${["memory", "memory-settings", "mission", "network"].includes(screen) ? "active" : ""}" data-screen="memory">
        <span>▣</span>
        <small>Brain</small>
      </button>
      ${items.slice(2).map(renderNavItem).join("")}
    </nav>
  `;
}

function renderNavItem(item: { id: ShellScreen; label: string; icon: string; badge?: number }): string {
  const active =
    screen === item.id ||
    (item.id === "now" && ["outbox", "reconnect"].includes(screen)) ||
    (item.id === "research" && screen === "cowork");
  return `
    <button class="nav-tab ${active ? "active" : ""}" data-screen="${item.id}">
      <span>${item.icon}${item.badge ? `<b>${item.badge}</b>` : ""}</span>
      <small>${item.label}</small>
    </button>
  `;
}

function screenHeader(title: string, back: ShellScreen = "home"): string {
  return `
    <header class="screen-header">
      <button data-screen="${back}" aria-label="Back">‹</button>
      <h2>${escapeHtml(title)}</h2>
    </header>
  `;
}

function rowTool(label: string): string {
  return `<button class="tool-row" type="button"><span>${escapeHtml(label)}</span></button>`;
}

function shouldShowNav(current: ShellScreen): boolean {
  return ["home", "now", "memory", "memory-settings", "research", "apps", "manual"].includes(current);
}

function wireEvents(): void {
  document.querySelectorAll<HTMLElement>("[data-screen]").forEach((element) => {
    element.addEventListener("click", () => {
      const next = element.dataset.screen as ShellScreen | undefined;
      if (!next) return;
      if (next !== "manual") agentPaused = false;
      screen = next;
      history.replaceState(null, "", `?screen=${screen}`);
      render();
    });
  });

  document.querySelector("[data-resume]")?.addEventListener("click", () => {
    agentPaused = false;
    screen = "home";
    history.replaceState(null, "", "?screen=home");
    render();
  });

  document.querySelector("[data-device-loop]")?.addEventListener("click", () => {
    void observeDeviceFromPrompt();
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
      supabaseUrl = url;
      supabasePublishableKey = publishableKey;
      window.localStorage.setItem("slyos:supabaseUrl", url);
      window.localStorage.setItem("slyos:supabasePublishableKey", publishableKey);
      syncClient = createBrainSyncClient({ url, publishableKey });
      syncStatus = "Configured. Sign up or sign in next.";
    }
    render();
  });

  document.querySelector("#sync-login")?.addEventListener("click", () => {
    void syncAction(async () => {
      const email = document.querySelector<HTMLInputElement>("#supabase-email")?.value.trim();
      const password = document.querySelector<HTMLInputElement>("#supabase-password")?.value;
      if (!syncClient || !email || !password) throw new Error("Configure sync, email, and password first.");
      supabaseEmail = email;
      window.localStorage.setItem("slyos:supabaseEmail", email);
      await syncClient.signInWithPassword(email, password);
      syncStatus = "Signed in.";
    });
  });

  document.querySelector("#sync-signup")?.addEventListener("click", () => {
    void syncAction(async () => {
      const email = document.querySelector<HTMLInputElement>("#supabase-email")?.value.trim();
      const password = document.querySelector<HTMLInputElement>("#supabase-password")?.value;
      if (!syncClient || !email || !password) throw new Error("Configure sync, email, and password first.");
      supabaseEmail = email;
      window.localStorage.setItem("slyos:supabaseEmail", email);
      await syncClient.signUpWithPassword(email, password);
      syncStatus = "Account created. Sign in if email confirmation is off, or confirm email first.";
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
        memoryStore.upsert(item);
      }
      const settings = await syncClient.pullSettings();
      for (const item of settings) memoryStore.setSetting(item.key, item.value);
      syncStatus = `Pulled ${remote.length} brain item(s) and ${settings.length} setting(s).`;
    });
  });

  document.querySelector("#device-save")?.addEventListener("click", () => {
    saveDeviceBridgeSettings();
    deviceBridgeStatus = "device bridge saved";
    render();
  });

  document.querySelector("#device-check")?.addEventListener("click", () => {
    void deviceAction(async () => {
      saveDeviceBridgeSettings();
      const payload = await deviceFetch("/capabilities");
      const enabled = Boolean(payload.capabilities?.deviceControl?.enabled);
      const click = Boolean(payload.capabilities?.deviceControl?.pointerClick);
      const type = Boolean(payload.capabilities?.deviceControl?.typeText);
      deviceBridgeStatus = `bridge online · control ${enabled ? "on" : "off"} · click ${click ? "yes" : "no"} · type ${type ? "yes" : "no"}`;
    });
  });

  document.querySelector("#device-observe")?.addEventListener("click", () => {
    void observeDeviceFromPrompt();
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

async function observeDeviceFromPrompt(): Promise<void> {
  await deviceAction(async () => {
    saveDeviceBridgeSettings();
    const payload = await deviceFetch("/actions", {
      method: "POST",
      body: JSON.stringify({ type: "observe_screen" })
    });
    const frontmost = payload.result?.frontmostApp?.app ? ` · ${payload.result.frontmostApp.app}` : "";
    const screenshot = payload.result?.screenshot?.path ? ` · ${payload.result.screenshot.path}` : "";
    deviceBridgeObservation = `observed${frontmost}${screenshot}`;
    deviceBridgeStatus = "device observed";
  });
}

async function deviceAction(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    deviceBridgeStatus = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function deviceFetch(path: string, init: RequestInit = {}): Promise<Record<string, any>> {
  if (!deviceBridgeUrl || !deviceBridgeToken) throw new Error("device bridge URL or token missing");
  const response = await fetch(`${deviceBridgeUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${deviceBridgeToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok || payload.ok === false) {
    throw new Error(String(payload.error ?? `device bridge failed: ${response.status}`));
  }
  return payload;
}

function saveDeviceBridgeSettings(): void {
  deviceBridgeUrl =
    document.querySelector<HTMLInputElement>("#device-bridge-url")?.value.trim() || deviceBridgeUrl;
  deviceBridgeToken =
    document.querySelector<HTMLInputElement>("#device-bridge-token")?.value.trim() || deviceBridgeToken;
  window.localStorage.setItem("slyos:deviceBridgeUrl", deviceBridgeUrl);
  window.localStorage.setItem("slyos:deviceBridgeToken", deviceBridgeToken);
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

function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const isSecure = window.location.protocol === "https:";
  if (!isLocalhost && !isSecure) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("SlyOS service worker registration failed", error);
    });
  });
}
