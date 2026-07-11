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
  | "feature-parity"
  | "mission"
  | "network"
  | "research"
  | "cowork"
  | "chat"
  | "operate"
  | "skill"
  | "documents"
  | "investing"
  | "vault"
  | "backup"
  | "floating-nav"
  | "models"
  | "per-app"
  | "imports"
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

interface FeatureStatus {
  title: string;
  android: string;
  macos: string;
  ios: string;
  screen: ShellScreen;
}

interface VaultRecord {
  id: string;
  label: string;
  ciphertext: string;
  iv: string;
  salt: string;
  updatedAt: string;
}

type OutboxStatus = "draft" | "sent" | "done" | "recalled" | "failed";

interface OutboxRecord {
  id: string;
  title: string;
  target: string;
  channel: string;
  body: string;
  why: string;
  status: OutboxStatus;
  createdAt: string;
  updatedAt: string;
  recalledAt?: string;
}

type NowTaskStatus = "waiting" | "drafted" | "sent" | "closed";

interface NowTask {
  id: string;
  contact: string;
  app: string;
  pkg?: string;
  text: string;
  draft?: string;
  status: NowTaskStatus;
  createdAt: string;
  updatedAt: string;
  source: string;
  screen?: ShellScreen;
}

interface Proposal {
  id: string;
  title: string;
  subtitle: string;
  action: "setup" | "model" | "bridge" | "backup" | "reconnect" | "outbox" | "memory";
  cta: string;
}

type AppResponseMode = "off" | "draft" | "full";

interface PerAppMode {
  id: string;
  label: string;
  pkg: string;
  glyph: string;
  mode: AppResponseMode;
  updatedAt: string;
}

interface AutomationPrefs {
  reconnectWeekly: boolean;
  spicyDaily: boolean;
  totalRecall: boolean;
  lockScreenBrief: boolean;
  floatingNav: boolean;
}

type DevicePrimitive = { type: string; [key: string]: unknown };
type DeviceSequence = DevicePrimitive[];

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
let operatePrompt = "";
let operateStatus = "device loop idle";
let vaultStatus = "locked";
let revealedVault: { label: string; text: string } | null = null;
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
const outboxKey = "slyos:outboxRecords";
const nowTasksKey = "slyos:nowTasks";
const dismissedProposalsKey = "slyos:dismissedProposals";
const perAppModesKey = "slyos:perAppModes";
const automationPrefsKey = "slyos:automationPrefs";

const defaultAutomationPrefs: AutomationPrefs = {
  reconnectWeekly: true,
  spicyDaily: false,
  totalRecall: false,
  lockScreenBrief: true,
  floatingNav: true
};

const defaultPerAppModes: Array<Omit<PerAppMode, "mode" | "updatedAt">> = [
  { id: "messages", label: "Messages", pkg: "com.apple.MobileSMS", glyph: "M" },
  { id: "whatsapp", label: "WhatsApp", pkg: "net.whatsapp.WhatsApp", glyph: "W" },
  { id: "telegram", label: "Telegram", pkg: "org.telegram.messenger", glyph: "T" },
  { id: "gmail", label: "Gmail", pkg: "com.google.Gmail", glyph: "G" },
  { id: "mail", label: "Mail", pkg: "com.apple.mail", glyph: "M" },
  { id: "x", label: "X", pkg: "com.atebits.Tweetie2", glyph: "X" },
  { id: "linkedin", label: "LinkedIn", pkg: "com.linkedin.LinkedIn", glyph: "in" },
  { id: "instagram", label: "Instagram", pkg: "com.burbn.instagram", glyph: "I" },
  { id: "slack", label: "Slack", pkg: "com.tinyspeck.chatlyio", glyph: "S" },
  { id: "discord", label: "Discord", pkg: "com.hammerandchisel.discord", glyph: "D" }
];

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
  "people",
  "memory",
  "memory-settings",
  "feature-parity",
  "mission",
  "network",
  "research",
  "cowork",
  "chat",
  "operate",
  "skill",
  "documents",
  "investing",
  "vault",
  "backup",
  "floating-nav",
  "models",
  "per-app",
  "imports",
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

const docsFeatures: FeatureStatus[] = [
  {
    title: "First-run setup",
    android: "native",
    macos: "native",
    ios: "native",
    screen: "setup"
  },
  {
    title: "Home launcher",
    android: "home app",
    macos: "full-window shell",
    ios: "app shell",
    screen: "home"
  },
  {
    title: "Permissions",
    android: "launcher/accessibility/overlay",
    macos: "accessibility/screen recording",
    ios: "sandboxed app grants",
    screen: "setup"
  },
  {
    title: "Prompt action plan",
    android: "brain plan",
    macos: "brain plan",
    ios: "brain plan",
    screen: "home"
  },
  {
    title: "Voice call",
    android: "in-app voice",
    macos: "brain voice surface",
    ios: "brain voice surface",
    screen: "voice"
  },
  {
    title: "Auto-reply",
    android: "notification reply",
    macos: "draft/bridge",
    ios: "draft/handoff",
    screen: "chat"
  },
  {
    title: "Ask memory",
    android: "local brain",
    macos: "local + Supabase brain",
    ios: "local + Supabase brain",
    screen: "memory"
  },
  {
    title: "Import history",
    android: "chat import",
    macos: "file import",
    ios: "file/share import",
    screen: "imports"
  },
  {
    title: "Chat",
    android: "chat brain",
    macos: "chat brain",
    ios: "chat brain",
    screen: "chat"
  },
  {
    title: "Operate device",
    android: "accessibility loop",
    macos: "local bridge loop",
    ios: "shortcuts/handoff",
    screen: "operate"
  },
  {
    title: "Sign up/login",
    android: "Supabase Auth",
    macos: "Supabase Auth",
    ios: "Supabase Auth",
    screen: "setup"
  },
  {
    title: "Teach a skill",
    android: "record/replay",
    macos: "local skill memory",
    ios: "local skill memory",
    screen: "skill"
  },
  {
    title: "Look mode",
    android: "camera/screenshot",
    macos: "screenshot/webcam path",
    ios: "camera/import",
    screen: "look"
  },
  {
    title: "Scan docs",
    android: "camera/import",
    macos: "file import",
    ios: "file/import",
    screen: "documents"
  },
  {
    title: "Research",
    android: "paper writer",
    macos: "paper brain",
    ios: "paper brain",
    screen: "research"
  },
  {
    title: "Cowork",
    android: "local agent",
    macos: "local agent",
    ios: "chat companion",
    screen: "cowork"
  },
  {
    title: "Mission",
    android: "agent mission",
    macos: "agent mission",
    ios: "agent mission",
    screen: "mission"
  },
  {
    title: "Investing",
    android: "portfolio brain",
    macos: "portfolio brain",
    ios: "portfolio brain",
    screen: "investing"
  },
  {
    title: "Account sync",
    android: "Supabase",
    macos: "Supabase",
    ios: "Supabase",
    screen: "backup"
  },
  {
    title: "Bank vault",
    android: "encrypted vault",
    macos: "encrypted vault",
    ios: "encrypted vault",
    screen: "vault"
  },
  {
    title: "Models & cost",
    android: "provider router",
    macos: "provider router",
    ios: "provider router",
    screen: "models"
  },
  {
    title: "Floating nav",
    android: "overlay",
    macos: "fixed overlay bar",
    ios: "in-app bar",
    screen: "floating-nav"
  }
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

function readJsonStorage<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonStorage<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function agentResponses(): MemoryItem[] {
  return localMemories().filter((item) => item.tags.includes("agent-response"));
}

function outboxRecords(): OutboxRecord[] {
  return readJsonStorage<OutboxRecord[]>(outboxKey, [])
    .filter(isOutboxRecord)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function saveOutboxRecords(records: OutboxRecord[]): void {
  writeJsonStorage(outboxKey, records);
}

function isOutboxRecord(value: unknown): value is OutboxRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.target === "string" &&
    typeof record.channel === "string" &&
    typeof record.body === "string" &&
    typeof record.why === "string" &&
    typeof record.status === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

function recordOutbox(input: Omit<OutboxRecord, "id" | "createdAt" | "updatedAt">): OutboxRecord {
  const now = new Date().toISOString();
  const record: OutboxRecord = {
    ...input,
    id: localId("outbox"),
    createdAt: now,
    updatedAt: now
  };
  saveOutboxRecords([record, ...outboxRecords()].slice(0, 200));
  memoryStore.add({
    kind: "message",
    title: `Outbox: ${input.title}`,
    body: `${input.body}\n\nWhy: ${input.why}`,
    tags: ["outbox", "action-log", "brain", input.status],
    source: input.channel
  });
  return record;
}

function nowTasks(): NowTask[] {
  return readJsonStorage<NowTask[]>(nowTasksKey, [])
    .filter(isNowTask)
    .filter((task) => task.status !== "sent" && task.status !== "closed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function saveNowTasks(tasks: NowTask[]): void {
  writeJsonStorage(nowTasksKey, tasks.filter(isNowTask).slice(0, 200));
}

function isNowTask(value: unknown): value is NowTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === "string" &&
    typeof task.contact === "string" &&
    typeof task.app === "string" &&
    typeof task.text === "string" &&
    typeof task.status === "string" &&
    typeof task.createdAt === "string" &&
    typeof task.updatedAt === "string" &&
    typeof task.source === "string"
  );
}

function taskFeed(): NowTask[] {
  const blockers = setupBlockers().map((blocker): NowTask => {
    const now = new Date().toISOString();
    return {
      id: `blocker:${slugify(blocker)}`,
      contact: blocker,
      app: "Setup",
      text: blockerHelp(blocker),
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      source: "setup",
      screen: blockerScreen(blocker)
    };
  });
  return [...blockers, ...nowTasks()];
}

function proposalFeed(): Proposal[] {
  const dismissed = new Set(dismissedProposalIds());
  const proposals: Proposal[] = [];
  const responses = agentResponses();
  const sent = outboxRecords();
  const people = peopleMemories();

  if (!setupComplete) {
    proposals.push({
      id: "setup",
      title: "Finish setup",
      subtitle: "Complete profile, model, sync, and device-control wiring.",
      action: "setup",
      cta: "Open"
    });
  }
  if (!providerApiKey.trim()) {
    proposals.push({
      id: "model",
      title: "Add model key",
      subtitle: "Live replies, drafts, memory answers, and research need a provider key.",
      action: "model",
      cta: "Add"
    });
  }
  if (nativePlatform !== "ios" && !deviceBridgeStatus.startsWith("bridge online") && !deviceBridgeStatus.startsWith("device observed")) {
    proposals.push({
      id: "bridge",
      title: "Check Mac device bridge",
      subtitle: "Enables observe, open app, type, hotkeys, clipboard, click, and scroll.",
      action: "bridge",
      cta: "Check"
    });
  }
  if (syncClient && localMemories().length > 0 && !syncStatus.startsWith("Pushed")) {
    proposals.push({
      id: "backup",
      title: "Push brain backup",
      subtitle: `${localMemories().length} local brain item${localMemories().length === 1 ? "" : "s"} can sync to Supabase after sign-in.`,
      action: "backup",
      cta: "Push"
    });
  }
  if (responses.length > 0 || sent.length > 0) {
    proposals.push({
      id: "outbox",
      title: "Review sent-for-you",
      subtitle: `${sent.length + responses.length} agent output${sent.length + responses.length === 1 ? "" : "s"} ready to inspect or recall.`,
      action: "outbox",
      cta: "Review"
    });
  }
  if (people.length > 0) {
    proposals.push({
      id: "reconnect",
      title: `Reconnect with ${people[0]?.title ?? "your network"}`,
      subtitle: "People memories can become ready-to-send drafts.",
      action: "reconnect",
      cta: "Open"
    });
  }

  return proposals.filter((proposal) => !dismissed.has(proposal.id)).slice(0, 5);
}

function dismissedProposalIds(): string[] {
  return readJsonStorage<string[]>(dismissedProposalsKey, []).filter((item): item is string => typeof item === "string");
}

function dismissProposal(id: string): void {
  writeJsonStorage(dismissedProposalsKey, Array.from(new Set([id, ...dismissedProposalIds()])).slice(0, 100));
}

function automationPrefs(): AutomationPrefs {
  return { ...defaultAutomationPrefs, ...readJsonStorage<Partial<AutomationPrefs>>(automationPrefsKey, {}) };
}

function saveAutomationPrefs(prefs: AutomationPrefs): void {
  writeJsonStorage(automationPrefsKey, prefs);
  memoryStore.setSetting("automationPrefs", prefs);
}

function perAppModes(): PerAppMode[] {
  const stored = readJsonStorage<PerAppMode[]>(perAppModesKey, []).filter(isPerAppMode);
  const storedById = new Map(stored.map((item) => [item.id, item]));
  const now = new Date().toISOString();
  const base = defaultPerAppModes.map((item): PerAppMode => {
    const storedItem = storedById.get(item.id);
    return {
      ...item,
      mode: storedItem?.mode ?? "draft",
      updatedAt: storedItem?.updatedAt ?? now
    };
  });
  const personaRows = localMemories()
    .filter((item) => item.tags.includes("persona"))
    .map((item): PerAppMode => {
      const label = item.title.replace(/^Persona:\s*/i, "").trim() || item.source || "Custom";
      const id = `persona:${slugify(label)}`;
      const storedItem = storedById.get(id);
      return {
        id,
        label,
        pkg: item.source,
        glyph: label.slice(0, 2).toUpperCase(),
        mode: storedItem?.mode ?? "draft",
        updatedAt: storedItem?.updatedAt ?? item.updatedAt
      };
    });
  const seen = new Set<string>();
  return [...base, ...personaRows].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function savePerAppMode(id: string, mode: AppResponseMode): void {
  const now = new Date().toISOString();
  const next = perAppModes().map((item) => (item.id === id ? { ...item, mode, updatedAt: now } : item));
  savePerAppModes(next);
  memoryStore.setSetting(`perAppMode:${id}`, mode);
}

function savePerAppModes(modes: PerAppMode[]): void {
  writeJsonStorage(perAppModesKey, modes.filter(isPerAppMode));
}

function isPerAppMode(value: unknown): value is PerAppMode {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.label === "string" &&
    typeof row.pkg === "string" &&
    typeof row.glyph === "string" &&
    (row.mode === "off" || row.mode === "draft" || row.mode === "full") &&
    typeof row.updatedAt === "string"
  );
}

function chatMemories(): MemoryItem[] {
  return localMemories().filter((item) => item.kind === "chat" || item.kind === "message" || item.tags.includes("chat"));
}

function skillMemories(): MemoryItem[] {
  return localMemories().filter((item) => item.tags.includes("skill"));
}

function documentMemories(): MemoryItem[] {
  return localMemories().filter((item) => item.kind === "document" || item.kind === "doc" || item.tags.includes("document"));
}

function investingMemories(): MemoryItem[] {
  return localMemories().filter((item) => item.tags.includes("investing"));
}

function peopleMemories(): MemoryItem[] {
  return localMemories().filter((item) => item.kind === "profile" || item.tags.includes("person"));
}

function vaultRecords(): VaultRecord[] {
  const raw = window.localStorage.getItem("slyos:vaultRecords");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVaultRecord);
  } catch {
    return [];
  }
}

function saveVaultRecords(records: VaultRecord[]): void {
  window.localStorage.setItem("slyos:vaultRecords", JSON.stringify(records));
}

function isVaultRecord(value: unknown): value is VaultRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["id", "label", "ciphertext", "iv", "salt", "updatedAt"].every((key) => typeof record[key] === "string");
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
    case "feature-parity":
      return renderFeatureParity();
    case "mission":
      return renderMission();
    case "network":
      return renderNetwork();
    case "research":
      return renderResearch();
    case "cowork":
      return renderCowork();
    case "chat":
      return renderChat();
    case "operate":
      return renderOperate();
    case "skill":
      return renderSkill();
    case "documents":
      return renderDocuments();
    case "investing":
      return renderInvesting();
    case "vault":
      return renderVault();
    case "backup":
      return renderBackup();
    case "floating-nav":
      return renderFloatingNav();
    case "models":
      return renderModels();
    case "per-app":
      return renderPerApp();
    case "imports":
      return renderImports();
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
      ${agentAnswer ? `<section class="agent-answer"><span>SlyOS</span><p>${escapeHtml(agentAnswer)}</p></section>` : ""}
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
  const proposals = proposalFeed();
  const tasks = taskFeed();
  const memoryCount = localMemories().length;
  const outputCount = outboxRecords().length + agentResponses().length;
  const summary = tasks.length
    ? `SlyOS has ${tasks.length} item${tasks.length === 1 ? "" : "s"} waiting and ${proposals.length} suggestion${proposals.length === 1 ? "" : "s"} ready.`
    : `SlyOS is quiet with ${memoryCount} local memor${memoryCount === 1 ? "y" : "ies"} and ${outputCount} sent-for-you record${outputCount === 1 ? "" : "s"}.`;
  return `
    <div class="panel-screen">
      ${screenHeader("Now")}
      <div class="mini-row">
        <span>${escapeHtml(new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }))}</span>
        <button data-screen="outbox">Sent for you</button>
        <button data-screen="reconnect">Reconnect</button>
      </div>
      ${
        proposals.length
          ? `<div class="section-label">Suggested for you</div>
             <div class="proposal-list">${proposals.map(renderProposal).join("")}</div>`
          : ""
      }
      <section class="brief-card">
        <div class="brief-head">
          <span>What you missed</span>
          <button type="button" data-refresh-now="true">↻</button>
        </div>
        <p>${escapeHtml(summary)}</p>
        <strong>${escapeHtml(nowTextBack(tasks, proposals))}</strong>
      </section>
      <div class="section-label">Waiting on you · ${tasks.length}</div>
      <div class="thread-list">
        ${
          tasks.length
            ? tasks.map(renderNowTask).join("")
            : `<div class="now-empty">
                <p>Nothing waiting right now.</p>
                <small>${escapeHtml(nowEmptyCopy())}</small>
              </div>`
        }
      </div>
    </div>
  `;
}

function renderProposal(proposal: Proposal): string {
  return `
    <article class="proposal-card">
      <div>
        <strong>${escapeHtml(proposal.title)}</strong>
        <span>${escapeHtml(proposal.subtitle)}</span>
      </div>
      <div class="proposal-actions">
        <button class="confirm" type="button" data-proposal-confirm="${escapeAttr(proposal.id)}">${escapeHtml(proposal.cta)} ✓</button>
        <button type="button" data-proposal-dismiss="${escapeAttr(proposal.id)}">Dismiss</button>
      </div>
    </article>
  `;
}

function renderNowTask(task: NowTask): string {
  const isSetupTask = task.source === "setup";
  return `
    <article class="thread-card now-task">
      <div class="avatar-wrap">
        <div class="avatar" style="background:${appColor(task.app, task.pkg)}">${escapeHtml(task.contact[0] ?? "S")}</div>
        <div class="app-badge" style="background:${appColor(task.app, task.pkg)}">${escapeHtml(task.app.slice(0, 1).toUpperCase())}</div>
      </div>
      <div class="thread-body">
        <div class="thread-top">
          <strong>${escapeHtml(task.contact)}</strong>
          <span>${escapeHtml(task.status)}</span>
        </div>
        <p><span>via ${escapeHtml(task.app)}</span></p>
        <blockquote>${escapeHtml(task.text)}</blockquote>
        ${task.draft ? `<div class="inline-draft"><span>draft</span><p>${escapeHtml(task.draft)}</p></div>` : ""}
        <div class="thread-actions">
          ${
            isSetupTask
              ? `<button type="button" data-task-open="${escapeAttr(task.id)}">Open ↗</button>`
              : `<button type="button" data-task-draft="${escapeAttr(task.id)}">${task.draft ? "Regenerate" : "Draft"}</button>
                 <button type="button" data-task-send="${escapeAttr(task.id)}" ${task.draft ? "" : "disabled"}>Send</button>
                 <button type="button" data-task-dismiss="${escapeAttr(task.id)}">Close</button>
                 <button type="button" data-task-open="${escapeAttr(task.id)}">Open ↗</button>`
          }
        </div>
      </div>
    </article>
  `;
}

function renderOutbox(): string {
  const sent = outboxRecords();
  const generated = agentResponses().filter((item) => !item.tags.includes("outbox"));
  return `
    <div class="panel-screen outbox-screen">
      ${screenHeader("Sent for you", "now")}
      <p class="screen-subtitle">Everything the agent did or drafted on your behalf — what, to whom, and why. Recall writes a retraction note into memory.</p>
      <div class="sent-list">
        ${sent.length ? sent.map(renderOutboxRecord).join("") : ""}
        ${generated.length ? generated.slice(0, 12).map(renderSentItem).join("") : ""}
        ${!sent.length && !generated.length ? `<p class="empty-state">No agent outputs yet. Run a prompt from Home.</p>` : ""}
      </div>
    </div>
  `;
}

function renderOutboxRecord(record: OutboxRecord): string {
  return `
    <article class="sent-card ${record.status === "recalled" ? "recalled" : ""}">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(record.target)}</h3>
          <span>${escapeHtml(record.channel)} · ${escapeHtml(new Date(record.createdAt).toLocaleString())}</span>
        </div>
        <b>${escapeHtml(record.status)}</b>
      </div>
      <p>${escapeHtml(record.body)}</p>
      <small>↳ ${escapeHtml(record.why)}</small>
      <div class="outbox-actions">
        ${
          record.status === "recalled"
            ? `<button type="button" data-outbox-delete="${escapeAttr(record.id)}">Delete</button>`
            : `<button type="button" data-outbox-recall="${escapeAttr(record.id)}">Recall</button>
               <button type="button" data-outbox-delete="${escapeAttr(record.id)}">Delete</button>`
        }
      </div>
    </article>
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
      <div class="outbox-actions">
        <button type="button" data-screen="home">Use again</button>
      </div>
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

function blockerScreen(blocker: string): ShellScreen {
  if (blocker.includes("API")) return "models";
  if (blocker.includes("Supabase")) return "backup";
  if (blocker.includes("bridge")) return "setup";
  return "setup";
}

function nowTextBack(tasks: NowTask[], proposals: Proposal[]): string {
  if (tasks.length) return tasks[0]?.source === "setup" ? "Text back: finish setup first." : "Text back: draft is waiting.";
  if (proposals.length) return `Text back: ${proposals[0]?.title.toLowerCase()}.`;
  return "Text back: nobody right now.";
}

function nowEmptyCopy(): string {
  if (nativePlatform === "ios") {
    return "iOS does not expose system notifications to third-party apps; import/share into SlyOS or use Shortcuts handoff.";
  }
  if (nativePlatform === "macos") {
    return "Grant Screen Recording and Accessibility, then use Operate or imports to feed live work into this queue.";
  }
  return "Import messages, documents, or prompt SlyOS to create work for this queue.";
}

function appColor(app: string, pkg = ""): string {
  const key = `${app} ${pkg}`.toLowerCase();
  if (key.includes("whatsapp")) return "#25d366";
  if (key.includes("telegram")) return "#26a5e4";
  if (key.includes("instagram")) return "#c13584";
  if (key.includes("gmail") || key.includes("mail")) return "#ea4335";
  if (key.includes("message") || key.includes("sms")) return "#1a73e8";
  if (key.includes("linkedin")) return "#0a66c2";
  if (key.includes("slack")) return "#4a154b";
  if (key.includes("discord")) return "#5865f2";
  if (key.includes("setup")) return "#e8642c";
  return "#e8642c";
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
    { title: "On-device model", subtitle: "Available per platform when native runtimes are installed", screen: "models" },
    { title: "Appearance" },
    { title: "Investing", screen: "investing" },
    { title: "Banking link", screen: "vault" },
    { title: "Talk to your agent", screen: "voice" },
    { title: "Your writing voice", ...(profileVoice ? { subtitle: profileVoice } : {}), screen: "setup" },
    { title: "Persona per platform", screen: "per-app" },
    { title: "Your uploads", subtitle: `${localMemories().length} local brain item${localMemories().length === 1 ? "" : "s"}`, screen: "documents" },
    { title: "Import & voice", screen: "imports" },
    { title: "Teach a skill", subtitle: `${skillMemories().length} saved`, screen: "skill" },
    { title: "Models & spending", subtitle: `${providerLabel()} · ${modelName}`, screen: "models" },
    { title: "Connections", subtitle: syncStatus, screen: "backup" },
    { title: "Per-app responses", screen: "per-app" },
    { title: "Document Q&A", screen: "documents" },
    { title: "Lock screen" },
    { title: "Floating nav panel", subtitle: deviceBridgeStatus, screen: "floating-nav" },
    { title: "Brain backup", subtitle: syncStatus, glyph: "shield", screen: "backup" }
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

function renderFeatureParity(): string {
  const platform = nativePlatform === "ios" ? "ios" : "macos";
  return `
    <div class="panel-screen parity-screen">
      ${screenHeader("Feature map", "apps")}
      <p class="screen-subtitle">Public SlyOS docs mapped to this build. ${escapeHtml(platformLabel())} status is shown beside Android.</p>
      <div class="feature-list">
        ${docsFeatures.map((feature) => renderFeatureRow(feature, platform)).join("")}
      </div>
    </div>
  `;
}

function renderFeatureRow(feature: FeatureStatus, platform: "ios" | "macos"): string {
  return `
    <button class="feature-row" type="button" data-screen="${feature.screen}">
      <span>
        <strong>${escapeHtml(feature.title)}</strong>
        <small>Android: ${escapeHtml(feature.android)}</small>
      </span>
      <b>${escapeHtml(platform === "ios" ? feature.ios : feature.macos)}</b>
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

function renderChat(): string {
  const chats = chatMemories();
  return `
    <div class="panel-screen chat-screen">
      ${screenHeader("Chat", "apps")}
      <p class="screen-subtitle">Every chat turn writes back into the brain before it appears here.</p>
      <form id="chat-form" class="stack-form">
        <textarea id="chat-input" placeholder="Message your agent..."></textarea>
        <button class="primary-wide orange" type="submit">Send through brain</button>
      </form>
      <div class="section-label">Chats · ${chats.length}</div>
      <div class="sent-list">
        ${
          chats.length
            ? chats.slice(0, 24).map(renderChatItem).join("")
            : `<p class="empty-state">No chats yet. Start one here or from Home.</p>`
        }
      </div>
    </div>
  `;
}

function renderChatItem(item: MemoryItem): string {
  return `
    <article class="sent-card compact-card">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <span>${escapeHtml(item.source)} · ${escapeHtml(new Date(item.createdAt).toLocaleString())}</span>
        </div>
      </div>
      <p>${escapeHtml(item.body)}</p>
    </article>
  `;
}

function renderOperate(): string {
  const plan = operatePrompt ? planPrompt(operatePrompt) : null;
  return `
    <div class="panel-screen operate-screen">
      ${screenHeader("Operate", "apps")}
      <p class="screen-subtitle">${escapeHtml(operateCopy())}</p>
      <form id="operate-form" class="stack-form">
        <textarea id="operate-input" placeholder="Tell SlyOS what to click, open, type, or inspect...">${escapeHtml(operatePrompt)}</textarea>
        <div class="button-pair">
          <button type="submit">Plan loop</button>
          <button type="button" id="operate-observe">Observe</button>
          <button type="button" id="operate-run">Run primitive</button>
        </div>
      </form>
      <section class="brief-card">
        <div class="brief-head">
          <span>Device bridge</span>
          <button type="button" data-screen="setup">Setup</button>
        </div>
        <p>${escapeHtml(operateStatus)}</p>
        <strong>${escapeHtml(deviceBridgeStatus)}</strong>
      </section>
      ${plan ? renderBrainCard(plan) : ""}
      ${
        deviceBridgeObservation
          ? `<section class="agent-answer"><span>latest observation</span><p>${escapeHtml(deviceBridgeObservation)}</p></section>`
          : ""
      }
    </div>
  `;
}

function renderSkill(): string {
  const skills = skillMemories();
  return `
    <div class="panel-screen skill-screen">
      ${screenHeader("Teach a skill", "memory-settings")}
      <form id="skill-form" class="stack-form">
        <input id="skill-name" placeholder="Skill name" />
        <textarea id="skill-steps" placeholder="Steps SlyOS should remember and repeat..."></textarea>
        <button class="primary-wide orange" type="submit">Save skill</button>
      </form>
      <div class="section-label">Skills · ${skills.length}</div>
      <div class="tool-list">
        ${skills.length ? skills.map((skill) => rowTool(skill.title, "operate")).join("") : `<p class="empty-state">No saved skills yet.</p>`}
      </div>
    </div>
  `;
}

function renderDocuments(): string {
  const docs = documentMemories();
  return `
    <div class="panel-screen documents-screen">
      ${screenHeader("Document Q&A", "memory-settings")}
      <form id="document-import-form" class="stack-form">
        <input id="document-files" type="file" multiple />
        <textarea id="document-note" placeholder="Optional note for the brain..."></textarea>
        <button class="primary-wide orange" type="submit">Import documents</button>
      </form>
      <div class="section-label">Documents · ${docs.length}</div>
      <div class="tool-list">
        ${docs.length ? docs.slice(0, 30).map((doc) => rowTool(doc.title, "memory")).join("") : `<p class="empty-state">No documents imported yet.</p>`}
      </div>
    </div>
  `;
}

function renderInvesting(): string {
  const items = investingMemories();
  return `
    <div class="panel-screen investing-screen">
      ${screenHeader("Investing", "memory-settings")}
      <form id="investing-form" class="stack-form">
        <div class="sync-grid">
          <input id="holding-symbol" placeholder="Ticker or asset" />
          <input id="holding-note" placeholder="Position, thesis, risk, or question" />
        </div>
        <button class="primary-wide orange" type="submit">Save to brain</button>
      </form>
      <div class="section-label">Portfolio brain · ${items.length}</div>
      <div class="sent-list">
        ${items.length ? items.map(renderChatItem).join("") : `<p class="empty-state">No investing memory yet.</p>`}
      </div>
    </div>
  `;
}

function renderVault(): string {
  const records = vaultRecords();
  return `
    <div class="panel-screen vault-screen">
      ${screenHeader("Bank vault", "memory-settings")}
      <p class="screen-subtitle">Secrets are encrypted in this browser before they touch storage. The brain only receives a locked pointer.</p>
      <form id="vault-form" class="stack-form">
        <input id="vault-passphrase" type="password" placeholder="Vault password" />
        <input id="vault-label" placeholder="Label, e.g. bank login" />
        <textarea id="vault-secret" placeholder="Secret to encrypt locally..."></textarea>
        <button class="primary-wide orange" type="submit">Encrypt and save</button>
      </form>
      <div class="caption-line">${escapeHtml(vaultStatus)}</div>
      ${revealedVault ? `<section class="agent-answer"><span>${escapeHtml(revealedVault.label)}</span><p>${escapeHtml(revealedVault.text)}</p></section>` : ""}
      <div class="section-label">Vault items · ${records.length}</div>
      <div class="tool-list">
        ${
          records.length
            ? records.map((record) => `<button class="tool-row" type="button" data-vault-reveal="${escapeAttr(record.id)}"><span>${escapeHtml(record.label)}</span></button>`).join("")
            : `<p class="empty-state">No encrypted vault items yet.</p>`
        }
      </div>
    </div>
  `;
}

function renderBackup(): string {
  return `
    <div class="panel-screen backup-screen">
      ${screenHeader("Brain backup", "memory-settings")}
      <section class="brief-card">
        <div class="brief-head">
          <span>Account</span>
          <button type="button" data-screen="setup">Login</button>
        </div>
        <p>${escapeHtml(syncStatus)}</p>
        <strong>${localMemories().length} brain item${localMemories().length === 1 ? "" : "s"}</strong>
      </section>
      <div class="button-pair">
        <button id="backup-pull" type="button">Pull brain</button>
        <button id="backup-push" type="button">Push brain</button>
      </div>
      <div class="tool-list backup-list">
        ${["profiles", "brain_items", "vault_items", "vault_meta", "devices", "action_log"].map((table) => rowTool(table)).join("")}
      </div>
    </div>
  `;
}

function renderFloatingNav(): string {
  return `
    <div class="panel-screen floating-nav-screen">
      ${screenHeader("Floating nav panel", "memory-settings")}
      <section class="brief-card">
        <div class="brief-head">
          <span>${escapeHtml(platformLabel())}</span>
          <button type="button" data-screen="operate">Operate</button>
        </div>
        <p>${escapeHtml(floatingNavCopy())}</p>
        <strong>${escapeHtml(deviceBridgeStatus)}</strong>
      </section>
      <div class="tool-list">
        ${["Home prompt", "Read this screen", "Pause agent", "Open brain", "Observe device"].map((tool) => rowTool(tool, tool === "Observe device" ? "operate" : "home")).join("")}
      </div>
    </div>
  `;
}

function renderModels(): string {
  return `
    <div class="panel-screen models-screen">
      ${screenHeader("Models & spending", "memory-settings")}
      <section class="setup-block model-inline">
        <h3>${escapeHtml(providerLabel())}</h3>
        <p>${escapeHtml(providerStatus)}</p>
        <div class="chip-row provider-row">
          ${providerOptions
            .map(
              (option) =>
                `<button class="${option.id === selectedProvider ? "active" : ""}" data-provider="${option.id}" type="button">${escapeHtml(option.label)}</button>`
            )
            .join("")}
        </div>
        <div class="sync-grid">
          <input id="provider-model" value="${escapeAttr(modelName)}" placeholder="${escapeAttr(defaultModelFor(selectedProvider))}" />
          <input id="provider-key" type="password" value="${escapeAttr(providerApiKey)}" placeholder="API key" />
        </div>
        <div class="button-pair">
          <button id="provider-save" type="button">Save model</button>
          <button id="provider-test" type="button">Test model</button>
        </div>
      </section>
      <div class="tool-list">
        ${["Cloud key routing", "On-device model slot", "Daily cost notes", "Brain context reuse"].map((tool) => rowTool(tool)).join("")}
      </div>
    </div>
  `;
}

function renderPerApp(): string {
  const personas = localMemories().filter((item) => item.tags.includes("persona"));
  const modes = perAppModes();
  const prefs = automationPrefs();
  return `
    <div class="panel-screen per-app-screen">
      ${screenHeader("Per-app responses", "memory-settings")}
      <p class="screen-subtitle">Pick how each app behaves. Draft pre-writes and waits on Now; Auto records the intent but still obeys platform safety limits.</p>
      <div class="app-mode-list">
        ${modes.map(renderPerAppMode).join("")}
      </div>
      <section class="brief-card automation-card">
        <div class="brief-head">
          <span>Automation</span>
          <button type="button" data-screen="now">Now</button>
        </div>
        <div class="pref-list">
          ${renderPrefToggle("reconnectWeekly", "Weekly reconnect nudge", "People you have gone quiet on surface with a ready draft.", prefs.reconnectWeekly)}
          ${renderPrefToggle("spicyDaily", "Daily spicy take", "A morning draft can be staged in Sent for you.", prefs.spicyDaily)}
          ${renderPrefToggle("totalRecall", "Total recall", "Save observed screens and manual actions into memory.", prefs.totalRecall)}
          ${renderPrefToggle("lockScreenBrief", "Lock-screen brief", "Show top priorities on the SlyOS lock surface.", prefs.lockScreenBrief)}
          ${renderPrefToggle("floatingNav", "Floating nav panel", floatingNavCopy(), prefs.floatingNav)}
        </div>
      </section>
      <form id="persona-form" class="stack-form">
        <input id="persona-app" placeholder="App or person" />
        <textarea id="persona-style" placeholder="How SlyOS should sound there..."></textarea>
        <button class="primary-wide orange" type="submit">Save persona</button>
      </form>
      <div class="section-label">Personas · ${personas.length}</div>
      <div class="tool-list">
        ${personas.length ? personas.map((persona) => rowTool(persona.title, "memory")).join("") : `<p class="empty-state">No per-app persona saved yet.</p>`}
      </div>
    </div>
  `;
}

function renderPerAppMode(item: PerAppMode): string {
  const modes: Array<{ id: AppResponseMode; label: string }> = [
    { id: "off", label: "Off" },
    { id: "draft", label: "Draft" },
    { id: "full", label: "Auto" }
  ];
  return `
    <article class="app-mode-row">
      <div class="app-mode-icon">${escapeHtml(item.glyph)}</div>
      <div class="app-mode-copy">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(perAppModeCopy(item.mode))}</span>
      </div>
      <div class="mode-toggle" role="group" aria-label="${escapeAttr(item.label)} response mode">
        ${modes
          .map(
            (mode) =>
              `<button class="${item.mode === mode.id ? "active" : ""}" type="button" data-app-mode="${mode.id}" data-app-id="${escapeAttr(item.id)}">${escapeHtml(mode.label)}</button>`
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderPrefToggle(key: keyof AutomationPrefs, title: string, subtitle: string, active: boolean): string {
  return `
    <button class="pref-row ${active ? "active" : ""}" type="button" data-pref-toggle="${key}">
      <span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(subtitle)}</small>
      </span>
      <b>${active ? "On" : "Off"}</b>
    </button>
  `;
}

function perAppModeCopy(mode: AppResponseMode): string {
  if (mode === "off") return "Never reply here automatically.";
  if (mode === "full") return "Auto mode after confirmation-safe routing.";
  return "Draft and wait for your tap.";
}

function renderImports(): string {
  return `
    <div class="panel-screen imports-screen">
      ${screenHeader("Import & voice", "memory-settings")}
      <form id="history-import-form" class="stack-form">
        <input id="history-files" type="file" multiple accept=".txt,.csv,.json,.md,.html,.zip" />
        <textarea id="history-note" placeholder="Source or context, e.g. WhatsApp export with Daria..."></textarea>
        <button class="primary-wide orange" type="submit">Import history</button>
      </form>
      <div class="tool-list">
        ${["WhatsApp export", "LinkedIn archive", "Instagram export", "Telegram export", "Messenger export"].map((tool) => rowTool(tool)).join("")}
      </div>
    </div>
  `;
}

function operateCopy(): string {
  if (nativePlatform === "ios") {
    return "iPhone can plan through the brain, import/share into SlyOS, and hand tasks to Shortcuts; Apple blocks arbitrary whole-device click-through.";
  }
  return "Mac uses the localhost bridge for observe, app open, typing, clipboard, keys, and pointer primitives.";
}

function floatingNavCopy(): string {
  if (nativePlatform === "macos") return "The SlyOS nav is fixed over the bottom of the full-window shell.";
  if (nativePlatform === "ios") return "The SlyOS nav stays inside the app shell; system-wide overlays are blocked by iOS.";
  return "The shared shell keeps the SlyOS nav in the same five-tab layout.";
}

function platformLabel(): string {
  if (nativePlatform === "macos") return "macOS";
  if (nativePlatform === "ios") return "iPhone";
  return "Web";
}

function renderApps(): string {
  const apps: Array<{ label: string; screen: ShellScreen }> = [
    { label: "Setup", screen: "setup" },
    { label: "Memory", screen: "memory" },
    { label: "Now", screen: "now" },
    { label: "Chat", screen: "chat" },
    { label: "Operate device", screen: "operate" },
    { label: "Research", screen: "research" },
    { label: "Cowork", screen: "cowork" },
    { label: "Mission", screen: "mission" },
    { label: "My network", screen: "network" },
    { label: "Look", screen: "look" },
    { label: "Expenses", screen: "expenses" },
    { label: "Documents", screen: "documents" },
    { label: "Import history", screen: "imports" },
    { label: "Teach a skill", screen: "skill" },
    { label: "Investing", screen: "investing" },
    { label: "Bank vault", screen: "vault" },
    { label: "Brain backup", screen: "backup" },
    { label: "Models", screen: "models" },
    { label: "Feature map", screen: "feature-parity" },
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

  document.querySelector("[data-refresh-now]")?.addEventListener("click", () => {
    deviceBridgeObservation = taskFeed().length ? "Now refreshed from local brain, setup state, outbox, and bridge status." : "";
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-proposal-confirm]").forEach((element) => {
    element.addEventListener("click", () => {
      void confirmProposal(element.dataset.proposalConfirm ?? "");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-proposal-dismiss]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = element.dataset.proposalDismiss;
      if (!id) return;
      dismissProposal(id);
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-task-draft]").forEach((element) => {
    element.addEventListener("click", () => {
      void draftTask(element.dataset.taskDraft ?? "");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-task-send]").forEach((element) => {
    element.addEventListener("click", () => {
      sendTask(element.dataset.taskSend ?? "");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-task-dismiss]").forEach((element) => {
    element.addEventListener("click", () => {
      closeTask(element.dataset.taskDismiss ?? "");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-task-open]").forEach((element) => {
    element.addEventListener("click", () => {
      openTask(element.dataset.taskOpen ?? "");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-outbox-recall]").forEach((element) => {
    element.addEventListener("click", () => {
      recallOutbox(element.dataset.outboxRecall ?? "");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-outbox-delete]").forEach((element) => {
    element.addEventListener("click", () => {
      deleteOutbox(element.dataset.outboxDelete ?? "");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-app-mode]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = element.dataset.appId ?? "";
      const mode = element.dataset.appMode as AppResponseMode | undefined;
      if (!id || !mode) return;
      savePerAppMode(id, mode);
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-pref-toggle]").forEach((element) => {
    element.addEventListener("click", () => {
      const key = element.dataset.prefToggle as keyof AutomationPrefs | undefined;
      if (!key) return;
      const prefs = automationPrefs();
      prefs[key] = !prefs[key];
      saveAutomationPrefs(prefs);
      render();
    });
  });

  document.querySelector("#prompt-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void runPrompt();
  });

  document.querySelector("#chat-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void runChat();
  });

  document.querySelector("#operate-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    planOperatePrompt();
  });

  document.querySelector("#operate-observe")?.addEventListener("click", () => {
    void observeDeviceFromPrompt();
  });

  document.querySelector("#operate-run")?.addEventListener("click", () => {
    void runOperatePrimitive();
  });

  document.querySelector("#skill-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSkill();
  });

  document.querySelector("#document-import-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void importDocumentFiles("document");
  });

  document.querySelector("#history-import-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void importDocumentFiles("history");
  });

  document.querySelector("#investing-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveInvestingMemory();
  });

  document.querySelector("#vault-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveVaultItem();
  });

  document.querySelectorAll<HTMLElement>("[data-vault-reveal]").forEach((element) => {
    element.addEventListener("click", () => {
      void revealVaultItem(element.dataset.vaultReveal ?? "");
    });
  });

  document.querySelector("#backup-pull")?.addEventListener("click", () => {
    void syncAction(async () => {
      if (!syncClient) throw new Error("Configure sync first.");
      const remote = await syncClient.pullMemory();
      for (const item of remote) memoryStore.upsert(item);
      const settings = await syncClient.pullSettings();
      for (const item of settings) memoryStore.setSetting(item.key, item.value);
      syncStatus = `Pulled ${remote.length} brain item(s) and ${settings.length} setting(s).`;
    });
  });

  document.querySelector("#backup-push")?.addEventListener("click", () => {
    void syncAction(async () => {
      if (!syncClient) throw new Error("Configure sync first.");
      await syncClient.pushMemory(memoryStore.list());
      await syncClient.pushSettings(memoryStore.listSettings());
      syncStatus = "Pushed local brain.";
    });
  });

  document.querySelector("#persona-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    savePersona();
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
      await checkDeviceBridge();
    });
  });

  document.querySelector("#device-observe")?.addEventListener("click", () => {
    void observeDeviceFromPrompt();
  });
}

async function confirmProposal(id: string): Promise<void> {
  const proposal = proposalFeed().find((item) => item.id === id);
  if (!proposal) return;
  recordOutbox({
    title: proposal.title,
    target: proposal.title,
    channel: platformLabel(),
    body: proposal.subtitle,
    why: "you confirmed a Now suggestion generated from local brain/setup state",
    status: "done"
  });
  dismissProposal(id);

  if (proposal.action === "setup") {
    navigate("setup");
    return;
  }
  if (proposal.action === "model") {
    navigate("models");
    return;
  }
  if (proposal.action === "outbox") {
    navigate("outbox");
    return;
  }
  if (proposal.action === "reconnect") {
    navigate("reconnect");
    return;
  }
  if (proposal.action === "memory") {
    navigate("memory");
    return;
  }
  if (proposal.action === "bridge") {
    await deviceAction(checkDeviceBridge);
    navigate("setup");
    return;
  }
  if (proposal.action === "backup") {
    await syncAction(async () => {
      if (!syncClient) throw new Error("Configure sync first.");
      await syncClient.pushMemory(memoryStore.list());
      await syncClient.pushSettings(memoryStore.listSettings());
      syncStatus = "Pushed local brain.";
    });
    navigate("backup");
  }
}

async function draftTask(id: string): Promise<void> {
  const task = nowTasks().find((item) => item.id === id);
  if (!task) return;
  const draft = await buildTaskDraft(task);
  const next = nowTasks().map((item) =>
    item.id === id ? { ...item, draft, status: "drafted" as const, updatedAt: new Date().toISOString() } : item
  );
  saveNowTasks(next);
  memoryStore.add({
    kind: "message",
    title: `Draft for ${task.contact}`,
    body: draft,
    tags: ["draft", "now", "brain"],
    source: task.app
  });
  render();
}

async function buildTaskDraft(task: NowTask): Promise<string> {
  const localDraft = `Hey ${firstName(task.contact)}, saw this. ${task.text.slice(0, 110)}`;
  if (!providerApiKey.trim()) return localDraft;
  try {
    return await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      prompt: `Draft a short reply in my voice. Do not send it.\n\nContact: ${task.contact}\nApp: ${task.app}\nMessage/context: ${task.text}`,
      memoryContext: buildMemoryContext()
    });
  } catch {
    return localDraft;
  }
}

async function stageOutboundRequest(prompt: string): Promise<NowTask> {
  const parsed = parseOutboundPrompt(prompt);
  const now = new Date().toISOString();
  const task: NowTask = {
    id: localId("task"),
    contact: parsed.contact,
    app: parsed.app,
    text: parsed.context,
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    source: "home"
  };
  const draft = await buildTaskDraft(task);
  const staged: NowTask = { ...task, draft, status: "drafted", updatedAt: new Date().toISOString() };
  saveNowTasks([staged, ...nowTasks()]);
  recordOutbox({
    title: `Draft for ${staged.contact}`,
    target: staged.contact,
    channel: staged.app,
    body: draft,
    why: "drafted from a Home prompt and held for your confirmation in Now",
    status: "draft"
  });
  return staged;
}

function isOutboundRequest(prompt: string): boolean {
  return /\b(send|text|dm|message|email|reply)\b/i.test(prompt);
}

function parseOutboundPrompt(prompt: string): { app: string; contact: string; context: string } {
  const app = /\bemail\b/i.test(prompt) ? "Mail" : /\bdm\b/i.test(prompt) ? "X" : "Messages";
  const direct = prompt.match(
    /\b(?:text|message|dm|email|reply to|send(?: an)? email to)\s+(.+?)(?:\s+(?:that|saying|about|and)\s+|:\s*|$)(.*)$/i
  );
  const toTarget = prompt.match(/\bto\s+(.+?)(?:\s+(?:that|saying|about|and)\s+|:\s*|$)(.*)$/i);
  const match = direct ?? toTarget;
  const contact = cleanOutboundContact(match?.[1] ?? "Someone");
  const context = (match?.[2] ?? "").trim();
  return { app, contact, context: context || prompt };
}

function cleanOutboundContact(value: string): string {
  return value
    .replace(/^(?:to|at)\s+/i, "")
    .replace(/[.,;:!?]+$/g, "")
    .trim()
    .slice(0, 60) || "Someone";
}

function sendTask(id: string): void {
  const task = nowTasks().find((item) => item.id === id);
  if (!task || !task.draft) return;
  recordOutbox({
    title: `Reply to ${task.contact}`,
    target: task.contact,
    channel: task.app,
    body: task.draft,
    why: "drafted from your brain/persona and sent from the Now queue",
    status: "sent"
  });
  saveNowTasks(nowTasks().map((item) => (item.id === id ? { ...item, status: "sent", updatedAt: new Date().toISOString() } : item)));
  render();
}

function closeTask(id: string): void {
  saveNowTasks(nowTasks().map((item) => (item.id === id ? { ...item, status: "closed", updatedAt: new Date().toISOString() } : item)));
  render();
}

function openTask(id: string): void {
  const task = taskFeed().find((item) => item.id === id);
  if (!task) return;
  if (task.screen) {
    navigate(task.screen);
    return;
  }
  operatePrompt = `Open ${task.app} for ${task.contact}`;
  navigate("operate");
}

function recallOutbox(id: string): void {
  const records = outboxRecords();
  const now = new Date().toISOString();
  const record = records.find((item) => item.id === id);
  if (!record) return;
  const next = records.map((item) =>
    item.id === id ? { ...item, status: "recalled" as const, recalledAt: now, updatedAt: now } : item
  );
  saveOutboxRecords(next);
  memoryStore.add({
    kind: "message",
    title: `Recall: ${record.title}`,
    body: `Recall/retraction for ${record.target}: ${record.body}`,
    tags: ["recall", "outbox", "brain"],
    source: record.channel
  });
  render();
}

function deleteOutbox(id: string): void {
  saveOutboxRecords(outboxRecords().filter((item) => item.id !== id));
  render();
}

async function checkDeviceBridge(): Promise<void> {
  saveDeviceBridgeSettings();
  const payload = await deviceFetch("/capabilities");
  const enabled = Boolean(payload.capabilities?.deviceControl?.enabled);
  const click = Boolean(payload.capabilities?.deviceControl?.pointerClick);
  const type = Boolean(payload.capabilities?.deviceControl?.typeText);
  const hotkey = Boolean(payload.capabilities?.deviceControl?.hotkey);
  deviceBridgeStatus = `bridge online · control ${enabled ? "on" : "off"} · click ${click ? "yes" : "no"} · type ${type ? "yes" : "no"} · keys ${hotkey ? "yes" : "no"}`;
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

async function runChat(): Promise<void> {
  const input = document.querySelector<HTMLTextAreaElement>("#chat-input");
  const text = input?.value.trim() ?? "";
  if (!text) return;

  memoryStore.add({
    kind: "chat",
    title: `You: ${text.slice(0, 56)}`,
    body: text,
    tags: ["chat", "brain"],
    source: "chat"
  });

  if (!providerApiKey.trim()) {
    agentAnswer = "Setup needs a model key before SlyOS can answer live.";
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
      prompt: text,
      memoryContext: buildMemoryContext()
    });
    memoryStore.add({
      kind: "chat",
      title: `SlyOS: ${text.slice(0, 56)}`,
      body: answer,
      tags: ["chat", "agent-response", "brain"],
      source: providerLabel()
    });
  } catch (error) {
    memoryStore.add({
      kind: "chat",
      title: "SlyOS chat error",
      body: error instanceof Error ? error.message : String(error),
      tags: ["chat", "error"],
      source: providerLabel()
    });
  } finally {
    agentBusy = false;
    render();
  }
}

function planOperatePrompt(): void {
  const input = document.querySelector<HTMLTextAreaElement>("#operate-input");
  operatePrompt = input?.value.trim() ?? "";
  if (!operatePrompt) return;
  lastPlan = planPrompt(operatePrompt);
  operateStatus = "planned through the brain";
  memoryStore.add({
    kind: "screen",
    title: `Operate: ${operatePrompt.slice(0, 60)}`,
    body: `Planned device loop: ${lastPlan.summary}`,
    tags: ["operate", "screen", "brain"],
    source: platformLabel()
  });
  render();
}

async function runOperatePrimitive(): Promise<void> {
  const input = document.querySelector<HTMLTextAreaElement>("#operate-input");
  operatePrompt = input?.value.trim() || operatePrompt;
  if (!operatePrompt) {
    operateStatus = "write a device task first";
    render();
    return;
  }

  if (nativePlatform === "ios") {
    operateStatus = "iOS cannot run whole-device click-through; use Shortcuts/App Intents handoff for the primitive.";
    memoryStore.add({
      kind: "screen",
      title: `iOS operate handoff: ${operatePrompt.slice(0, 50)}`,
      body: operateStatus,
      tags: ["operate", "ios", "handoff"],
      source: "iPhone"
    });
    render();
    return;
  }

  await deviceAction(async () => {
    const sequence = primitiveSequenceForPrompt(operatePrompt);
    await executeDeviceSequence(operatePrompt, sequence, "operate");
    operateStatus = `ran ${sequence.length} step${sequence.length === 1 ? "" : "s"}`;
  });
}

async function executeDevicePrimitive(prompt: string, primitive: DevicePrimitive, source: "home" | "operate"): Promise<string> {
  return executeDeviceSequence(prompt, [primitive], source);
}

async function executeDeviceSequence(prompt: string, sequence: DeviceSequence, source: "home" | "operate"): Promise<string> {
  saveDeviceBridgeSettings();
  const trace: string[] = [];
  const first = sequence[0];
  const observeBefore = first && first.type !== "open_url" && first.type !== "open_app";

  if (observeBefore) {
    const before = await optionalDeviceObserve();
    if (before) trace.push(describeDevicePayload(before));
  }

  for (const [index, primitive] of sequence.entries()) {
    const result = await deviceFetch("/actions", {
      method: "POST",
      body: JSON.stringify(primitive)
    });
    trace.push(`${index + 1}/${sequence.length} ${describeDevicePayload(result)}`);
    if (primitive.type !== "wait") {
      await deviceFetch("/actions", {
        method: "POST",
        body: JSON.stringify({ type: "wait", ms: primitive.type === "open_url" || primitive.type === "open_app" ? 900 : 320 })
      }).catch(() => undefined);
    }
  }

  const after = await optionalDeviceObserve();
  if (after) trace.push(describeDevicePayload(after));

  deviceBridgeObservation = trace.filter(Boolean).join(" -> ");
  deviceBridgeStatus = `ran ${sequence.length} step${sequence.length === 1 ? "" : "s"}`;
  const title = sequence.length === 1 ? `Ran ${sequence[0]?.type ?? "action"}` : `Ran ${sequence.length}-step loop`;
  memoryStore.add({
    kind: "screen",
    title: `${title}: ${prompt.slice(0, 54)}`,
    body: `${prompt}\n${deviceBridgeObservation}`,
    tags: [source, "operate", "screen", "brain"],
    source: platformLabel()
  });
  recordOutbox({
    title,
    target: platformLabel(),
    channel: source === "home" ? "Home prompt" : "Operate",
    body: prompt,
    why: `executed through the local device bridge after brain planning: ${sequence.map((item) => item.type).join(" -> ")}`,
    status: "done"
  });
  return deviceBridgeObservation;
}

async function optionalDeviceObserve(): Promise<Record<string, any> | null> {
  try {
    return await deviceFetch("/actions", {
      method: "POST",
      body: JSON.stringify({ type: "observe_screen" })
    });
  } catch (error) {
    return {
      result: {
        observationError: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function primitiveActionForPrompt(prompt: string): DevicePrimitive {
  return primitiveSequenceForPrompt(prompt)[0] ?? { type: "observe_screen" };
}

function primitiveSequenceForPrompt(prompt: string): DeviceSequence {
  const lower = prompt.toLowerCase();
  const url = prompt.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  if (url) return [{ type: "open_url", url }];

  const webUrl = urlForPrompt(prompt);
  if (webUrl) return [{ type: "open_url", url: webUrl }];

  const sequence: DeviceSequence = [];
  const app = prompt.match(/\bopen\s+([a-z][a-z ]{1,32})(?:$|\.|,| and |\s+then)/i)?.[1]?.trim();
  if (app) {
    sequence.push({ type: "open_app", app: normalizeAppName(app) }, { type: "wait", ms: 700 });
  }

  const clipboardText = prompt.match(/\b(?:copy|set clipboard(?: to)?)\s+["“](.+?)["”]/i)?.[1];
  if (clipboardText) sequence.push({ type: "set_clipboard", text: clipboardText });

  if (/\b(command|cmd)\s*\+\s*l\b/i.test(prompt)) sequence.push({ type: "hotkey", keys: ["cmd", "l"] });

  const quotedTextMatches = Array.from(prompt.matchAll(/\btype\s+["“](.+?)["”]/gi));
  for (const match of quotedTextMatches) {
    if (match[1]) sequence.push({ type: "type_text", text: match[1] });
  }

  if (/\b(press|hit)\s+(enter|return)\b/i.test(prompt)) sequence.push({ type: "key_press", key: "return", modifiers: [] });

  const coordinates = Array.from(lower.matchAll(/\b(?:click|tap)\D+(\d{2,4})\D+(\d{2,4})\b/g));
  for (const coordinate of coordinates) {
    sequence.push({
      type: "pointer_click",
      x: Number(coordinate[1]),
      y: Number(coordinate[2]),
      button: "left",
      clicks: 1
    });
  }

  if (/\bscroll\s+up\b/.test(lower)) sequence.push({ type: "scroll", deltaY: -520 });
  else if (/\bscroll\b/.test(lower)) sequence.push({ type: "scroll", deltaY: 520 });

  const usefulSequence = sequence.filter((primitive, index) => primitive.type !== "wait" || index < sequence.length - 1);
  if (usefulSequence.some((primitive) => primitive.type !== "wait")) return usefulSequence;

  return [{ type: "observe_screen" }];
}

function urlForPrompt(prompt: string): string | null {
  const lower = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  const bareDomain = prompt.match(/\b(?:open|go to|visit|launch|show)\s+([a-z0-9-]+\.[a-z]{2,}(?:\/[^\s"'<>]*)?)/i)?.[1];
  if (bareDomain) return `https://${bareDomain.replace(/^https?:\/\//i, "")}`;

  const openGoogleSearch = prompt.match(/\b(?:open|go to|visit|launch|show)\s+google\s+(?:and\s+)?search(?:\s+for)?\s+(.+)/i)?.[1]?.trim();
  if (openGoogleSearch) return `https://www.google.com/search?q=${encodeURIComponent(openGoogleSearch)}`;

  const search = prompt.match(/\b(?:google|search(?: google)?(?: for)?)\s+(.+)/i)?.[1]?.trim();
  if (search && !/^(google|search)$/i.test(search)) {
    return `https://www.google.com/search?q=${encodeURIComponent(search)}`;
  }

  const aliases: Record<string, string> = {
    google: "https://www.google.com",
    gmail: "https://mail.google.com",
    youtube: "https://www.youtube.com",
    maps: "https://maps.google.com",
    "google maps": "https://maps.google.com",
    calendar: "https://calendar.google.com",
    docs: "https://docs.google.com",
    drive: "https://drive.google.com",
    github: "https://github.com",
    x: "https://x.com",
    twitter: "https://x.com",
    linkedin: "https://www.linkedin.com",
    supabase: "https://supabase.com/dashboard",
    chatgpt: "https://chatgpt.com"
  };

  for (const [name, url] of Object.entries(aliases).sort((a, b) => b[0].length - a[0].length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(?:open|go to|visit|launch|show)\\s+${escaped}(?:$|[.,!?])`).test(lower)) return url;
  }

  return null;
}

function shouldAutoRunDeviceAction(prompt: string, sequence: DeviceSequence): boolean {
  if (nativePlatform === "ios") return false;
  if (sequence.some((primitive) => primitive.type !== "observe_screen" && primitive.type !== "wait")) return true;
  return /\b(observe|look|read|screen|frontmost|what.*open)\b/i.test(prompt);
}

function normalizeAppName(app: string): string {
  const key = app.toLowerCase().replace(/\s+/g, " ").trim();
  const names: Record<string, string> = {
    chrome: "Google Chrome",
    "google chrome": "Google Chrome",
    safari: "Safari",
    xcode: "Xcode",
    notes: "Notes",
    finder: "Finder",
    mail: "Mail",
    calendar: "Calendar",
    messages: "Messages",
    terminal: "Terminal",
    settings: "System Settings",
    "system settings": "System Settings"
  };
  return names[key] ?? app;
}

function describeDevicePayload(payload: Record<string, any>): string {
  const result = payload.result ?? payload;
  if (result.observationError) return `observe blocked: ${String(result.observationError)}`;
  if (result.opened) return `opened ${String(result.opened)}`;
  if (result.typed) return `typed ${String(result.typed)} chars`;
  if (result.clicked) return `clicked ${JSON.stringify(result.clicked)}`;
  const app = result.frontmostApp?.app ? `front ${result.frontmostApp.app}` : "";
  const shot = result.screenshot?.path ? `shot ${result.screenshot.path}` : "";
  return [app, shot].filter(Boolean).join(" · ") || JSON.stringify(result).slice(0, 180);
}

function saveSkill(): void {
  const name = document.querySelector<HTMLInputElement>("#skill-name")?.value.trim() ?? "";
  const steps = document.querySelector<HTMLTextAreaElement>("#skill-steps")?.value.trim() ?? "";
  if (!name || !steps) return;
  memoryStore.add({
    kind: "memory",
    title: `Skill: ${name}`,
    body: steps,
    tags: ["skill", "operate", "brain"],
    source: platformLabel()
  });
  render();
}

async function importDocumentFiles(mode: "document" | "history"): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(mode === "document" ? "#document-files" : "#history-files");
  const note = document.querySelector<HTMLTextAreaElement>(mode === "document" ? "#document-note" : "#history-note")?.value.trim() ?? "";
  const files = Array.from(input?.files ?? []);
  if (!files.length && !note) return;

  for (const file of files) {
    const text = await readFileForBrain(file);
    memoryStore.add({
      kind: mode === "document" ? "document" : "chat",
      title: file.name,
      body: [note, text || `Imported file metadata: ${file.type || "unknown type"} · ${file.size} bytes`].filter(Boolean).join("\n\n"),
      tags: mode === "document" ? ["document", "import", "brain"] : ["chat", "import", "history", "brain"],
      source: mode === "document" ? "document import" : "history import"
    });
  }

  if (!files.length && note) {
    memoryStore.add({
      kind: mode === "document" ? "document" : "chat",
      title: mode === "document" ? "Document note" : "History note",
      body: note,
      tags: mode === "document" ? ["document", "brain"] : ["chat", "history", "brain"],
      source: mode === "document" ? "document import" : "history import"
    });
  }
  render();
}

async function readFileForBrain(file: File): Promise<string> {
  const readable =
    file.type.startsWith("text/") ||
    /(\.txt|\.csv|\.json|\.md|\.html|\.xml)$/i.test(file.name);
  if (!readable) return "";
  return (await file.text()).slice(0, 80000);
}

function saveInvestingMemory(): void {
  const symbol = document.querySelector<HTMLInputElement>("#holding-symbol")?.value.trim() ?? "";
  const note = document.querySelector<HTMLInputElement>("#holding-note")?.value.trim() ?? "";
  if (!symbol && !note) return;
  memoryStore.add({
    kind: "memory",
    title: symbol ? `Investment: ${symbol.toUpperCase()}` : "Investment note",
    body: note || symbol,
    tags: ["investing", "brain"],
    source: "investing"
  });
  render();
}

function savePersona(): void {
  const app = document.querySelector<HTMLInputElement>("#persona-app")?.value.trim() ?? "";
  const style = document.querySelector<HTMLTextAreaElement>("#persona-style")?.value.trim() ?? "";
  if (!app || !style) return;
  memoryStore.add({
    kind: "profile",
    title: `Persona: ${app}`,
    body: style,
    tags: ["persona", "profile", "brain"],
    source: app
  });
  render();
}

async function saveVaultItem(): Promise<void> {
  const passphrase = document.querySelector<HTMLInputElement>("#vault-passphrase")?.value ?? "";
  const label = document.querySelector<HTMLInputElement>("#vault-label")?.value.trim() ?? "";
  const secret = document.querySelector<HTMLTextAreaElement>("#vault-secret")?.value ?? "";
  if (!passphrase || !label || !secret) {
    vaultStatus = "vault password, label, and secret are required";
    render();
    return;
  }
  try {
    const encrypted = await encryptText(secret, passphrase);
    const record: VaultRecord = {
      id: localId("vault"),
      label,
      ...encrypted,
      updatedAt: new Date().toISOString()
    };
    saveVaultRecords([record, ...vaultRecords()]);
    memoryStore.add({
      kind: "vault",
      title: `Vault: ${label}`,
      body: "Vault item saved - locked.",
      tags: ["vault", "brain"],
      source: "vault"
    });
    revealedVault = null;
    vaultStatus = "encrypted and saved locally";
  } catch (error) {
    vaultStatus = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function revealVaultItem(id: string): Promise<void> {
  const passphrase = document.querySelector<HTMLInputElement>("#vault-passphrase")?.value ?? "";
  const record = vaultRecords().find((candidate) => candidate.id === id);
  if (!record || !passphrase) {
    vaultStatus = "enter the vault password first";
    render();
    return;
  }
  try {
    const text = await decryptText(record, passphrase);
    revealedVault = { label: record.label, text };
    vaultStatus = "unlocked on this device";
  } catch {
    vaultStatus = "unlock failed";
    revealedVault = null;
  }
  render();
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

  const plan = planPrompt(request);
  const sequence = primitiveSequenceForPrompt(request);
  lastPlan = null;
  agentAnswer = "";
  memoryStore.add({
    kind: "message",
    title: `Prompt: ${request.slice(0, 64)}`,
    body: `Brain planned ${plan.actions.length} step${plan.actions.length === 1 ? "" : "s"} for: ${request}`,
    tags: ["prompt", "brain"],
    source: "home"
  });
  promptText = "";

  if (shouldAutoRunDeviceAction(request, sequence)) {
    agentBusy = true;
    render();
    try {
      const result = await executeDeviceSequence(request, sequence, "home");
      agentAnswer = `Done. ${result}`;
      memoryStore.add({
        kind: "message",
        title: `SlyOS ran: ${request.slice(0, 56)}`,
        body: agentAnswer,
        tags: ["agent-response", "brain", "operate"],
        source: "Mac"
      });
    } catch (error) {
      agentAnswer = error instanceof Error ? error.message : String(error);
    } finally {
      agentBusy = false;
      render();
    }
    return;
  }

  if (isOutboundRequest(request)) {
    agentBusy = true;
    render();
    try {
      const staged = await stageOutboundRequest(request);
      agentAnswer = `Draft staged for ${staged.contact}. Open Now to review, send, or close it.`;
    } catch (error) {
      agentAnswer = error instanceof Error ? error.message : String(error);
    } finally {
      agentBusy = false;
      render();
    }
    return;
  }

  agentAnswer = providerApiKey.trim() ? "" : "Setup needs a model key before SlyOS can answer live.";
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

async function encryptText(text: string, passphrase: string): Promise<Pick<VaultRecord, "ciphertext" | "iv" | "salt">> {
  if (!crypto.subtle) throw new Error("WebCrypto is not available in this runtime.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(new TextEncoder().encode(text)));
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt)
  };
}

async function decryptText(record: VaultRecord, passphrase: string): Promise<string> {
  if (!crypto.subtle) throw new Error("WebCrypto is not available in this runtime.");
  const salt = base64ToBytes(record.salt);
  const iv = base64ToBytes(record.iv);
  const key = await deriveVaultKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(base64ToBytes(record.ciphertext)));
  return new TextDecoder().decode(plaintext);
}

async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", toArrayBuffer(new TextEncoder().encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations: 210000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function localId(prefix: string): string {
  const random = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56);
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] ?? "there";
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
