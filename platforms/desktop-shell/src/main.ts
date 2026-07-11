import {
  createBrainSyncClient,
  createBrowserMemoryStore,
  planPrompt,
  type AgentAction,
  type AgentPlan,
  type BrainSyncClient,
  type MemoryItem
} from "@badscientist/agent-core";
import {
  defaultModelFor,
  generateWithProvider,
  providerOptions,
  validateProviderKey,
  type ProviderId
} from "./providers";
import {
  buildBrainGraph,
  findBrainNode,
  type BrainNodeType,
  type BrainNode,
  type BrainCanvasOptions,
  typeColor,
  wireBrainCanvas
} from "./brainGraph";
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

interface Shortcut {
  label: string;
  kind: ShellScreen;
  glyph: string;
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
const defaultSupabaseUrl = "https://xfftheaprdedypqlcvzg.supabase.co";
const defaultSupabasePublishableKey = "sb_publishable_AxUM6xdI_3L-no-9MbNsxQ__u_eLmsQ";
const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? defaultSupabaseUrl;
const envSupabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? defaultSupabasePublishableKey;

let screen: ShellScreen = "boot";
let promptText = "";
let memoryQuery = "";
let memoryAnswer = "";
let memoryFilter: BrainNodeType | null = null;
let selectedBrainKey: string | null = null;
let lastPlan: AgentPlan | null = null;
let syncClient: BrainSyncClient | null = null;
let syncStatus = "not connected";
let supabaseUrl = window.localStorage.getItem("slyos:supabaseUrl") ?? envSupabaseUrl;
let supabasePublishableKey =
  window.localStorage.getItem("slyos:supabasePublishableKey") ?? envSupabasePublishableKey;
let supabaseEmail = window.localStorage.getItem("slyos:supabaseEmail") ?? "";
let agentPaused = false;
let deviceBridgeUrl = window.localStorage.getItem("slyos:deviceBridgeUrl") ?? "http://127.0.0.1:4317";
let deviceBridgeToken =
  window.localStorage.getItem("slyos:deviceBridgeToken") ?? (nativePlatform === "macos" ? "slyos-local-dev" : "");
let deviceBridgeStatus = "device bridge not checked";
let deviceBridgeObservation = "";
let setupComplete = window.localStorage.getItem("slyos:setupComplete") === "true";
let profileName = window.localStorage.getItem("slyos:profileName") ?? "";
let profileVoice = window.localStorage.getItem("slyos:profileVoice") ?? "";
let selectedProvider = readProviderId(window.localStorage.getItem("slyos:modelProvider"));
let modelName =
  window.localStorage.getItem(providerModelStorageKey(selectedProvider)) ??
  window.localStorage.getItem("slyos:modelName") ??
  defaultModelFor(selectedProvider);
let providerApiKey = window.localStorage.getItem(providerKeyStorageKey(selectedProvider)) ?? "";
let providerStatus = providerApiKey ? `${providerLabel(selectedProvider)} key saved on this device.` : "model key missing";
let agentAnswer = "";
let agentBusy = false;
const memorySearchHistoryKey = "slyos:memorySearchHistory";

if (supabaseUrl && supabasePublishableKey) {
  syncClient = createBrainSyncClient({ url: supabaseUrl, publishableKey: supabasePublishableKey });
  syncStatus = "Configured. Sign in to sync memory/settings.";
}

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
if (!setupComplete && !["boot", "setup"].includes(screen)) {
  screen = "setup";
}

const shortcuts: Shortcut[] = [
  { label: "Look", kind: "look", glyph: "◉" },
  { label: "Docs", kind: "research", glyph: "✎" },
  { label: "Expenses", kind: "expenses", glyph: "$" },
  { label: "Setup", kind: "setup", glyph: "⚙" }
];

const missionChoices = [
  { title: "Find buyers for my product", subtitle: "Web-find companies that would buy it" },
  { title: "Find a job", subtitle: "Web-find companies hiring + people to reach" },
  { title: "Find people & opportunities", subtitle: "Web-find useful people/orgs to connect with" }
];

setTimeout(() => {
  if (screen === "boot") {
    screen = setupComplete ? "lock" : "setup";
    render();
  }
}, 1600);

render();
registerServiceWorker();

function readProviderId(value: string | null): ProviderId {
  return providerOptions.some((option) => option.id === value) ? (value as ProviderId) : "gemini";
}

function providerKeyStorageKey(provider: ProviderId): string {
  return `slyos:${provider}:apiKey`;
}

function providerModelStorageKey(provider: ProviderId): string {
  return `slyos:${provider}:modelName`;
}

function providerLabel(provider: ProviderId = selectedProvider): string {
  return providerOptions.find((option) => option.id === provider)?.label ?? "Model";
}

function localMemories(): MemoryItem[] {
  return memoryStore.list().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function memorySearchHistory(): string[] {
  const raw = window.localStorage.getItem(memorySearchHistoryKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function rememberMemorySearch(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  const next = [trimmed, ...memorySearchHistory().filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6);
  window.localStorage.setItem(memorySearchHistoryKey, JSON.stringify(next));
}

function agentResponses(): MemoryItem[] {
  return localMemories().filter((item) => item.tags.includes("agent-response"));
}

function peopleMemories(): MemoryItem[] {
  return localMemories().filter((item) => item.kind === "profile" || item.tags.includes("person"));
}

function setupBlockers(): string[] {
  const blockers: string[] = [];
  if (!setupComplete) blockers.push("Finish setup");
  if (!providerApiKey.trim()) blockers.push("Add a model API key");
  if (!syncClient) blockers.push("Configure Supabase sync");
  if (!deviceBridgeStatus.startsWith("bridge online") && !deviceBridgeStatus.startsWith("device observed")) {
    blockers.push("Check the Mac device bridge");
  }
  return blockers;
}

function buildMemoryContext(): string {
  const profile = [
    profileName ? `Name: ${profileName}` : "",
    profileVoice ? `Voice/persona: ${profileVoice}` : ""
  ].filter(Boolean);
  const memories = localMemories()
    .slice(0, 24)
    .map((item) => `${item.kind}: ${item.title} - ${item.body}`);
  return [...profile, ...memories].join("\n");
}

function navigate(next: ShellScreen): void {
  if (next !== "manual") agentPaused = false;
  screen = next;
  const params = new URLSearchParams(window.location.search);
  params.set("screen", screen);
  if (nativePlatform) params.set("native", nativePlatform);
  history.replaceState(null, "", `?${params.toString()}`);
  render();
}

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
  const blockers = setupBlockers();
  const recent = localMemories().slice(0, 2).map((item) => item.title);
  const priorities = [
    ...blockers,
    ...(lastPlan ? [`${lastPlan.actions.length} brain step${lastPlan.actions.length === 1 ? "" : "s"} held from last prompt`] : []),
    ...recent
  ].slice(0, 3);
  return `
    <div class="lock-screen tap-screen" data-screen="home">
      <div class="lock-top">
        <div class="time">${escapeHtml(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</div>
        <div class="battery">${setupComplete ? "ready" : "setup"}</div>
      </div>
      <div class="matter">${priorities.length ? `You have ${priorities.length} thing${priorities.length === 1 ? "" : "s"} that matter.` : "SlyOS is quiet."}</div>
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
  const blockers = setupBlockers();
  const statusLeft = new Date().toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  const statusRight = agentBusy ? "thinking" : blockers.length ? `${blockers.length} setup` : "ready";
  return `
    <div class="home-screen">
      <div class="home-status">
        <span>${escapeHtml(statusLeft)}</span>
        <span>${escapeHtml(statusRight)}</span>
      </div>
      <div class="home-spacer" aria-hidden="true"></div>
      <div class="prompt-title">what should happen?</div>
      ${
        blockers.length
          ? `<button class="setup-warning" type="button" data-screen="setup">${escapeHtml(blockers[0] ?? "Open setup")}</button>`
          : ""
      }
      <form id="prompt-form" class="ask-row">
        <input id="prompt-input" value="${escapeAttr(promptText)}" autocomplete="off" placeholder="ask me anything…" />
        <button class="camera-button" type="button" data-screen="look" aria-label="Look">◉</button>
        <button class="send-button" type="submit">${agentBusy ? "Run" : "Send"}</button>
      </form>
      <button class="talk-target home-talk" type="button" data-screen="voice">
        <div class="ring">●</div>
        <div>tap to talk</div>
      </button>
      ${agentAnswer ? `<section class="agent-answer"><span>${escapeHtml(providerLabel())}</span><p>${escapeHtml(agentAnswer)}</p></section>` : ""}
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
  const blockers = setupBlockers();
  const memoryCount = localMemories().length;
  const summary = blockers.length
    ? `SlyOS needs ${blockers.length} setup item${blockers.length === 1 ? "" : "s"} before it can operate cleanly.`
    : `SlyOS is online with ${memoryCount} local memor${memoryCount === 1 ? "y" : "ies"} and ${agentResponses().length} agent output${agentResponses().length === 1 ? "" : "s"}.`;
  return `
    <div class="panel-screen">
      ${screenHeader("Now")}
      <div class="mini-row">
        <span>${escapeHtml(new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }))}</span>
        <button data-screen="outbox">Sent for you</button>
        <button data-screen="reconnect">Reconnect</button>
      </div>
      <section class="brief-card">
        <div class="brief-head">
          <span>What you missed</span>
          <button type="button" data-screen="setup">↻</button>
        </div>
        <p>${escapeHtml(summary)}</p>
        <strong>${escapeHtml(providerStatus)}</strong>
      </section>
      <div class="section-label">Waiting on you · ${blockers.length}</div>
      <div class="thread-list">
        ${blockers.length ? blockers.map(renderBlocker).join("") : `<p class="empty-state">No setup blockers right now.</p>`}
      </div>
    </div>
  `;
}

function renderOutbox(): string {
  const sent = agentResponses();
  return `
    <div class="panel-screen outbox-screen">
      ${screenHeader("Sent for you", "now")}
      <p class="screen-subtitle">Everything the agent produced on your behalf from your prompt, memory, and model key.</p>
      <div class="sent-list">
        ${sent.length ? sent.map(renderSentItem).join("") : `<p class="empty-state">No agent outputs yet. Run a prompt from Home.</p>`}
      </div>
    </div>
  `;
}

function renderSentItem(item: MemoryItem): string {
  return `
    <article class="sent-card">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <span>${escapeHtml(item.source)} · ${escapeHtml(new Date(item.createdAt).toLocaleString())}</span>
        </div>
        <b>done</b>
      </div>
      <p>${escapeHtml(item.body)}</p>
      <small>↳ generated through your selected model using local brain context</small>
      <button type="button" data-screen="home">Use again</button>
    </article>
  `;
}

function renderReconnect(): string {
  const people = peopleMemories();
  return `
    <div class="panel-screen reconnect-screen">
      ${screenHeader("Reconnect", "now")}
      <div class="segmented">
        <button class="active" type="button">Quiet contacts</button>
        <button type="button">My network</button>
      </div>
      <p class="screen-subtitle">${people.length} people in your local brain.</p>
      ${
        people.length
          ? `<div class="thread-list">${people.map(renderPersonMemory).join("")}</div>`
          : `<p class="empty-state large">No people memories yet.</p>`
      }
    </div>
  `;
}

function renderPeople(): string {
  const people = peopleMemories();
  return `
    <div class="panel-screen">
      ${screenHeader("People")}
      <div class="thread-list people-list">
        ${people.length ? people.map(renderPersonMemory).join("") : `<p class="empty-state">No people memories yet.</p>`}
      </div>
    </div>
  `;
}

function renderBlocker(blocker: string): string {
  return `
    <article class="thread-card">
      <div class="avatar-wrap">
        <div class="avatar">!</div>
        <div class="app-badge">S</div>
      </div>
      <div class="thread-body">
        <div class="thread-top">
          <strong>${escapeHtml(blocker)}</strong>
        </div>
        <p><span>via Setup</span></p>
        <blockquote>${escapeHtml(blockerHelp(blocker))}</blockquote>
        <div class="open-row">
          <button type="button" data-screen="setup">Open ↗</button>
        </div>
      </div>
    </article>
  `;
}

function renderPersonMemory(item: MemoryItem): string {
  return `
    <article class="thread-card">
      <div class="avatar-wrap">
        <div class="avatar">${escapeHtml(item.title[0] ?? "P")}</div>
        <div class="app-badge">M</div>
      </div>
      <div class="thread-body">
        <div class="thread-top">
          <strong>${escapeHtml(item.title)}</strong>
        </div>
        <p><span>${escapeHtml(item.source)}</span></p>
        <blockquote>${escapeHtml(item.body)}</blockquote>
      </div>
    </article>
  `;
}

function blockerHelp(blocker: string): string {
  if (blocker.includes("setup")) return "Complete the setup wizard so the shell knows your model, account, and device bridge.";
  if (blocker.includes("API")) return "Paste a Gemini, OpenAI, or Claude key so prompts produce live model output.";
  if (blocker.includes("Supabase")) return "Connect the Supabase project to sync memory and settings across devices.";
  return "Start the local Mac bridge and check it so SlyOS can observe and operate this computer.";
}

function renderMemory(): string {
  const memories = localMemories();
  const shown = memoryQuery ? memoryStore.search(memoryQuery) : memories;
  const graph = buildBrainGraph(shown);
  const selected = findBrainNode(graph, selectedBrainKey);
  const recentQueries = memorySearchHistory();
  const filters: Array<{ label: string; short: string; type: BrainNodeType }> = [
    { label: "Person", short: "Person", type: "person" },
    { label: "Fact", short: "Fact", type: "idea" },
    { label: "Task", short: "Task", type: "task" },
    { label: "Paper", short: "Paper", type: "paper" },
    { label: "Recall", short: "Recall", type: "recall" },
    { label: "Network", short: "Netw", type: "network" }
  ];
  return `
    <div class="panel-screen memory-screen">
      ${screenHeader("Memory")}
      <div class="caption-line">${memories.length} memor${memories.length === 1 ? "y" : "ies"} mapped · drag to rotate, pinch to zoom</div>
      <form id="memory-search-form" class="memory-search">
        <input id="memory-query" value="${escapeAttr(memoryQuery)}" placeholder="Ask your memory…" />
        <button type="submit">Ask</button>
        <button class="text-button" type="button" data-screen="memory-settings">⚙ Settings</button>
      </form>
      ${memoryAnswer ? `<section class="memory-answer"><span>✦</span><p>${escapeHtml(memoryAnswer)}</p></section>` : ""}
      <div class="recent-row">
        <span>Recent</span>
        <button type="button" data-clear-memory-searches="true">Clear</button>
      </div>
      <div class="recent-list">
        ${
          recentQueries.length
            ? recentQueries.map((query) => `<button type="button" data-memory-search="${escapeAttr(query)}">↻ ${escapeHtml(query)}</button>`).join("")
            : `<p class="empty-state small">No recent memory questions yet.</p>`
        }
      </div>
      <div class="memory-legend">
        ${filters
          .map(
            (filter) => `
              <button class="${memoryFilter === filter.type ? "active" : ""}" type="button" data-memory-filter="${filter.type}" aria-label="${escapeAttr(filter.label)}">
                <i style="background:${typeColor(filter.type)}"></i>${escapeHtml(filter.short)}
              </button>`
          )
          .join("")}
      </div>
      <div class="memory-map" aria-label="Memory graph preview">
        ${renderBrainCanvas("memory")}
        ${!shown.length ? `<p>No memory nodes yet.</p>` : ""}
      </div>
      ${selected && selected.type !== "hub" ? renderBrainSelection(selected) : ""}
      <div class="divider"></div>
      <div class="settings-list compact">
        ${renderSettingsCard({ title: "Mission", subtitle: "Set a goal - SlyOS will plan and pursue it", screen: "mission" })}
        ${renderSettingsCard({ title: "My network", subtitle: "Find people you know & message them", screen: "network" })}
      </div>
    </div>
  `;
}

function renderBrainCanvas(mode: "memory" | "voice"): string {
  return `<canvas class="brain-canvas ${mode === "voice" ? "voice-canvas" : ""}" data-brain-canvas="${mode}" aria-label="SlyOS 3D brain"></canvas>`;
}

function renderBrainSelection(node: BrainNode): string {
  return `
    <section class="brain-selection">
      <div>
        <span>${escapeHtml(node.type)} · ${escapeHtml(node.source)}</span>
        <strong>${escapeHtml(node.label)}</strong>
      </div>
      <p>${escapeHtml(node.content)}</p>
    </section>
  `;
}

function renderMemorySettings(): string {
  const cards: SettingsCard[] = [
    { title: "Character", subtitle: profileVoice || "How the agent should sound like you", screen: "setup" },
    { title: "Your details", subtitle: profileName || "Name, contact, and profile context", screen: "setup" },
    { title: "API keys & model", subtitle: providerStatus, screen: "setup" },
    { title: "Efficiency", subtitle: `${agentResponses().length} agent output${agentResponses().length === 1 ? "" : "s"} stored` },
    { title: "On-device model", subtitle: "Available per platform when native runtimes are installed", screen: "setup" },
    { title: "Appearance" },
    { title: "Investing" },
    { title: "Banking link" },
    { title: "Talk to your agent", screen: "voice" },
    { title: "Your writing voice", ...(profileVoice ? { subtitle: profileVoice } : {}), screen: "setup" },
    { title: "Persona per platform", screen: "setup" },
    { title: "Your uploads", subtitle: `${localMemories().length} local brain item${localMemories().length === 1 ? "" : "s"}` },
    { title: "Import & voice", screen: "setup" },
    { title: "Models & spending", subtitle: `${providerLabel()} · ${modelName}`, screen: "setup" },
    { title: "Connections", subtitle: syncStatus, screen: "setup" },
    { title: "Per-app responses" },
    { title: "Document Q&A" },
    { title: "Lock screen" },
    { title: "Floating nav panel", subtitle: deviceBridgeStatus, screen: "setup" },
    { title: "Brain backup", subtitle: syncStatus, glyph: "shield", screen: "setup" }
  ];
  return `
    <div class="panel-screen memory-settings-screen">
      ${screenHeader("Memory", "memory")}
      <div class="build-pill">✦ Settings build v21 · on-device test gate</div>
      <div class="settings-list">
        ${cards.map(renderSettingsCard).join("")}
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
  const papers = localMemories().filter((item) => item.tags.includes("paper"));
  return `
    <div class="panel-screen">
      ${screenHeader("Research")}
      <p class="screen-subtitle">${papers.length} paper${papers.length === 1 ? "" : "s"} in local brain</p>
      <div class="research-actions">
        <button class="primary-pill" type="button" data-screen="home">+ New paper</button>
        <button class="secondary-pill" type="button" data-screen="cowork">⌘ Cowork</button>
      </div>
      <div class="search-card">🔍 <span>Search papers...</span></div>
      ${
        papers.length
          ? `<div class="tool-list">${papers.map((paper) => rowTool(paper.title)).join("")}</div>`
          : `<p class="empty-state">No papers yet. Ask SlyOS to draft or import one.</p>`
      }
    </div>
  `;
}

function renderCowork(): string {
  const chats = agentResponses();
  return `
    <div class="panel-screen cowork-screen">
      ${screenHeader("Cowork", "research")}
      <p class="screen-subtitle">A local agent that builds real files - give it a task, it does it step by step.</p>
      <div class="cowork-actions">
        <button class="primary-pill" type="button" data-screen="home">+ New chat</button>
        <button type="button">Files</button>
      </div>
      <div class="search-card">🔍 <span>Search chats...</span></div>
      ${
        chats.length
          ? `<div class="tool-list">${chats.map((chat) => rowTool(chat.title)).join("")}</div>`
          : `<p class="empty-state">No chats yet. Run a prompt from Home.</p>`
      }
    </div>
  `;
}

function renderApps(): string {
  const apps: Array<{ label: string; screen: ShellScreen }> = [
    { label: "Setup", screen: "setup" },
    { label: "Memory", screen: "memory" },
    { label: "Now", screen: "now" },
    { label: "Research", screen: "research" },
    { label: "Look", screen: "look" },
    { label: "Expenses", screen: "expenses" },
    { label: "Manual mode", screen: "manual" }
  ];
  return `
    <div class="panel-screen">
      ${screenHeader("Apps")}
      <button class="manual-link" data-screen="manual">⏸ Manual mode — pause the agent</button>
      <div class="shortcut-row app-shortcuts">
        ${shortcuts.map((shortcut) => renderShortcut(shortcut)).join("")}
      </div>
      <div class="tool-list">
        ${apps.map((app) => rowTool(app.label, app.screen)).join("")}
      </div>
    </div>
  `;
}

function renderManual(): string {
  agentPaused = true;
  const tools = [
    `Provider: ${providerLabel()}`,
    `Sync: ${syncStatus}`,
    `Bridge: ${deviceBridgeStatus}`,
    `Memories: ${localMemories().length}`
  ];
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
  const currentProvider = providerOptions.find((option) => option.id === selectedProvider) ?? {
    id: "gemini" as const,
    label: "Gemini",
    defaultModel: "gemini-1.5-flash",
    keyPlaceholder: "AIza..."
  };
  const blockers = setupBlockers();
  return `
    <div class="panel-screen setup-screen">
      ${screenHeader("Setup")}
      <div class="caption-line">${setupComplete ? "Setup complete" : `${blockers.length} setup item${blockers.length === 1 ? "" : "s"} left`}</div>
      <section class="setup-block">
        <h3>Your brain profile</h3>
        <p>This profile is injected into model requests and synced only when you push settings.</p>
        <div class="sync-grid">
          <input id="profile-name" value="${escapeAttr(profileName)}" placeholder="Your name" />
          <input id="profile-voice" value="${escapeAttr(profileVoice)}" placeholder="Writing voice / personality" />
        </div>
      </section>
      <section class="setup-block">
        <h3>Model</h3>
        <p>SlyOS calls the provider you choose here. Keys stay in this device's local storage.</p>
        <div class="chip-row provider-row">
          ${providerOptions
            .map(
              (option) =>
                `<button class="${option.id === selectedProvider ? "active" : ""}" data-provider="${option.id}" type="button">${escapeHtml(option.label)}</button>`
            )
            .join("")}
        </div>
        <div class="sync-grid">
          <input id="provider-model" value="${escapeAttr(modelName)}" placeholder="${escapeAttr(currentProvider.defaultModel)}" />
          <input id="provider-key" type="password" value="${escapeAttr(providerApiKey)}" placeholder="${escapeAttr(currentProvider.keyPlaceholder)}" />
        </div>
        <div class="button-pair">
          <button id="provider-save" type="button">Save model</button>
          <button id="provider-test" type="button">Test model</button>
        </div>
        <div class="caption-line">${escapeHtml(providerStatus)}</div>
      </section>
      <section class="setup-block">
        <h3>Account & cross-device brain</h3>
        <p>Log in here. Use the same email/password on every device, then Pull brain on a new device and Push brain after local changes.</p>
        <div class="sync-grid">
          <input id="supabase-url" value="${escapeAttr(supabaseUrl)}" placeholder="https://project-ref.supabase.co" />
          <input id="supabase-key" value="${escapeAttr(supabasePublishableKey)}" placeholder="publishable key" />
          <input id="supabase-email" value="${escapeAttr(supabaseEmail)}" placeholder="you@example.com" />
          <input id="supabase-password" type="password" placeholder="account password" />
        </div>
        <div class="button-pair">
          <button id="sync-configure" type="button">Use Supabase</button>
          <button id="sync-signup" type="button">Create account</button>
          <button id="sync-login" type="button">Sign in</button>
          <button id="sync-pull" type="button">Pull brain</button>
          <button id="sync-push" type="button">Push brain</button>
        </div>
        <div class="caption-line">${escapeHtml(syncStatus)}</div>
      </section>
      <section class="setup-block">
        <h3>Device control</h3>
        <p>Mac bridge for observe, click, type, hotkeys, clipboard, and app control. iOS allows app-scoped control only.</p>
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
        <h3>Permissions for maximum control</h3>
        <div class="permission-grid">
          ${renderPermissionCard("macOS", ["Accessibility", "Screen Recording", "Automation prompts", "Microphone/Camera for voice + look"])}
          ${renderPermissionCard("iPhone", ["Developer Mode + trusted developer", "Camera/Microphone when prompted", "Photos/Files for imports", "Notifications when native alerts are enabled"])}
          ${renderPermissionCard("Linux", ["Screen capture portal", "xdotool/ydotool or desktop automation", "Microphone/Camera when prompted"])}
          ${renderPermissionCard("Windows", ["PowerShell local agent", "UI Automation/screen capture", "Defender trust for unsigned builds"])}
        </div>
      </section>
      <section class="setup-block">
        <h3>Bring in your data</h3>
        <p>Add a manual memory now; importers can feed the same brain store.</p>
        <form id="setup-remember-form" class="remember-form">
          <input id="setup-remember-title" placeholder="Memory title" />
          <input id="setup-remember-body" placeholder="Thing SlyOS should remember" />
          <button type="submit">Remember</button>
        </form>
      </section>
      <button id="setup-complete" class="primary-wide orange" type="button">${setupComplete ? "Back to SlyOS" : "Complete setup"}</button>
    </div>
  `;
}

function renderPermissionCard(title: string, items: string[]): string {
  return `
    <article class="permission-card">
      <strong>${escapeHtml(title)}</strong>
      ${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
    </article>
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
      <div class="voice-graph" aria-hidden="true">${renderBrainCanvas("voice")}</div>
      <div class="listening">listening...</div>
    </div>
  `;
}

function renderBottomNav(): string {
  const blockerCount = setupBlockers().length;
  const nowItem = blockerCount
    ? { id: "now" as ShellScreen, label: "Now", icon: "now", badge: blockerCount }
    : { id: "now" as ShellScreen, label: "Now", icon: "now" };
  const items: Array<{ id: ShellScreen; label: string; icon: string; badge?: number }> = [
    { id: "home", label: "Home", icon: "home" },
    nowItem,
    { id: "research", label: "Research", icon: "research" },
    { id: "apps", label: "Apps", icon: "apps" }
  ];
  return `
    <nav class="bottom-nav" aria-label="SlyOS bottom navigation">
      ${items.slice(0, 2).map(renderNavItem).join("")}
      <button class="brain-tab ${["memory", "memory-settings", "mission", "network"].includes(screen) ? "active" : ""}" data-screen="memory">
        <span class="nav-icon icon-brain"></span>
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
      <span class="nav-icon icon-${item.icon}">${item.badge ? `<b>${item.badge}</b>` : ""}</span>
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

function rowTool(label: string, target?: ShellScreen): string {
  return `<button class="tool-row" type="button" ${target ? `data-screen="${target}"` : ""}><span>${escapeHtml(label)}</span></button>`;
}

function shouldShowNav(current: ShellScreen): boolean {
  return ["home", "now", "memory", "memory-settings", "research", "apps", "manual"].includes(current);
}

function wireEvents(): void {
  wireBrainCanvases();

  document.querySelectorAll<HTMLElement>("[data-screen]").forEach((element) => {
    element.addEventListener("click", () => {
      const next = element.dataset.screen as ShellScreen | undefined;
      if (!next) return;
      navigate(next);
    });
  });

  document.querySelector("[data-resume]")?.addEventListener("click", () => {
    agentPaused = false;
    navigate("home");
  });

  document.querySelector("[data-device-loop]")?.addEventListener("click", () => {
    void observeDeviceFromPrompt();
  });

  document.querySelector("#prompt-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void runPrompt();
  });

  document.querySelector("#memory-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void runMemorySearch();
  });

  document.querySelectorAll<HTMLElement>("[data-memory-search]").forEach((element) => {
    element.addEventListener("click", () => {
      memoryQuery = element.dataset.memorySearch ?? "";
      void runMemorySearch(memoryQuery);
    });
  });

  document.querySelector("[data-clear-memory-searches]")?.addEventListener("click", () => {
    window.localStorage.removeItem(memorySearchHistoryKey);
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-memory-filter]").forEach((element) => {
    element.addEventListener("click", () => {
      const type = element.dataset.memoryFilter as BrainNodeType | undefined;
      memoryFilter = memoryFilter === type ? null : type ?? null;
      selectedBrainKey = null;
      render();
    });
  });

  document.querySelector("#setup-remember-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = document.querySelector<HTMLInputElement>("#setup-remember-title")?.value.trim() || "Remembered";
    const body = document.querySelector<HTMLInputElement>("#setup-remember-body")?.value.trim();
    if (!body) return;
    memoryStore.add({ kind: "fact", title, body, tags: ["manual", "setup"], source: "setup" });
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-provider]").forEach((element) => {
    element.addEventListener("click", () => {
      selectedProvider = readProviderId(element.dataset.provider ?? null);
      modelName =
        window.localStorage.getItem(providerModelStorageKey(selectedProvider)) ?? defaultModelFor(selectedProvider);
      providerApiKey = window.localStorage.getItem(providerKeyStorageKey(selectedProvider)) ?? "";
      providerStatus = providerApiKey
        ? `${providerLabel(selectedProvider)} key saved on this device.`
        : `${providerLabel(selectedProvider)} key missing.`;
      render();
    });
  });

  document.querySelector("#provider-save")?.addEventListener("click", () => {
    saveProviderSettings();
    providerStatus = `${providerLabel()} settings saved.`;
    render();
  });

  document.querySelector("#provider-test")?.addEventListener("click", () => {
    void providerAction(async () => {
      saveProviderSettings();
      providerStatus = `Testing ${providerLabel()}...`;
      render();
      const text = await validateProviderKey({
        provider: selectedProvider,
        apiKey: providerApiKey,
        model: modelName
      });
      providerStatus = `${providerLabel()} online: ${text}`;
    });
  });

  document.querySelector("#setup-complete")?.addEventListener("click", () => {
    saveProfileSettings();
    saveProviderSettings();
    setupComplete = true;
    window.localStorage.setItem("slyos:setupComplete", "true");
    memoryStore.setSetting("profileName", profileName);
    memoryStore.setSetting("profileVoice", profileVoice);
    memoryStore.setSetting("modelProvider", selectedProvider);
    memoryStore.setSetting("modelName", modelName);
    navigate("home");
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

function wireBrainCanvases(): void {
  document.querySelectorAll<HTMLCanvasElement>("[data-brain-canvas]").forEach((canvas) => {
    const mode = canvas.dataset.brainCanvas === "voice" ? "voice" : "memory";
    const items = mode === "memory" && memoryQuery ? memoryStore.search(memoryQuery) : localMemories();
    const graph = buildBrainGraph(items);
    const options: BrainCanvasOptions = {
      mode,
      selectedKey: mode === "memory" ? selectedBrainKey : null,
      filterType: mode === "memory" ? memoryFilter : null,
      query: mode === "memory" ? memoryQuery : ""
    };
    if (mode === "memory") {
      wireBrainCanvas(canvas, graph, {
        ...options,
        onSelect: (key) => {
          selectedBrainKey = key;
          render();
        }
      });
      return;
    }
    wireBrainCanvas(canvas, graph, options);
  });
}

async function runMemorySearch(seed?: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("#memory-query");
  memoryQuery = (seed ?? input?.value ?? "").trim();
  selectedBrainKey = null;
  if (!memoryQuery) {
    memoryAnswer = "";
    render();
    return;
  }

  rememberMemorySearch(memoryQuery);
  const hits = memoryStore.search(memoryQuery).slice(0, 8);
  const localAnswer = hits.length
    ? hits
        .slice(0, 3)
        .map((item) => `${item.title}: ${item.body}`)
        .join(" ")
    : "I don't have anything on that yet.";

  if (!providerApiKey.trim()) {
    memoryAnswer = localAnswer;
    render();
    return;
  }

  memoryAnswer = "Asking your brain...";
  render();
  try {
    const answer = await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      prompt: `Answer this memory question using the supplied SlyOS brain context. If the context is insufficient, say what is missing.\n\nQuestion: ${memoryQuery}`,
      memoryContext: hits.length
        ? hits.map((item) => `${item.kind}: ${item.title}\n${item.body}`).join("\n\n")
        : buildMemoryContext()
    });
    memoryAnswer = answer;
  } catch (error) {
    memoryAnswer = error instanceof Error ? error.message : String(error);
  }
  render();
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

async function runPrompt(): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("#prompt-input");
  promptText = input?.value ?? "";
  const request = promptText.trim();
  if (!request || agentBusy) return;

  lastPlan = planPrompt(request);
  agentAnswer = providerApiKey.trim() ? "" : "Setup needs a model key before SlyOS can answer live.";
  memoryStore.add({
    kind: "message",
    title: `Prompt: ${request.slice(0, 64)}`,
    body: `Brain planned ${lastPlan.actions.length} step${lastPlan.actions.length === 1 ? "" : "s"} for: ${request}`,
    tags: ["prompt", "brain"],
    source: "home"
  });
  promptText = "";

  if (!providerApiKey.trim()) {
    render();
    return;
  }

  agentBusy = true;
  render();
  try {
    const answer = await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      prompt: request,
      memoryContext: buildMemoryContext()
    });
    agentAnswer = answer;
    memoryStore.add({
      kind: "message",
      title: `SlyOS: ${request.slice(0, 56)}`,
      body: answer,
      tags: ["agent-response", "brain"],
      source: providerLabel()
    });
  } catch (error) {
    agentAnswer = error instanceof Error ? error.message : String(error);
  } finally {
    agentBusy = false;
    render();
  }
}

async function providerAction(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    providerStatus = error instanceof Error ? error.message : String(error);
  }
  render();
}

function saveProviderSettings(): void {
  selectedProvider = readProviderId(selectedProvider);
  modelName =
    document.querySelector<HTMLInputElement>("#provider-model")?.value.trim() ||
    window.localStorage.getItem(providerModelStorageKey(selectedProvider)) ||
    defaultModelFor(selectedProvider);
  providerApiKey = document.querySelector<HTMLInputElement>("#provider-key")?.value.trim() ?? providerApiKey;
  window.localStorage.setItem("slyos:modelProvider", selectedProvider);
  window.localStorage.setItem("slyos:modelName", modelName);
  window.localStorage.setItem(providerModelStorageKey(selectedProvider), modelName);
  if (providerApiKey) window.localStorage.setItem(providerKeyStorageKey(selectedProvider), providerApiKey);
}

function saveProfileSettings(): void {
  profileName = document.querySelector<HTMLInputElement>("#profile-name")?.value.trim() ?? profileName;
  profileVoice = document.querySelector<HTMLInputElement>("#profile-voice")?.value.trim() ?? profileVoice;
  window.localStorage.setItem("slyos:profileName", profileName);
  window.localStorage.setItem("slyos:profileVoice", profileVoice);
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
