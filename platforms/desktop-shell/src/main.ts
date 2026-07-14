import {
  createBrainSyncClient,
  createBrowserMemoryStore,
  planPrompt,
  type AgentAction,
  type AgentPlan,
  type BrainSyncClient,
  type MemoryItem,
  type SyncedVaultEnvelope
} from "@badscientist/agent-core";
import {
  defaultModelFor,
  generateJsonWithProvider as generateCloudJsonWithProvider,
  generateWithProvider as generateCloudWithProvider,
  generateVisionWithProvider,
  providerOptions,
  validateProviderKey,
  type ProviderId,
  type ProviderRequest
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
import { wireSlyOrbitCanvas } from "./slyOrbit";
import { POWER_CATALOG, type PowerType } from "./powerCatalog";
import "@fontsource/roboto/latin-300.css";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/caveat/latin-500.css";
import appsIcon from "@material-design-icons/svg/filled/apps.svg?raw";
import arrowBackIcon from "@material-design-icons/svg/filled/arrow_back.svg?raw";
import boltIcon from "@material-design-icons/svg/filled/bolt.svg?raw";
import homeIcon from "@material-design-icons/svg/filled/home.svg?raw";
import memoryIcon from "@material-design-icons/svg/filled/memory.svg?raw";
import pauseCircleIcon from "@material-design-icons/svg/filled/pause_circle.svg?raw";
import photoCameraIcon from "@material-design-icons/svg/filled/photo_camera.svg?raw";
import scienceIcon from "@material-design-icons/svg/filled/science.svg?raw";
import settingsIcon from "@material-design-icons/svg/filled/settings.svg?raw";
import storefrontIcon from "@material-design-icons/svg/filled/storefront.svg?raw";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./styles.css";

const materialIcons = {
  apps: appsIcon,
  arrowBack: arrowBackIcon,
  bolt: boltIcon,
  home: homeIcon,
  memory: memoryIcon,
  pauseCircle: pauseCircleIcon,
  photoCamera: photoCameraIcon,
  science: scienceIcon,
  settings: settingsIcon,
  storefront: storefrontIcon
} as const;

type MaterialIconName = keyof typeof materialIcons;

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
  | "profile"
  | "efficiency"
  | "appearance"
  | "lock-settings"
  | "account"
  | "diagnostics"
  | "permissions"
  | "feature-parity"
  | "mission"
  | "network"
  | "research"
  | "cowork"
  | "job"
  | "architect"
  | "app-view"
  | "chat"
  | "operate"
  | "skill"
  | "checklist"
  | "documents"
  | "faces"
  | "shop"
  | "compose"
  | "email-compose"
  | "spicy"
  | "outreach"
  | "store"
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

interface CalendarEventDraft {
  title: string;
  start: string;
  end: string;
  location: string;
  notes: string;
}

interface ReminderDraft {
  title: string;
  due: string;
  notes: string;
}

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
  calendarEvent?: CalendarEventDraft;
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

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MissionState {
  id: string;
  goal: string;
  percent: number;
  milestones: Array<{ id: string; text: string; done: boolean }>;
  lastAssessment: string;
  createdAt: string;
  updatedAt: string;
}

interface MissionProspect {
  id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  website: string;
  linkedin: string;
  why: string;
  status: "found" | "drafted";
  createdAt: string;
  updatedAt: string;
}

interface ResearchPaperRecord {
  id: string;
  title: string;
  topic: string;
  abstract: string;
  outline: string[];
  draft: string;
  createdAt: string;
  updatedAt: string;
}

interface CoworkFileRecord {
  id: string;
  name: string;
  kind: "markdown" | "text" | "json";
  content: string;
  createdAt: string;
  updatedAt: string;
  lastWrittenPath?: string;
}

type CoworkTurnRole = "user" | "agent" | "step";

interface CoworkTurn {
  id: string;
  role: CoworkTurnRole;
  body: string;
  createdAt: string;
}

interface CoworkChatRecord {
  id: string;
  title: string;
  turns: CoworkTurn[];
  createdAt: string;
  updatedAt: string;
}

interface CoworkToolAction {
  done: boolean;
  message: string;
  tool: "" | "list_files" | "read_file" | "write_file" | "append_file";
  name: string;
  content: string;
}

interface JobApplicationRecord {
  id: string;
  target: string;
  posting: string;
  resumeSource: string;
  tailoredResume: string;
  coverLetter: string;
  outreachEmail: string;
  createdAt: string;
  updatedAt: string;
}

interface MiniAppRecord {
  id: string;
  name: string;
  description: string;
  html: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentScanRecord {
  id: string;
  category: string;
  title: string;
  summary: string;
  fields: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

type DraftKind = "social" | "email" | "spicy" | "outreach";

interface DraftRecord {
  id: string;
  kind: DraftKind;
  platform: string;
  topic: string;
  to: string;
  subject: string;
  body: string;
  status: "draft" | "sent";
  createdAt: string;
  updatedAt: string;
}

interface FaceProfile {
  id: string;
  name: string;
  imageDataUrl: string;
  createdAt: string;
}

interface ShopResult {
  id: string;
  name: string;
  merchant: string;
  price: string;
  url: string;
  note: string;
}

interface PowerRecord {
  id: string;
  name: string;
  repoUrl: string;
  description: string;
  stars: number;
  enabled: boolean;
  updatedAt: string;
  tagline?: string;
  type?: PowerType;
  category?: string;
  instructions?: string;
  rating?: number;
  featured?: boolean;
  trending?: boolean;
  endpoint?: string;
}

interface ExpenseRecord {
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  category: string;
  note: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

interface NativeAppEntry {
  label: string;
  app: string;
  path?: string;
}

interface DiagnosticEvent {
  id: string;
  at: string;
  area: "runtime" | "bridge" | "sync" | "brain" | "provider";
  level: "info" | "ok" | "error";
  message: string;
}

interface HomeConversationTurn {
  role: "user" | "assistant";
  body: string;
  at: string;
}

interface DevicePermissionStatus {
  checked: boolean;
  sessionLocked?: boolean;
  screenRecording: boolean | null;
  accessibility: boolean | null;
  automation: boolean | null;
  errors?: Record<string, string>;
}

interface LocalModelOption {
  id: string;
  name: string;
  bytes: number;
}

type DevicePrimitive = { type: string; [key: string]: unknown };
type DeviceSequence = DevicePrimitive[];

type HomeRoute =
  | "answer"
  | "device"
  | "calendar"
  | "native_read"
  | "outbound"
  | "checklist"
  | "research"
  | "cowork"
  | "mission"
  | "network"
  | "job"
  | "architect"
  | "documents"
  | "faces"
  | "shop"
  | "investing"
  | "compose"
  | "email"
  | "spicy"
  | "expenses"
  | "apps";

interface HomeDecision {
  route: HomeRoute;
  confidence: number;
  subject: string;
  target: string;
  requiresDevice: boolean;
  reason: string;
}

interface ReflexSkill {
  id: string;
  name: string;
  instruction: string;
  steps: DeviceSequence;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
}

const memoryStore = createBrowserMemoryStore(window.localStorage, "slyos");
const queriedRoot = document.querySelector<HTMLDivElement>("#app");
if (!queriedRoot) throw new Error("Missing #app root.");
const appRoot: HTMLDivElement = queriedRoot;
const routeParams = new URLSearchParams(window.location.search);
const previewMode = import.meta.env.DEV && routeParams.get("preview") === "true";
const defaultSupabaseUrl = "https://xfftheaprdedypqlcvzg.supabase.co";
const defaultSupabasePublishableKey = "sb_publishable_AxUM6xdI_3L-no-9MbNsxQ__u_eLmsQ";
const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? defaultSupabaseUrl;
const envSupabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? defaultSupabasePublishableKey;

let screen: ShellScreen = "boot";
let promptText = "";
let memoryQuery = "";
let memoryAnswer = "";
let memoryPathKeys: string[] = [];
let memoryFilter: BrainNodeType | null = null;
let selectedBrainKey: string | null = null;
let lastPlan: AgentPlan | null = null;
let syncClient: BrainSyncClient | null = null;
let syncStatus = "not connected";
let syncUserId = "";
let syncBusy = false;
let pendingSyncTimer: number | null = null;
let supabaseUrl = window.localStorage.getItem("slyos:supabaseUrl") ?? envSupabaseUrl;
let supabasePublishableKey =
  window.localStorage.getItem("slyos:supabasePublishableKey") ?? envSupabasePublishableKey;
let supabaseEmail = window.localStorage.getItem("slyos:supabaseEmail") ?? "";
let agentPaused = false;
let deviceBridgeUrl = window.localStorage.getItem("slyos:deviceBridgeUrl") ?? "http://127.0.0.1:4317";
let deviceBridgeToken =
  window.localStorage.getItem("slyos:deviceBridgeToken") ?? (nativePlatform === "macos" ? "slyos-local-dev" : "");
let deviceBridgeStatus = "device bridge not checked";
let devicePermissionStatus: DevicePermissionStatus = {
  checked: false,
  screenRecording: null,
  accessibility: null,
  automation: null
};
let deviceBridgeObservation = "";
let operatePrompt = "";
let operateStatus = "device loop idle";
let skillStatus = "";
let vaultStatus = "locked";
let revealedVault: { label: string; text: string } | null = null;
let revealedSyncedVault: Array<{ label: string; value: string }> | null = null;
let setupComplete = previewMode || window.localStorage.getItem("slyos:setupComplete") === "true";
let profileName = window.localStorage.getItem("slyos:profileName") ?? "";
let profileVoice = window.localStorage.getItem("slyos:profileVoice") ?? "";
let aboutYou = window.localStorage.getItem("slyos:aboutYou") ?? "";
let profileEmail = window.localStorage.getItem("slyos:profileEmail") ?? "";
let profilePhone = window.localStorage.getItem("slyos:profilePhone") ?? "";
let profileAddress = window.localStorage.getItem("slyos:profileAddress") ?? "";
let bookingLink = window.localStorage.getItem("slyos:bookingLink") ?? "";
let darkMode = window.localStorage.getItem("slyos:darkMode") === "true";
document.documentElement.dataset.theme = darkMode ? "dark" : "light";
let selectedProvider = readProviderId(window.localStorage.getItem("slyos:modelProvider"));
let modelName = normalizeStoredModel(
  selectedProvider,
  window.localStorage.getItem(providerModelStorageKey(selectedProvider)) ??
    window.localStorage.getItem("slyos:modelName") ??
    defaultModelFor(selectedProvider)
);
let providerApiKey = window.localStorage.getItem(providerKeyStorageKey(selectedProvider)) ?? "";
let providerStatus = providerApiKey ? `${providerLabel(selectedProvider)} key saved on this device.` : "model key missing";
let localModelEnabled = window.localStorage.getItem("slyos:localModelEnabled") === "true";
let localModelId = window.localStorage.getItem("slyos:localModelId") ?? "";
let localModelOptions: LocalModelOption[] = [];
let localModelStatus = "not checked";
let localModelChecking = false;
let agentAnswer = "";
let agentBusy = false;
let nowDigest = "";
let homeChecklistVisible = false;
let missionStatus = "";
let missionRunning = false;
let networkQuery = "";
let networkStatus = "";
let researchStatus = "";
let coworkStatus = "";
let coworkActiveChatId = window.localStorage.getItem("slyos:coworkActiveChatId");
let coworkShowFiles = false;
let coworkChatQuery = "";
let expensesStatus = "";
let jobStatus = "";
let jobTargetPrompt = "";
let architectStatus = "";
let architectPrompt = "";
let activeMiniAppId: string | null = null;
let documentScanImage = "";
let documentScanStatus = "";
let composePlatform = "X";
let composeTopic = "";
let composeBody = "";
let composeStatus = "";
let emailTo = "";
let emailTopic = "";
let emailSubject = "";
let emailBody = "";
let emailStatus = "";
let spicyPlatform = "X";
let spicyTopic = "";
let spicyBody = "";
let spicyStatus = "";
let outreachTopic = "";
let outreachStatus = "";
let faceEnrollImage = "";
let faceRecognizeImage = "";
let faceStatus = "";
let shopQuery = "";
let shopStatus = "";
let shopResults: ShopResult[] = [];
let powerQuery = "";
let powerStatus = "";
let powerSegment: "for-you" | PowerType = "for-you";
let selectedPowerId: string | null = null;
let backupStatus = "";
let deviceDiagnosticLines: string[] = [];
let deviceDiagnosticPath = "";
let diagnosticsLoaded = false;
let installedApps: NativeAppEntry[] = [];
let installedAppsStatus = "";
let installedAppsLoading = false;
let installedAppsAttempted = false;
let installedAppsQuery = "";
const installedAppIcons = new Map<string, string>();
const installedAppIconLoads = new Set<string>();
const installedAppIconAttempts = new Set<string>();
let setupStep = Math.min(4, Math.max(0, Number(window.localStorage.getItem("slyos:setupStep") ?? "0") || 0));
let lookImageDataUrl = "";
let lookStatus = "Camera idle.";
let lookAnswer = "";
let lookMediaStream: MediaStream | null = null;
let voiceStatus = "listening…";
let voiceTranscript = "";
let voiceListening = false;
let voiceRecognition: {
  start(): void;
  stop(): void;
  abort(): void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
} | null = null;
const memorySearchHistoryKey = "slyos:memorySearchHistory";
const outboxKey = "slyos:outboxRecords";
const nowTasksKey = "slyos:nowTasks";
const dismissedProposalsKey = "slyos:dismissedProposals";
const perAppModesKey = "slyos:perAppModes";
const automationPrefsKey = "slyos:automationPrefs";
const checklistKey = "slyos:checklist";
const missionKey = "slyos:mission";
const missionProspectsKey = "slyos:missionProspects";
const researchPapersKey = "slyos:researchPapers";
const coworkFilesKey = "slyos:coworkFiles";
const coworkChatsKey = "slyos:coworkChats";
const expensesKey = "slyos:expenses";
const jobApplicationsKey = "slyos:jobApplications";
const miniAppsKey = "slyos:miniApps";
const documentScansKey = "slyos:documentScans";
const draftsKey = "slyos:drafts";
const faceProfilesKey = "slyos:faceProfiles";
const powersKey = "slyos:powers";
const diagnosticsKey = "slyos:diagnostics";
const reflexSkillsKey = "slyos:reflexSkills";
const syncedVaultKey = "slyos:syncedVaultEnvelope";
const syncedStructuredKeys = new Set([
  outboxKey,
  nowTasksKey,
  dismissedProposalsKey,
  perAppModesKey,
  automationPrefsKey,
  checklistKey,
  missionKey,
  missionProspectsKey,
  researchPapersKey,
  coworkFilesKey,
  coworkChatsKey,
  expensesKey,
  jobApplicationsKey,
  miniAppsKey,
  documentScansKey,
  draftsKey,
  powersKey,
  reflexSkillsKey
]);

window.addEventListener("error", (event) => {
  reportRuntimeFailure("window.error", event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  reportRuntimeFailure("unhandledrejection", event.reason);
});

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

hydrateStructuredStores();

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
  "profile",
  "efficiency",
  "appearance",
  "lock-settings",
  "account",
  "diagnostics",
  "permissions",
  "feature-parity",
  "mission",
  "network",
  "research",
  "cowork",
  "job",
  "architect",
  "app-view",
  "chat",
  "operate",
  "skill",
  "checklist",
  "documents",
  "faces",
  "shop",
  "compose",
  "email-compose",
  "spicy",
  "outreach",
  "store",
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

const initialScreen = routeParams.get("screen") as ShellScreen | null;
if (initialScreen && routeScreens.has(initialScreen)) {
  screen = initialScreen;
}
if (!setupComplete && !["boot", "setup"].includes(screen)) {
  screen = "setup";
}

const shortcuts: Shortcut[] = [
  { label: "Look", kind: "look", glyph: "◉" },
  { label: "Docs", kind: "documents", glyph: "✎" },
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

(window as Window & { slyosHandleNativePrompt?: (request: string) => void }).slyosHandleNativePrompt = (request: string) => {
  const prompt = String(request ?? "").trim();
  if (!prompt) return;
  screen = "home";
  promptText = prompt;
  render();
  window.setTimeout(() => void runPrompt(), 80);
};

render();
registerServiceWorker();
void initializeRuntime();

async function initializeRuntime(): Promise<void> {
  recordDiagnostic("runtime", "info", `SlyOS started on ${platformLabel()}.`);

  if (nativePlatform !== "ios") {
    let bridgeError = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await checkDeviceBridge();
        await refreshDevicePermissions();
        bridgeError = "";
        recordDiagnostic("bridge", "ok", deviceBridgeStatus);
        break;
      } catch (error) {
        bridgeError = error instanceof Error ? error.message : String(error);
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    if (bridgeError) {
      deviceBridgeStatus = bridgeError;
      recordDiagnostic("bridge", "error", bridgeError);
    }
  }

  if (syncClient) {
    try {
      syncUserId = (await syncClient.currentUserId()) ?? "";
      if (syncUserId) {
        syncStatus = `Signed in · ${syncUserId.slice(0, 8)}`;
        recordDiagnostic("sync", "ok", "Restored the account session.");
        await pullRemoteBrain("startup");
      } else {
        syncStatus = "Configured · not signed in";
        recordDiagnostic("sync", "info", "Supabase is configured, but no account session is signed in.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      syncStatus = message;
      recordDiagnostic("sync", "error", message);
    }
  }
  render();
}

function diagnosticsEvents(): DiagnosticEvent[] {
  return readJsonStorage<DiagnosticEvent[]>(diagnosticsKey, []).filter((event) =>
    Boolean(event && typeof event.id === "string" && typeof event.at === "string" && typeof event.message === "string")
  ).slice(0, 300);
}

function recordDiagnostic(area: DiagnosticEvent["area"], level: DiagnosticEvent["level"], message: string): void {
  const event: DiagnosticEvent = {
    id: localId("diag"),
    at: new Date().toISOString(),
    area,
    level,
    message: message.replace(/(sb_(?:publishable|secret)_[A-Za-z0-9_-]+)/g, "[redacted-key]").slice(0, 800)
  };
  try {
    window.localStorage.setItem(diagnosticsKey, JSON.stringify([event, ...diagnosticsEvents()].slice(0, 300)));
  } catch (error) {
    console.error("SlyOS diagnostic storage failed", error);
  }
}

async function pullRemoteBrain(reason: string): Promise<void> {
  if (!syncClient) throw new Error("Configure sync first.");
  syncBusy = true;
  recordDiagnostic("sync", "info", `Pull started (${reason}).`);
  try {
    const remote = await syncClient.pullMemory(1000);
    memoryStore.upsertMany(remote);
    const settings = await syncClient.pullSettings();
    for (const item of settings) memoryStore.setSetting(item.key, item.value);
    const remoteVault = await syncClient.pullVault();
    if (remoteVault && remoteVault.updatedAt > (syncedVaultEnvelope()?.updatedAt ?? 0)) {
      window.localStorage.setItem(syncedVaultKey, JSON.stringify(remoteVault));
    }
    applySyncedSettingsToRuntime(remote);
    syncStatus = `Pulled ${remote.length} brain item(s), ${settings.length} setting(s)${remoteVault ? ", and the encrypted vault" : ""}.`;
    recordDiagnostic("sync", "ok", syncStatus);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    syncStatus = message;
    recordDiagnostic("sync", "error", message);
    throw error;
  } finally {
    syncBusy = false;
  }
}

async function pushRemoteBrain(reason: string): Promise<void> {
  if (!syncClient || !syncUserId) return;
  syncBusy = true;
  recordDiagnostic("sync", "info", `Push started (${reason}).`);
  try {
    await syncClient.pushMemory(memoryStore.list());
    await syncClient.pushSettings(memoryStore.listSettings());
    const vault = syncedVaultEnvelope();
    if (vault) await syncClient.pushVault(vault);
    syncStatus = `Pushed ${memoryStore.list().length} brain item(s).`;
    recordDiagnostic("sync", "ok", syncStatus);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    syncStatus = message;
    recordDiagnostic("sync", "error", message);
  } finally {
    syncBusy = false;
    render();
  }
}

function scheduleBrainSync(reason: string): void {
  if (!syncClient || !syncUserId) return;
  if (pendingSyncTimer !== null) window.clearTimeout(pendingSyncTimer);
  pendingSyncTimer = window.setTimeout(() => {
    pendingSyncTimer = null;
    void pushRemoteBrain(reason);
  }, 900);
}

function applySyncedSettingsToRuntime(remote: MemoryItem[]): void {
  hydrateStructuredStores();
  const settings = new Map(memoryStore.listSettings().map((item) => [item.key, item.value]));
  if (typeof settings.get("profileName") === "string") profileName = String(settings.get("profileName"));
  if (typeof settings.get("profileVoice") === "string") profileVoice = String(settings.get("profileVoice"));
  if (typeof settings.get("aboutYou") === "string") aboutYou = String(settings.get("aboutYou"));
  if (typeof settings.get("profileEmail") === "string") profileEmail = String(settings.get("profileEmail"));
  if (typeof settings.get("profilePhone") === "string") profilePhone = String(settings.get("profilePhone"));
  if (typeof settings.get("profileAddress") === "string") profileAddress = String(settings.get("profileAddress"));
  if (typeof settings.get("bookingLink") === "string") bookingLink = String(settings.get("bookingLink"));
  if (typeof settings.get("darkMode") === "boolean") darkMode = settings.get("darkMode") === true;
  const androidProfile = remote.find((item) => item.kind === "profile" && item.id === "about");
  if (androidProfile?.title && androidProfile.title !== "Profile" && (!profileName.trim() || profileName === "there")) {
    profileName = androidProfile.title;
  }
  if (androidProfile?.body) aboutYou = androidProfile.body;
  window.localStorage.setItem("slyos:profileName", profileName);
  window.localStorage.setItem("slyos:profileVoice", profileVoice);
  window.localStorage.setItem("slyos:aboutYou", aboutYou);
  window.localStorage.setItem("slyos:profileEmail", profileEmail);
  window.localStorage.setItem("slyos:profilePhone", profilePhone);
  window.localStorage.setItem("slyos:profileAddress", profileAddress);
  window.localStorage.setItem("slyos:bookingLink", bookingLink);
  window.localStorage.setItem("slyos:darkMode", String(darkMode));
  document.documentElement.dataset.theme = darkMode ? "dark" : "light";
}

function readProviderId(value: string | null): ProviderId {
  return providerOptions.some((option) => option.id === value) ? (value as ProviderId) : "gemini";
}

function providerKeyStorageKey(provider: ProviderId): string {
  return `slyos:${provider}:apiKey`;
}

function providerModelStorageKey(provider: ProviderId): string {
  return `slyos:${provider}:modelName`;
}

function normalizeStoredModel(provider: ProviderId, model: string): string {
  if (provider === "gemini" && /^gemini-1(?:\.0|\.5)?-/i.test(model.trim())) return defaultModelFor(provider);
  return model.trim() || defaultModelFor(provider);
}

function providerLabel(provider: ProviderId = selectedProvider): string {
  return providerOptions.find((option) => option.id === provider)?.label ?? "Model";
}

function hasCloudModel(): boolean {
  return providerApiKey.trim().length >= 8;
}

function hasLocalTextModel(): boolean {
  return localModelEnabled && Boolean(localModelId);
}

function hasTextModel(): boolean {
  return hasCloudModel() || hasLocalTextModel();
}

function textModelLabel(): string {
  return hasCloudModel() ? providerLabel() : localModelOptions.find((model) => model.id === localModelId)?.name || "Offline model";
}

async function runLocalModelAction(action: DevicePrimitive): Promise<Record<string, any>> {
  if (nativePlatform === "ios") return runIosDevicePrimitive(action) as unknown as Record<string, any>;
  if (!deviceBridgeUrl || !deviceBridgeToken) throw new Error("The local device bridge is not configured.");
  return deviceFetch("/actions", { method: "POST", body: JSON.stringify(action) });
}

async function refreshLocalModels(): Promise<void> {
  if (localModelChecking) return;
  localModelChecking = true;
  localModelStatus = "checking this device…";
  render();
  try {
    const payload = await runLocalModelAction({ type: "local_model_status" });
    const result = (payload.result ?? payload) as Record<string, unknown>;
    localModelOptions = Array.isArray(result.models)
      ? result.models.map((model: Record<string, unknown>) => ({
          id: String(model.id ?? ""),
          name: String(model.name ?? model.id ?? "Local model"),
          bytes: Number(model.bytes ?? 0)
        })).filter((model) => model.id)
      : [];
    const runtime = String(result.runtime ?? (nativePlatform === "ios" ? "Apple Intelligence" : "Ollama"));
    localModelStatus = localModelOptions.length
      ? `${runtime} ready · ${localModelOptions.length} model${localModelOptions.length === 1 ? "" : "s"} available`
      : `${runtime} unavailable${result.reason ? ` · ${String(result.reason)}` : ""}`;
    if (localModelId && !localModelOptions.some((model) => model.id === localModelId)) {
      localModelEnabled = false;
      window.localStorage.setItem("slyos:localModelEnabled", "false");
    }
  } catch (error) {
    localModelOptions = [];
    localModelStatus = error instanceof Error ? error.message : String(error);
  } finally {
    localModelChecking = false;
    render();
  }
}

async function generateWithLocalModel(request: ProviderRequest): Promise<string> {
  if (!localModelEnabled || !localModelId) throw new Error("No offline backup model is enabled.");
  const prompt = [
    "You are SlyOS. Use the supplied private brain context when it is relevant. Do not claim an action succeeded unless the context says it did.",
    `PRIVATE BRAIN CONTEXT:\n${request.memoryContext.slice(0, 40_000)}`,
    `REQUEST:\n${request.prompt.slice(0, 60_000)}`
  ].join("\n\n");
  const payload = await runLocalModelAction({
    type: "local_model_generate",
    model: localModelId,
    prompt,
    maxOutputTokens: request.maxOutputTokens ?? 900
  });
  const result = (payload.result ?? payload) as Record<string, unknown>;
  const content = String(result.content ?? "").trim();
  if (!content) throw new Error("The offline backup model returned no text.");
  recordDiagnostic("provider", "ok", `Offline backup used · ${String(result.runtime ?? "local")} · ${String(result.model ?? localModelId)}`);
  return content;
}

async function generateWithProvider(request: ProviderRequest): Promise<string> {
  if (!hasCloudModel()) {
    if (!hasLocalTextModel()) throw new Error("Add a cloud model key or enable an on-device text model in Setup.");
    if (request.useWebSearch) throw new Error("Live web search requires a configured cloud model.");
    return generateWithLocalModel(request);
  }
  try {
    return await generateCloudWithProvider(request);
  } catch (cloudError) {
    if (!localModelEnabled || !localModelId || request.useWebSearch) throw cloudError;
    recordDiagnostic("provider", "info", `Cloud model unavailable; trying offline backup · ${cloudError instanceof Error ? cloudError.message : String(cloudError)}`);
    try {
      return await generateWithLocalModel(request);
    } catch (localError) {
      throw new Error(`Cloud model failed: ${cloudError instanceof Error ? cloudError.message : String(cloudError)} Offline backup failed: ${localError instanceof Error ? localError.message : String(localError)}`);
    }
  }
}

async function generateJsonWithProvider<T>(request: ProviderRequest): Promise<T> {
  if (!hasCloudModel()) {
    if (!hasLocalTextModel()) throw new Error("Add a cloud model key or enable an on-device text model in Setup.");
    if (request.useWebSearch) throw new Error("Live web search requires a configured cloud model.");
    const raw = await generateWithLocalModel({
      ...request,
      prompt: `${request.prompt}\n\nReturn one strict JSON object and no markdown.`
    });
    const parsed = parseJsonObject(raw);
    if (!parsed) throw new Error("The offline model did not return valid JSON.");
    return parsed as T;
  }
  try {
    return await generateCloudJsonWithProvider<T>(request);
  } catch (cloudError) {
    if (!localModelEnabled || !localModelId || request.useWebSearch) throw cloudError;
    const raw = await generateWithLocalModel({
      ...request,
      prompt: `${request.prompt}\n\nReturn one strict JSON object and no markdown.`
    });
    const parsed = parseJsonObject(raw);
    if (!parsed) throw new Error("The offline backup model did not return valid JSON.");
    return parsed as T;
  }
}

function localMemories(): MemoryItem[] {
  return memoryStore.list().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function homeConversation(): HomeConversationTurn[] {
  return localMemories()
    .filter((item) => item.tags.includes("home-turn:user") || item.tags.includes("home-turn:assistant"))
    .map((item) => ({
      role: item.tags.includes("home-turn:user") ? "user" as const : "assistant" as const,
      body: item.body,
      at: item.createdAt
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

function rememberHomeTurn(role: HomeConversationTurn["role"], body: string, tags: string[] = []): void {
  const clean = body.trim();
  if (!clean) return;
  memoryStore.add({
    kind: "message",
    title: role === "user" ? `You: ${clean.slice(0, 60)}` : `SlyOS: ${clean.slice(0, 60)}`,
    body: clean,
    tags: ["brain", "home-conversation", `home-turn:${role}`, ...tags],
    source: role === "user" ? "Home" : providerLabel()
  });
}

function contextualizeHomeRequest(request: string, priorTurns: HomeConversationTurn[]): string {
  const isFollowUp = /^(?:and|then|now|also|instead|continue|try again)\b/i.test(request) ||
    /^(?:make|change|revise|refine)\s+(?:it|that|this)\b/i.test(request) ||
    /\b(?:it|that|this|the previous|last answer)\b/i.test(request);
  if (!isFollowUp || !priorTurns.length) return request;
  const context = priorTurns.slice(-6).map((turn) => `${turn.role === "user" ? "User" : "SlyOS"}: ${turn.body}`).join("\n");
  return `Continue the existing Home conversation.\n${context}\nUser follow-up: ${request}`;
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
  if (syncedStructuredKeys.has(key)) memoryStore.setSetting(key, value);
}

function hydrateStructuredStores(): void {
  const settings = new Map(memoryStore.listSettings().map((item) => [item.key, item.value]));
  for (const key of syncedStructuredKeys) {
    if (settings.has(key)) {
      window.localStorage.setItem(key, JSON.stringify(settings.get(key)));
      continue;
    }
    const local = window.localStorage.getItem(key);
    if (!local) continue;
    try {
      memoryStore.setSetting(key, JSON.parse(local) as unknown);
    } catch {
      // Ignore malformed legacy entries; their normal reader will fall back safely.
    }
  }
}

function agentResponses(): MemoryItem[] {
  return localMemories().filter((item) => item.tags.includes("agent-response"));
}

function checklistItems(): ChecklistItem[] {
  return readJsonStorage<ChecklistItem[]>(checklistKey, [])
    .filter(isChecklistItem)
    .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt));
}

function saveChecklistItems(items: ChecklistItem[]): void {
  writeJsonStorage(checklistKey, items.filter(isChecklistItem));
}

function isChecklistItem(value: unknown): value is ChecklistItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.text === "string" &&
    typeof item.done === "boolean" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}

function addChecklistItem(text: string): ChecklistItem {
  const now = new Date().toISOString();
  const item: ChecklistItem = { id: localId("todo"), text: text.trim(), done: false, createdAt: now, updatedAt: now };
  saveChecklistItems([item, ...checklistItems()]);
  memoryStore.add({
    kind: "memory",
    title: `Checklist: ${item.text}`,
    body: `Added to checklist: ${item.text}`,
    tags: ["checklist", "task", "brain"],
    source: "checklist"
  });
  return item;
}

function toggleChecklistItem(id: string): void {
  const now = new Date().toISOString();
  const next = checklistItems().map((item) => (item.id === id ? { ...item, done: !item.done, updatedAt: now } : item));
  saveChecklistItems(next);
}

function removeChecklistItem(id: string): void {
  const item = checklistItems().find((candidate) => candidate.id === id);
  saveChecklistItems(checklistItems().filter((candidate) => candidate.id !== id));
  if (item) {
    memoryStore.add({
      kind: "memory",
      title: `Removed checklist: ${item.text}`,
      body: `Removed from checklist: ${item.text}`,
      tags: ["checklist", "task", "brain"],
      source: "checklist"
    });
  }
}

function missionState(): MissionState | null {
  const value = readJsonStorage<MissionState | null>(missionKey, null);
  return isMissionState(value) ? value : null;
}

function saveMissionState(value: MissionState): void {
  writeJsonStorage(missionKey, value);
  memoryStore.setSetting("mission", value);
}

function isMissionState(value: unknown): value is MissionState {
  if (!value || typeof value !== "object") return false;
  const mission = value as Record<string, unknown>;
  return (
    typeof mission.id === "string" &&
    typeof mission.goal === "string" &&
    typeof mission.percent === "number" &&
    Array.isArray(mission.milestones) &&
    typeof mission.lastAssessment === "string" &&
    typeof mission.createdAt === "string" &&
    typeof mission.updatedAt === "string"
  );
}

function missionProspects(): MissionProspect[] {
  return readJsonStorage<MissionProspect[]>(missionProspectsKey, [])
    .filter(isMissionProspect)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveMissionProspects(prospects: MissionProspect[]): void {
  writeJsonStorage(missionProspectsKey, prospects.filter(isMissionProspect).slice(0, 100));
}

function isMissionProspect(value: unknown): value is MissionProspect {
  if (!value || typeof value !== "object") return false;
  const prospect = value as Record<string, unknown>;
  return (
    typeof prospect.id === "string" &&
    typeof prospect.name === "string" &&
    typeof prospect.company === "string" &&
    typeof prospect.role === "string" &&
    typeof prospect.email === "string" &&
    typeof prospect.website === "string" &&
    typeof prospect.linkedin === "string" &&
    typeof prospect.why === "string" &&
    (prospect.status === "found" || prospect.status === "drafted") &&
    typeof prospect.createdAt === "string" &&
    typeof prospect.updatedAt === "string"
  );
}

function researchPapers(): ResearchPaperRecord[] {
  return readJsonStorage<ResearchPaperRecord[]>(researchPapersKey, [])
    .filter(isResearchPaper)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveResearchPapers(papers: ResearchPaperRecord[]): void {
  writeJsonStorage(researchPapersKey, papers.filter(isResearchPaper).slice(0, 100));
}

function isResearchPaper(value: unknown): value is ResearchPaperRecord {
  if (!value || typeof value !== "object") return false;
  const paper = value as Record<string, unknown>;
  return (
    typeof paper.id === "string" &&
    typeof paper.title === "string" &&
    typeof paper.topic === "string" &&
    typeof paper.abstract === "string" &&
    Array.isArray(paper.outline) &&
    typeof paper.draft === "string" &&
    typeof paper.createdAt === "string" &&
    typeof paper.updatedAt === "string"
  );
}

function coworkFiles(): CoworkFileRecord[] {
  return readJsonStorage<CoworkFileRecord[]>(coworkFilesKey, [])
    .filter(isCoworkFile)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveCoworkFiles(files: CoworkFileRecord[]): void {
  writeJsonStorage(coworkFilesKey, files.filter(isCoworkFile).slice(0, 200));
}

function isCoworkFile(value: unknown): value is CoworkFileRecord {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.id === "string" &&
    typeof file.name === "string" &&
    typeof file.kind === "string" &&
    typeof file.content === "string" &&
    typeof file.createdAt === "string" &&
    typeof file.updatedAt === "string"
  );
}

function coworkChats(): CoworkChatRecord[] {
  return readJsonStorage<CoworkChatRecord[]>(coworkChatsKey, [])
    .filter(isCoworkChat)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveCoworkChats(chats: CoworkChatRecord[]): void {
  writeJsonStorage(coworkChatsKey, chats.filter(isCoworkChat).slice(0, 100));
}

function isCoworkChat(value: unknown): value is CoworkChatRecord {
  if (!value || typeof value !== "object") return false;
  const chat = value as Record<string, unknown>;
  return (
    typeof chat.id === "string" &&
    typeof chat.title === "string" &&
    Array.isArray(chat.turns) &&
    chat.turns.every(isCoworkTurn) &&
    typeof chat.createdAt === "string" &&
    typeof chat.updatedAt === "string"
  );
}

function isCoworkTurn(value: unknown): value is CoworkTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Record<string, unknown>;
  return (
    typeof turn.id === "string" &&
    (turn.role === "user" || turn.role === "agent" || turn.role === "step") &&
    typeof turn.body === "string" &&
    typeof turn.createdAt === "string"
  );
}

function jobApplications(): JobApplicationRecord[] {
  return readJsonStorage<JobApplicationRecord[]>(jobApplicationsKey, [])
    .filter(isJobApplication)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveJobApplications(applications: JobApplicationRecord[]): void {
  writeJsonStorage(jobApplicationsKey, applications.filter(isJobApplication).slice(0, 100));
}

function isJobApplication(value: unknown): value is JobApplicationRecord {
  if (!value || typeof value !== "object") return false;
  const application = value as Record<string, unknown>;
  return (
    typeof application.id === "string" &&
    typeof application.target === "string" &&
    typeof application.posting === "string" &&
    typeof application.resumeSource === "string" &&
    typeof application.tailoredResume === "string" &&
    typeof application.coverLetter === "string" &&
    typeof application.outreachEmail === "string" &&
    typeof application.createdAt === "string" &&
    typeof application.updatedAt === "string"
  );
}

function miniApps(): MiniAppRecord[] {
  return readJsonStorage<MiniAppRecord[]>(miniAppsKey, [])
    .filter(isMiniApp)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveMiniApps(apps: MiniAppRecord[]): void {
  writeJsonStorage(miniAppsKey, apps.filter(isMiniApp).slice(0, 100));
}

function isMiniApp(value: unknown): value is MiniAppRecord {
  if (!value || typeof value !== "object") return false;
  const app = value as Record<string, unknown>;
  return (
    typeof app.id === "string" &&
    typeof app.name === "string" &&
    typeof app.description === "string" &&
    typeof app.html === "string" &&
    typeof app.createdAt === "string" &&
    typeof app.updatedAt === "string"
  );
}

function documentScans(): DocumentScanRecord[] {
  return readJsonStorage<DocumentScanRecord[]>(documentScansKey, [])
    .filter(isDocumentScan)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveDocumentScans(scans: DocumentScanRecord[]): void {
  writeJsonStorage(documentScansKey, scans.filter(isDocumentScan).slice(0, 500));
}

function isDocumentScan(value: unknown): value is DocumentScanRecord {
  if (!value || typeof value !== "object") return false;
  const scan = value as Record<string, unknown>;
  return (
    typeof scan.id === "string" &&
    typeof scan.category === "string" &&
    typeof scan.title === "string" &&
    typeof scan.summary === "string" &&
    Boolean(scan.fields) &&
    typeof scan.fields === "object" &&
    typeof scan.createdAt === "string" &&
    typeof scan.updatedAt === "string"
  );
}

function draftRecords(kind?: DraftKind): DraftRecord[] {
  return readJsonStorage<DraftRecord[]>(draftsKey, [])
    .filter(isDraftRecord)
    .filter((draft) => !kind || draft.kind === kind)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveDraftRecords(records: DraftRecord[]): void {
  writeJsonStorage(draftsKey, records.filter(isDraftRecord).slice(0, 500));
}

function isDraftRecord(value: unknown): value is DraftRecord {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.id === "string" &&
    typeof draft.kind === "string" &&
    typeof draft.platform === "string" &&
    typeof draft.topic === "string" &&
    typeof draft.to === "string" &&
    typeof draft.subject === "string" &&
    typeof draft.body === "string" &&
    typeof draft.status === "string" &&
    typeof draft.createdAt === "string" &&
    typeof draft.updatedAt === "string"
  );
}

function upsertDraft(input: Omit<DraftRecord, "id" | "createdAt" | "updatedAt">, existingId?: string): DraftRecord {
  const now = new Date().toISOString();
  const current = existingId ? draftRecords().find((draft) => draft.id === existingId) : undefined;
  const record: DraftRecord = {
    ...input,
    id: current?.id ?? localId("draft"),
    createdAt: current?.createdAt ?? now,
    updatedAt: now
  };
  saveDraftRecords([record, ...draftRecords().filter((draft) => draft.id !== record.id)]);
  memoryStore.add({
    kind: "message",
    title: `${record.kind}: ${record.subject || record.topic || record.to || record.platform}`,
    body: record.body,
    tags: [record.kind, record.status, "brain"],
    source: record.platform || "SlyOS"
  });
  return record;
}

function faceProfiles(): FaceProfile[] {
  return readJsonStorage<FaceProfile[]>(faceProfilesKey, [])
    .filter((profile) => Boolean(profile?.id && profile.name && profile.imageDataUrl && profile.createdAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function saveFaceProfiles(profiles: FaceProfile[]): void {
  window.localStorage.setItem(faceProfilesKey, JSON.stringify(profiles.slice(0, 100)));
}

function powerRecords(): PowerRecord[] {
  const saved = readJsonStorage<PowerRecord[]>(powersKey, []).filter((item) => Boolean(item?.id));
  const byId = new Map(saved.map((item) => [item.id, item]));
  const curated = POWER_CATALOG.map((item): PowerRecord => {
    const stored = byId.get(item.id);
    return {
      id: item.id,
      name: item.name,
      repoUrl: `https://github.com/${item.repo}`,
      description: item.description,
      stars: item.stars,
      enabled: stored?.enabled ?? false,
      updatedAt: stored?.updatedAt ?? new Date(0).toISOString(),
      tagline: item.tagline,
      type: item.type,
      category: item.category,
      instructions: item.instructions,
      rating: item.rating,
      featured: item.featured,
      trending: item.trending,
      endpoint: stored?.endpoint ?? ""
    };
  });
  const custom = saved.filter((item) => !POWER_CATALOG.some((power) => power.id === item.id));
  return [...curated, ...custom]
    .filter((power) => Boolean(power?.id && power.name && power.repoUrl && typeof power.enabled === "boolean"))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.stars - a.stars);
}

function savePowerRecords(records: PowerRecord[]): void {
  writeJsonStorage(powersKey, records.slice(0, 100));
}

function expenseRecords(): ExpenseRecord[] {
  return readJsonStorage<ExpenseRecord[]>(expensesKey, [])
    .filter(isExpenseRecord)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

function saveExpenseRecords(records: ExpenseRecord[]): void {
  writeJsonStorage(expensesKey, records.filter(isExpenseRecord).slice(0, 500));
}

function isExpenseRecord(value: unknown): value is ExpenseRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.merchant === "string" &&
    typeof record.amount === "number" &&
    typeof record.currency === "string" &&
    typeof record.category === "string" &&
    typeof record.note === "string" &&
    typeof record.date === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

function formatMoney(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat([], { style: "currency", currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function startMission(goal: string): MissionState {
  const trimmed = goal.trim();
  const now = new Date().toISOString();
  const mission: MissionState = {
    id: localId("mission"),
    goal: trimmed,
    percent: 0,
    milestones: missionMilestones(trimmed).map((text, index) => ({
      id: `step_${index + 1}`,
      text,
      done: false
    })),
    lastAssessment: "Mission started. SlyOS will keep every prompt grounded in this goal until you replace it.",
    createdAt: now,
    updatedAt: now
  };
  saveMissionState(mission);
  saveMissionProspects([]);
  missionStatus = `Mission set: ${trimmed}`;
  memoryStore.add({
    kind: "memory",
    title: `Mission: ${trimmed}`,
    body: mission.milestones.map((step, index) => `${index + 1}. ${step.text}`).join("\n"),
    tags: ["mission", "task", "brain"],
    source: "mission"
  });
  return mission;
}

function missionMilestones(goal: string): string[] {
  const lower = goal.toLowerCase();
  if (/\bbuyer|customer|lead|sell|sales\b/.test(lower)) {
    return [
      "Define the ideal buyer and the proof they care about",
      "Find a first list of companies and decision makers",
      "Draft a short outreach message in your voice",
      "Stage outreach drafts in Now for approval",
      "Track replies, objections, and follow-up dates"
    ];
  }
  if (/\bjob|hiring|hire|role|recruit\b/.test(lower)) {
    return [
      "Clarify target roles, locations, and constraints",
      "Find companies hiring for the exact profile",
      "Identify people who can refer or explain the team",
      "Draft role-specific messages and applications",
      "Track responses and next follow-ups"
    ];
  }
  if (/\bnetwork|people|investor|partner|opportunit/.test(lower)) {
    return [
      "Map the kind of people or organizations needed",
      "Search memory for existing warm paths",
      "Draft a first contact message through your persona",
      "Queue follow-ups in Now",
      "Capture new facts back into the brain"
    ];
  }
  return [
    "Translate the goal into concrete next actions",
    "Gather context from memory, files, and the current device",
    "Produce the first deliverable or draft",
    "Ask for approval before external sends or risky actions",
    "Store outcomes and update the mission state"
  ];
}

function toggleMissionStep(id: string): void {
  const mission = missionState();
  if (!mission) return;
  const milestones = mission.milestones.map((step) => (step.id === id ? { ...step, done: !step.done } : step));
  const done = milestones.filter((step) => step.done).length;
  const percent = milestones.length ? Math.round((done / milestones.length) * 100) : 0;
  const now = new Date().toISOString();
  saveMissionState({
    ...mission,
    milestones,
    percent,
    lastAssessment:
      percent === 100
        ? "Mission complete. The full loop has been marked done."
        : `${done}/${milestones.length} mission step${milestones.length === 1 ? "" : "s"} complete.`,
    updatedAt: now
  });
}

async function runMissionProspectSearch(): Promise<void> {
  const mission = missionState();
  if (!mission || missionRunning) return;
  if (!providerApiKey.trim()) {
    missionStatus = "Add and test a model key in Setup before Mission can search the live web.";
    render();
    return;
  }
  missionRunning = true;
  missionStatus = "Searching the live web for named targets and decision-makers…";
  render();
  try {
    const existing = missionProspects();
    const raw = await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      maxOutputTokens: 3000,
      useWebSearch: true,
      memoryContext: buildMemoryContext(),
      prompt: [
        `Mission: ${mission.goal}`,
        "Find up to 10 real, current targets and the specific decision-maker or contact relevant to the mission.",
        "Use live web results. Never invent a person, role, email, website, or profile. Leave unknown fields empty.",
        `Do not repeat these existing targets: ${existing.map((item) => `${item.name} at ${item.company}`).join(", ") || "none"}.`,
        "Return strict JSON only as {\"prospects\":[{\"name\":\"\",\"company\":\"\",\"role\":\"\",\"email\":\"\",\"website\":\"https://...\",\"linkedin\":\"https://...\",\"why\":\"\"}]}.",
        "Every result must include a company or person, a concise evidence-grounded reason, and at least one real URL."
      ].join("\n")
    });
    const parsed = parseJsonObject(raw);
    const candidates = Array.isArray(parsed?.prospects) ? parsed.prospects : [];
    const now = new Date().toISOString();
    const found = candidates
      .map((value): MissionProspect | null => normalizeMissionProspect(value, now))
      .filter((value): value is MissionProspect => Boolean(value));
    const deduped = [...existing, ...found].filter((item, index, all) => {
      const key = `${item.name}|${item.company}`.toLowerCase();
      return all.findIndex((candidate) => `${candidate.name}|${candidate.company}`.toLowerCase() === key) === index;
    });
    if (!found.length) throw new Error("No verifiable prospects came back. Add a location, industry, or buyer profile and try again.");
    saveMissionProspects(deduped);
    found.forEach((prospect) => {
      memoryStore.add({
        kind: "profile",
        title: prospect.name || prospect.company,
        body: [prospect.role, prospect.company, prospect.why, prospect.email, prospect.website, prospect.linkedin].filter(Boolean).join(" · "),
        tags: ["mission", "network", "person", "prospect", "brain"],
        source: "Mission web search"
      });
    });
    markMissionMilestones([0, 1], `Found ${found.length} live target${found.length === 1 ? "" : "s"}. Review them before drafting outreach.`);
    missionStatus = `${found.length} live target${found.length === 1 ? "" : "s"} found and saved to the brain.`;
  } catch (error) {
    missionStatus = error instanceof Error ? error.message : String(error);
  } finally {
    missionRunning = false;
    render();
  }
}

function normalizeMissionProspect(value: unknown, now: string): MissionProspect | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = cleanCommandSubject(typeof record.name === "string" ? record.name : "");
  const company = cleanCommandSubject(typeof record.company === "string" ? record.company : "");
  const role = cleanCommandSubject(typeof record.role === "string" ? record.role : "");
  const why = typeof record.why === "string" ? record.why.trim().slice(0, 800) : "";
  const emailValue = typeof record.email === "string" ? record.email.trim() : "";
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue) ? emailValue : "";
  const website = safeMissionUrl(record.website);
  const linkedin = safeMissionUrl(record.linkedin, /(^|\.)linkedin\.com$/i);
  if ((!name && !company) || !why || (!website && !linkedin)) return null;
  return {
    id: localId("prospect"),
    name,
    company,
    role,
    email,
    website,
    linkedin,
    why,
    status: "found",
    createdAt: now,
    updatedAt: now
  };
}

function safeMissionUrl(value: unknown, hostnamePattern?: RegExp): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || (hostnamePattern && !hostnamePattern.test(url.hostname))) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function markMissionMilestones(indices: number[], assessment: string): void {
  const mission = missionState();
  if (!mission) return;
  const selected = new Set(indices);
  const milestones = mission.milestones.map((step, index) => selected.has(index) ? { ...step, done: true } : step);
  const done = milestones.filter((step) => step.done).length;
  saveMissionState({
    ...mission,
    milestones,
    percent: milestones.length ? Math.round((done / milestones.length) * 100) : 0,
    lastAssessment: assessment,
    updatedAt: new Date().toISOString()
  });
}

async function draftMissionProspect(id: string): Promise<void> {
  const mission = missionState();
  const prospect = missionProspects().find((item) => item.id === id);
  if (!mission || !prospect) return;
  missionStatus = `Drafting for ${prospect.name || prospect.company} through your brain…`;
  missionRunning = true;
  render();
  try {
    const draft = hasTextModel()
      ? await generateWithProvider({
          provider: selectedProvider,
          apiKey: providerApiKey,
          model: modelName,
          maxOutputTokens: 900,
          memoryContext: buildMemoryContext(),
          prompt: [
            "Draft one concise, truthful outreach note in the user's established voice. Do not send it.",
            `Mission: ${mission.goal}`,
            `Recipient: ${prospect.name || "unknown"}`,
            `Role: ${prospect.role || "unknown"}`,
            `Company: ${prospect.company || "unknown"}`,
            `Why this target fits: ${prospect.why}`,
            "Use only the supplied facts. Return only the message body."
          ].join("\n")
        })
      : `Hi ${firstName(prospect.name || prospect.company)}, I’m reaching out because ${prospect.why}`;
    const now = new Date().toISOString();
    const app = prospect.email ? "Mail" : "LinkedIn";
    const task: NowTask = {
      id: localId("task"),
      contact: prospect.email || prospect.name || prospect.company,
      app,
      ...(prospect.linkedin || prospect.website ? { pkg: prospect.linkedin || prospect.website } : {}),
      text: mission.goal,
      draft: draft.trim(),
      status: "drafted",
      createdAt: now,
      updatedAt: now,
      source: "mission",
      screen: "mission"
    };
    saveNowTasks([task, ...nowTasks()]);
    recordOutbox({
      title: `Mission draft for ${prospect.name || prospect.company}`,
      target: prospect.name || prospect.company,
      channel: app,
      body: task.draft || "",
      why: "drafted from the current mission and held in Now for final review",
      status: "draft"
    });
    saveMissionProspects(missionProspects().map((item) => item.id === id ? { ...item, status: "drafted", updatedAt: now } : item));
    markMissionMilestones([2, 3], `Outreach for ${prospect.name || prospect.company} is staged in Now for your review.`);
    missionStatus = `Draft staged in Now for ${prospect.name || prospect.company}. Nothing was sent.`;
  } catch (error) {
    missionStatus = error instanceof Error ? error.message : String(error);
  } finally {
    missionRunning = false;
    render();
  }
}

function networkResults(query: string): MemoryItem[] {
  const tokens = searchTokens(query);
  if (!tokens.length) return [];
  return localMemories()
    .map((item) => ({ item, score: networkScore(item, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt))
    .map((entry) => entry.item)
    .slice(0, 12);
}

function networkScore(item: MemoryItem, tokens: string[]): number {
  const haystack = [item.title, item.body, item.source, ...item.tags].join(" ").toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length > 4 ? 2 : 1;
  }
  if (item.kind === "profile" || item.tags.includes("person")) score += 4;
  if (item.tags.includes("network")) score += 3;
  if (item.tags.includes("persona")) score += 1;
  return score;
}

function searchTokens(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !["the", "and", "for", "with", "who", "are", "you"].includes(token))
    )
  );
}

async function draftNetworkMessage(id: string): Promise<void> {
  const item = localMemories().find((candidate) => candidate.id === id);
  if (!item) return;
  const now = new Date().toISOString();
  const task: NowTask = {
    id: localId("task"),
    contact: item.title,
    app: item.source || "Messages",
    text: `Reach out using this brain context: ${item.body}`,
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    source: "network",
    screen: "network"
  };
  const draft = await buildTaskDraft(task);
  const staged: NowTask = { ...task, draft, status: "drafted", updatedAt: new Date().toISOString() };
  saveNowTasks([staged, ...nowTasks()]);
  recordOutbox({
    title: `Network draft for ${item.title}`,
    target: item.title,
    channel: item.source || "Network",
    body: draft,
    why: "drafted from the My network search and held in Now",
    status: "draft"
  });
  networkStatus = `Draft staged for ${item.title}. Open Now to approve or edit it.`;
}

async function createResearchPaper(topic: string): Promise<ResearchPaperRecord> {
  const cleanTopic = cleanCommandSubject(topic);
  const now = new Date().toISOString();
  const generated = hasTextModel() ? await generatePaperWithProvider(cleanTopic) : null;
  const fallback = localPaperDraft(cleanTopic);
  const paper: ResearchPaperRecord = {
    id: localId("paper"),
    title: generated?.title || fallback.title,
    topic: cleanTopic,
    abstract: generated?.abstract || fallback.abstract,
    outline: generated?.outline?.length ? generated.outline.slice(0, 7) : fallback.outline,
    draft: generated?.draft || fallback.draft,
    createdAt: now,
    updatedAt: now
  };
  saveResearchPapers([paper, ...researchPapers()]);
  memoryStore.add({
    kind: "paper",
    title: paper.title,
    body: `${paper.abstract}\n\n${paper.draft}`.slice(0, 80000),
    tags: ["paper", "research", "brain"],
    source: "research"
  });
  researchStatus = `Paper drafted: ${paper.title}`;
  return paper;
}

async function generatePaperWithProvider(topic: string): Promise<Partial<ResearchPaperRecord> | null> {
  try {
    const raw = await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      prompt:
        "Create a concise research paper draft for SlyOS. Return strict JSON with keys title, abstract, outline (array), and draft (markdown). No prose outside JSON.\n\n" +
        `Topic: ${topic}`,
      memoryContext: buildMemoryContext(),
      useWebSearch: true
    });
    const parsed = parseJsonObject(raw);
    if (!parsed) return { draft: raw };
    const paper: Partial<ResearchPaperRecord> = {};
    if (typeof parsed.title === "string") paper.title = parsed.title;
    if (typeof parsed.abstract === "string") paper.abstract = parsed.abstract;
    if (Array.isArray(parsed.outline)) {
      const outline = parsed.outline.filter((item): item is string => typeof item === "string");
      if (outline.length) paper.outline = outline;
    }
    if (typeof parsed.draft === "string") paper.draft = parsed.draft;
    return paper;
  } catch (error) {
    researchStatus = error instanceof Error ? error.message : String(error);
    return null;
  }
}

function localPaperDraft(topic: string): Pick<ResearchPaperRecord, "title" | "abstract" | "outline" | "draft"> {
  const title = paperTitle(topic);
  const memories = memoryStore.search(topic).slice(0, 5);
  const context = memories.length
    ? memories.map((item) => `- ${item.title}: ${item.body.slice(0, 220)}`).join("\n")
    : "- No direct memory hits yet; this draft marks assumptions and asks for sources.";
  const outline = [
    "Problem and motivation",
    "Relevant memory context",
    "Proposed approach",
    "Risks, constraints, and open questions",
    "Next experiments"
  ];
  const abstract = `A working paper on ${topic}, grounded in the local SlyOS brain and ready for source expansion.`;
  const draft = `# ${title}

## Abstract
${abstract}

## Brain Context
${context}

## Argument
${topic} needs to be evaluated through concrete user workflows, not vague capability claims. SlyOS should connect the user's memory, current device context, and approval-gated actions into one loop.

## Proposed Approach
1. Capture the user's goal and relevant memories.
2. Generate a plan with read-only context steps first.
3. Produce drafts, files, or device-control actions only after risk checks.
4. Write every meaningful result back into the brain.

## Open Questions
- Which sources should be imported before the next draft?
- Which device permissions are required for the intended workflow?
- What action should be staged in Now instead of executed immediately?
`;
  return { title, abstract, outline, draft };
}

function paperTitle(topic: string): string {
  const clean = cleanCommandSubject(topic).replace(/\bpaper\b/gi, "").trim() || "Untitled research";
  return clean
    .split(/\s+/)
    .map((word) => (word.length > 2 ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}` : word.toLowerCase()))
    .join(" ");
}

function savePaperToCowork(id: string): void {
  const paper = researchPapers().find((candidate) => candidate.id === id);
  if (!paper) return;
  const now = new Date().toISOString();
  const file: CoworkFileRecord = {
    id: localId("file"),
    name: `${slugify(paper.title) || "research-paper"}.md`,
    kind: "markdown",
    content: paper.draft,
    createdAt: now,
    updatedAt: now
  };
  saveCoworkFiles([file, ...coworkFiles()]);
  coworkStatus = `Saved ${file.name} from Research.`;
  screen = "cowork";
}

async function createCoworkFile(name: string, task: string): Promise<CoworkFileRecord> {
  const cleanTask = cleanCommandSubject(task || name);
  const safeName = sanitizeFileName(name || `${slugify(cleanTask) || "slyos-file"}.md`);
  const kind = safeName.endsWith(".json") ? "json" : safeName.endsWith(".txt") ? "text" : "markdown";
  const now = new Date().toISOString();
  const content = hasTextModel()
    ? await generateCoworkContentWithProvider(safeName, cleanTask)
    : localCoworkContent(safeName, cleanTask);
  const file: CoworkFileRecord = {
    id: localId("file"),
    name: safeName,
    kind,
    content,
    createdAt: now,
    updatedAt: now
  };
  saveCoworkFiles([file, ...coworkFiles()]);
  memoryStore.add({
    kind: "document",
    title: `Cowork: ${file.name}`,
    body: file.content,
    tags: ["cowork", "document", "brain"],
    source: "cowork"
  });
  coworkStatus = `Built ${file.name}.`;
  return file;
}

function createCoworkChat(title = "New chat"): CoworkChatRecord {
  const now = new Date().toISOString();
  const chat: CoworkChatRecord = {
    id: localId("cowork-chat"),
    title,
    turns: [],
    createdAt: now,
    updatedAt: now
  };
  saveCoworkChats([chat, ...coworkChats()]);
  coworkActiveChatId = chat.id;
  window.localStorage.setItem("slyos:coworkActiveChatId", chat.id);
  coworkShowFiles = false;
  return chat;
}

function activeCoworkChat(): CoworkChatRecord | null {
  if (!coworkActiveChatId) return null;
  const chat = coworkChats().find((item) => item.id === coworkActiveChatId) ?? null;
  if (!chat) {
    coworkActiveChatId = null;
    window.localStorage.removeItem("slyos:coworkActiveChatId");
  }
  return chat;
}

function addCoworkTurn(chatId: string, role: CoworkTurnRole, body: string): CoworkChatRecord | null {
  const chats = coworkChats();
  const current = chats.find((chat) => chat.id === chatId);
  if (!current) return null;
  const now = new Date().toISOString();
  const turn: CoworkTurn = { id: localId("turn"), role, body: body.trim(), createdAt: now };
  const firstUser = role === "user" && !current.turns.some((item) => item.role === "user");
  const updated: CoworkChatRecord = {
    ...current,
    title: firstUser ? cleanCommandSubject(body).slice(0, 64) || current.title : current.title,
    turns: [...current.turns, turn].slice(-120),
    updatedAt: now
  };
  saveCoworkChats(chats.map((chat) => chat.id === chatId ? updated : chat));
  return updated;
}

function deleteCoworkChat(id: string): void {
  saveCoworkChats(coworkChats().filter((chat) => chat.id !== id));
  if (coworkActiveChatId === id) {
    coworkActiveChatId = null;
    window.localStorage.removeItem("slyos:coworkActiveChatId");
  }
}

async function runCoworkAgent(): Promise<void> {
  const input = document.querySelector<HTMLTextAreaElement>("#cowork-chat-input");
  const request = input?.value.trim() ?? "";
  if (!request || agentBusy) return;
  const chat = activeCoworkChat() ?? createCoworkChat();
  addCoworkTurn(chat.id, "user", request);
  if (!hasTextModel()) {
    coworkStatus = "Add a cloud model key or enable an on-device text model before Cowork can run its file loop.";
    render();
    return;
  }
  coworkStatus = "Working step by step…";
  agentBusy = true;
  render();
  try {
    let completed = false;
    for (let step = 0; step < 14; step += 1) {
      const current = coworkChats().find((item) => item.id === chat.id);
      if (!current) throw new Error("The Cowork chat was removed while it was running.");
      const raw = await generateWithProvider({
        provider: selectedProvider,
        apiKey: providerApiKey,
        model: modelName,
        maxOutputTokens: 5000,
        memoryContext: buildMemoryContext(),
        prompt: coworkAgentPrompt(current)
      });
      const action = parseCoworkToolAction(raw);
      if (!action) {
        addCoworkTurn(chat.id, "agent", raw.trim());
        coworkStatus = "Cowork answered without changing a file.";
        completed = true;
        break;
      }
      if (action.done) {
        const message = action.message || "Done.";
        addCoworkTurn(chat.id, "agent", message);
        memoryStore.add({
          kind: "document",
          title: `Cowork: ${current.title}`,
          body: message,
          tags: ["cowork", "agent-response", "brain"],
          source: "cowork"
        });
        coworkStatus = message;
        completed = true;
        break;
      }
      const result = await executeCoworkTool(action);
      addCoworkTurn(chat.id, "step", `• ${action.tool}${action.name ? ` ${action.name}` : ""}\nRESULT: ${result}`);
      coworkStatus = `${action.tool}${action.name ? ` · ${action.name}` : ""}`;
      render();
    }
    if (!completed) {
      addCoworkTurn(chat.id, "agent", "Paused after 14 tool steps. Say “continue” and I will resume from the same workspace and transcript.");
      coworkStatus = "Paused after 14 steps; the chat is ready to continue.";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addCoworkTurn(chat.id, "agent", `Cowork stopped: ${message}`);
    coworkStatus = message;
  } finally {
    agentBusy = false;
    render();
  }
}

function coworkAgentPrompt(chat: CoworkChatRecord): string {
  const transcript = chat.turns.slice(-40).map((turn) => `${turn.role.toUpperCase()}: ${turn.body}`).join("\n\n");
  const files = coworkFiles().map((file) => `${file.name} (${file.content.length} chars)`).join(", ") || "none";
  return [
    "You are SlyOS Cowork, a local file-building agent. Work iteratively and inspect the workspace instead of guessing file contents.",
    "Take exactly one tool action per reply. Return strict JSON only.",
    "For a tool step: {\"done\":false,\"message\":\"\",\"tool\":\"list_files|read_file|write_file|append_file\",\"name\":\"file.ext\",\"content\":\"full or appended content\"}.",
    "When the user's request is genuinely complete: {\"done\":true,\"message\":\"concise result and files created\",\"tool\":\"\",\"name\":\"\",\"content\":\"\"}.",
    "Use list_files or read_file before editing an existing file. Never claim a file was created until a write_file or append_file RESULT says OK.",
    `Workspace now: ${files}.`,
    `Conversation and tool results:\n${transcript}`
  ].join("\n\n");
}

function parseCoworkToolAction(raw: string): CoworkToolAction | null {
  const parsed = parseJsonObject(raw);
  if (!parsed || typeof parsed.done !== "boolean") return null;
  const tool = typeof parsed.tool === "string" ? parsed.tool : "";
  const allowed = new Set(["", "list_files", "read_file", "write_file", "append_file"]);
  if (!allowed.has(tool)) return null;
  return {
    done: parsed.done,
    message: typeof parsed.message === "string" ? parsed.message.trim() : "",
    tool: tool as CoworkToolAction["tool"],
    name: typeof parsed.name === "string" ? sanitizeFileName(parsed.name) : "",
    content: typeof parsed.content === "string" ? parsed.content : ""
  };
}

async function coworkBridgeDirectory(): Promise<string | null> {
  if (nativePlatform !== "macos") return null;
  const payload = await deviceFetch("/capabilities");
  const allowedRoots = Array.isArray(payload.capabilities?.allowedRoots)
    ? payload.capabilities.allowedRoots.filter((item: unknown): item is string => typeof item === "string")
    : [];
  const root = allowedRoots.find((item: string) => /\/Documents\/?$/i.test(item)) ?? allowedRoots[0];
  return root ? `${root.replace(/\/$/, "")}/SlyOS/Cowork` : null;
}

async function executeCoworkTool(action: CoworkToolAction): Promise<string> {
  const files = coworkFiles();
  if (action.tool === "list_files") {
    const localRows = files.map((file) => `${file.name} · ${file.content.length} chars${file.lastWrittenPath ? ` · ${file.lastWrittenPath}` : ""}`);
    const directory = await coworkBridgeDirectory();
    if (directory) {
      await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "make_dir", path: directory }) });
      const payload = await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "list_dir", path: directory }) });
      const diskRows = Array.isArray(payload.result?.entries)
        ? payload.result.entries.map((entry: Record<string, unknown>) => `${String(entry.name ?? "")} · on Mac`)
        : [];
      return [...new Set([...localRows, ...diskRows])].join("\n") || "(no files yet)";
    }
    return localRows.join("\n") || "(no files yet)";
  }
  const current = files.find((file) => file.name.toLowerCase() === action.name.toLowerCase());
  if (action.tool === "read_file") {
    const directory = await coworkBridgeDirectory();
    const diskPath = current?.lastWrittenPath ?? (directory && action.name ? `${directory}/${action.name}` : "");
    if (diskPath) {
      try {
        const payload = await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "read_file", path: diskPath }) });
        const content = String(payload.result?.content ?? "");
        if (content) return content.slice(0, 30000);
      } catch {
        // Fall back to the app-scoped copy when a disk file moved outside SlyOS.
      }
    }
    return current ? current.content.slice(0, 30000) : `ERROR: ${action.name || "file"} does not exist`;
  }
  if ((action.tool === "write_file" || action.tool === "append_file") && !action.name) return "ERROR: file name missing";
  if (action.tool === "append_file" && !current) return `ERROR: ${action.name} does not exist; use write_file first`;
  if (action.tool === "write_file" || action.tool === "append_file") {
    const now = new Date().toISOString();
    const content = action.tool === "append_file" && current ? `${current.content}${action.content}` : action.content;
    const directory = await coworkBridgeDirectory();
    let writtenPath = current?.lastWrittenPath;
    if (directory) {
      await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "make_dir", path: directory }) });
      writtenPath = current?.lastWrittenPath ?? `${directory}/${action.name}`;
      const payload = await deviceFetch("/actions", {
        method: "POST",
        body: JSON.stringify({
          type: action.tool,
          path: writtenPath,
          content: action.tool === "append_file" ? action.content : content,
          overwrite: true
        })
      });
      writtenPath = String(payload.result?.path ?? writtenPath);
    }
    const file: CoworkFileRecord = {
      id: current?.id ?? localId("file"),
      name: action.name,
      kind: coworkFileKind(action.name),
      content,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      ...(writtenPath ? { lastWrittenPath: writtenPath } : {})
    };
    saveCoworkFiles([file, ...files.filter((item) => item.id !== file.id)]);
    memoryStore.add({
      kind: "document",
      title: `Cowork: ${file.name}`,
      body: file.content.slice(0, 80000),
      tags: ["cowork", "document", "brain"],
      source: "cowork"
    });
    return `OK: ${action.tool === "append_file" ? "appended to" : "wrote"} ${file.name} (${file.content.length} chars)${writtenPath ? ` at ${writtenPath}` : " in the SlyOS app workspace"}`;
  }
  return "ERROR: unsupported tool";
}

function coworkFileKind(name: string): CoworkFileRecord["kind"] {
  return name.toLowerCase().endsWith(".json") ? "json" : name.toLowerCase().endsWith(".txt") ? "text" : "markdown";
}

async function attachCoworkFiles(files: FileList | null): Promise<void> {
  if (!files?.length) return;
  const chat = activeCoworkChat() ?? createCoworkChat();
  for (const file of Array.from(files)) {
    const content = await readFileForBrain(file);
    if (!content.trim()) {
      addCoworkTurn(chat.id, "step", `• Could not read ${file.name}. Use a text-based PDF, TXT, MD, CSV, JSON, or HTML file.`);
      continue;
    }
    const now = new Date().toISOString();
    const name = sanitizeFileName(file.name);
    const existing = coworkFiles().find((item) => item.name.toLowerCase() === name.toLowerCase());
    const record: CoworkFileRecord = {
      id: existing?.id ?? localId("file"),
      name,
      kind: coworkFileKind(name),
      content,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    saveCoworkFiles([record, ...coworkFiles().filter((item) => item.id !== record.id)]);
    addCoworkTurn(chat.id, "step", `• Attached ${record.name} (${record.content.length} chars). Cowork can read it now.`);
  }
  coworkStatus = `${files.length} file${files.length === 1 ? "" : "s"} attached.`;
  render();
}

async function exportCoworkFile(id: string): Promise<void> {
  const file = coworkFiles().find((item) => item.id === id);
  if (!file) return;
  const blob = new Blob([file.content], { type: file.kind === "json" ? "application/json" : "text/plain" });
  const sharedFile = new File([blob], file.name, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [sharedFile] })) {
    await navigator.share({ files: [sharedFile], title: file.name });
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function generateCoworkContentWithProvider(name: string, task: string): Promise<string> {
  try {
    return await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      prompt: `Build the requested file content only. No wrapper text.\n\nFile: ${name}\nTask: ${task}`,
      memoryContext: buildMemoryContext()
    });
  } catch {
    return localCoworkContent(name, task);
  }
}

function localCoworkContent(name: string, task: string): string {
  if (name.endsWith(".json")) {
    return JSON.stringify(
      {
        task,
        createdBy: "SlyOS",
        status: "draft",
        nextSteps: ["Review content", "Add missing data", "Run through the brain again"]
      },
      null,
      2
    );
  }
  if (name.endsWith(".txt")) {
    return `SlyOS draft\n\nTask: ${task}\n\nNext steps:\n- Review the draft.\n- Add missing source data.\n- Ask SlyOS to revise with more context.\n`;
  }
  return `# ${paperTitle(task)}

## Task
${task}

## Draft
SlyOS created this file from the local brain. Add source material or a model key for richer generation.

## Next Steps
- Review for accuracy.
- Import any missing context.
- Ask SlyOS to revise or write this to Mac.
`;
}

async function writeCoworkFileToBridge(id: string): Promise<void> {
  const file = coworkFiles().find((candidate) => candidate.id === id);
  if (!file) return;
  await deviceAction(async () => {
    const payload = await deviceFetch("/capabilities");
    const allowedRoots = Array.isArray(payload.capabilities?.allowedRoots)
      ? payload.capabilities.allowedRoots
      : Array.isArray(payload.allowedRoots)
        ? payload.allowedRoots
        : [];
    const root = allowedRoots.find((item: unknown): item is string => typeof item === "string");
    if (!root) throw new Error("No writable bridge root is configured.");
    const path = `${root.replace(/\/$/, "")}/cowork/${sanitizeFileName(file.name)}`;
    const result = await deviceFetch("/actions", {
      method: "POST",
      body: JSON.stringify({ type: "write_file", path, content: file.content, overwrite: true })
    });
    const writtenPath = String(result.result?.path ?? path);
    saveCoworkFiles(
      coworkFiles().map((candidate) =>
        candidate.id === id ? { ...candidate, lastWrittenPath: writtenPath, updatedAt: new Date().toISOString() } : candidate
      )
    );
    coworkStatus = `Wrote ${file.name} to ${writtenPath}`;
    recordOutbox({
      title: `Wrote ${file.name}`,
      target: platformLabel(),
      channel: "Cowork",
      body: writtenPath,
      why: "file written through the local desktop bridge",
      status: "done"
    });
  });
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[/:\\?%*"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  if (!cleaned) return "slyos-file.md";
  return /\.[a-z0-9]{2,8}$/i.test(cleaned) ? cleaned : `${cleaned}.md`;
}

async function createJobApplication(input: {
  target: string;
  posting: string;
  resumeSource: string;
}): Promise<JobApplicationRecord> {
  if (!providerApiKey.trim()) throw new Error("Add and test a model key in Setup before generating an application.");
  const target = cleanCommandSubject(input.target || input.posting || "Job application");
  const raw = await generateWithProvider({
    provider: selectedProvider,
    apiKey: providerApiKey,
    model: modelName,
    maxOutputTokens: 2600,
    useWebSearch: true,
    memoryContext: buildMemoryContext(),
    prompt: [
      "Create a truthful, tailored job application from the supplied resume and posting.",
      "Never invent employment, education, metrics, skills, or credentials.",
      "Return strict JSON only with string keys tailoredResume, coverLetter, and outreachEmail.",
      `Target: ${target}`,
      `Posting or requirements:\n${input.posting}`,
      `Resume source:\n${input.resumeSource}`
    ].join("\n\n")
  });
  const parsed = parseJsonObject(raw);
  if (!parsed) throw new Error("The model did not return a valid application package. Try again with a shorter posting.");
  const tailoredResume = typeof parsed.tailoredResume === "string" ? parsed.tailoredResume.trim() : "";
  const coverLetter = typeof parsed.coverLetter === "string" ? parsed.coverLetter.trim() : "";
  const outreachEmail = typeof parsed.outreachEmail === "string" ? parsed.outreachEmail.trim() : "";
  if (!tailoredResume || !coverLetter || !outreachEmail) {
    throw new Error("The model returned an incomplete application package. Nothing was saved.");
  }
  const now = new Date().toISOString();
  const application: JobApplicationRecord = {
    id: localId("job"),
    target,
    posting: input.posting.trim(),
    resumeSource: input.resumeSource.trim(),
    tailoredResume,
    coverLetter,
    outreachEmail,
    createdAt: now,
    updatedAt: now
  };
  saveJobApplications([application, ...jobApplications()]);
  saveJobFiles(application);
  memoryStore.add({
    kind: "document",
    title: `Job application: ${application.target}`,
    body: `Prepared a tailored resume, cover letter, and outreach email for ${application.target}.`,
    tags: ["job", "application", "career", "brain"],
    source: "job"
  });
  jobStatus = `Prepared application for ${application.target}. Files are ready in Cowork.`;
  return application;
}

function saveJobFiles(application: JobApplicationRecord): void {
  const now = new Date().toISOString();
  const base = slugify(application.target) || "job-application";
  const files: CoworkFileRecord[] = [
    { id: localId("file"), name: `${base}-resume.md`, kind: "markdown", content: application.tailoredResume, createdAt: now, updatedAt: now },
    { id: localId("file"), name: `${base}-cover-letter.md`, kind: "markdown", content: application.coverLetter, createdAt: now, updatedAt: now },
    { id: localId("file"), name: `${base}-email.txt`, kind: "text", content: application.outreachEmail, createdAt: now, updatedAt: now }
  ];
  saveCoworkFiles([...files, ...coworkFiles()]);
}

async function buildMiniApp(description: string): Promise<MiniAppRecord> {
  if (!hasTextModel()) throw new Error("Add a cloud model key or enable an on-device text model before building an app.");
  const cleanDescription = description.trim();
  const raw = await generateWithProvider({
    provider: selectedProvider,
    apiKey: providerApiKey,
    model: modelName,
    maxOutputTokens: 5000,
    memoryContext: buildMemoryContext(),
    prompt: [
      "Build a polished, responsive, self-contained mini-app for SlyOS.",
      "Return exactly one line beginning NAME: followed by the app name, then a complete HTML document.",
      "Use only inline HTML, CSS, and JavaScript. Do not use remote assets, network requests, eval, or external libraries.",
      "The app must be touch friendly, keyboard accessible, functional at 320px width, and persist its own data when storage is available.",
      `App request: ${cleanDescription}`
    ].join("\n\n")
  });
  const generated = parseMiniAppResponse(raw, cleanDescription);
  const now = new Date().toISOString();
  const app: MiniAppRecord = {
    id: localId("app"),
    name: generated.name,
    description: cleanDescription,
    html: secureMiniAppHtml(generated.html),
    createdAt: now,
    updatedAt: now
  };
  saveMiniApps([app, ...miniApps()]);
  memoryStore.add({
    kind: "document",
    title: `Mini-app: ${app.name}`,
    body: `Built from: ${app.description}`,
    tags: ["architect", "app", "brain"],
    source: "architect"
  });
  architectStatus = `Built “${app.name}”.`;
  return app;
}

async function reviseMiniApp(id: string, instruction: string): Promise<MiniAppRecord> {
  const current = miniApps().find((candidate) => candidate.id === id);
  if (!current) throw new Error("That mini-app is no longer stored.");
  if (!hasTextModel()) throw new Error("Add a cloud model key or enable an on-device text model before updating an app.");
  const raw = await generateWithProvider({
    provider: selectedProvider,
    apiKey: providerApiKey,
    model: modelName,
    maxOutputTokens: 5000,
    memoryContext: buildMemoryContext(),
    prompt: [
      "Revise this self-contained mini-app without removing working behavior unless requested.",
      "Return exactly one line beginning NAME: followed by the app name, then the complete updated HTML document.",
      "Use no remote assets, network requests, eval, or external libraries.",
      `Requested change: ${instruction}`,
      `Current HTML:\n${current.html}`
    ].join("\n\n")
  });
  const generated = parseMiniAppResponse(raw, current.name);
  const updated = {
    ...current,
    name: generated.name,
    html: secureMiniAppHtml(generated.html),
    updatedAt: new Date().toISOString()
  };
  saveMiniApps(miniApps().map((candidate) => (candidate.id === id ? updated : candidate)));
  memoryStore.add({
    kind: "document",
    title: `Updated mini-app: ${updated.name}`,
    body: instruction.trim(),
    tags: ["architect", "app", "revision", "brain"],
    source: "architect"
  });
  return updated;
}

function parseMiniAppResponse(raw: string, fallbackName: string): { name: string; html: string } {
  const cleaned = raw.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const htmlIndexCandidates = [cleaned.search(/<!doctype\s+html/i), cleaned.search(/<html[\s>]/i)].filter((index) => index >= 0);
  const htmlIndex = htmlIndexCandidates.length ? Math.min(...htmlIndexCandidates) : -1;
  if (htmlIndex < 0) throw new Error("The model did not return a complete HTML app. Nothing was saved.");
  const prefix = cleaned.slice(0, htmlIndex);
  const html = cleaned.slice(htmlIndex).trim();
  const named = prefix.match(/NAME:\s*([^\n\r]+)/i)?.[1]?.trim();
  const titled = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const name = cleanCommandSubject(named || titled || fallbackName || "SlyOS app").slice(0, 54);
  if (!/<\/html>\s*$/i.test(html)) throw new Error("The generated app was cut off before completion. Nothing was saved.");
  return { name, html };
}

function secureMiniAppHtml(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:;">`;
  if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${policy}`);
  return html.replace(/<html([^>]*)>/i, `<html$1><head>${policy}</head>`);
}

function removeMiniApp(id: string): void {
  saveMiniApps(miniApps().filter((app) => app.id !== id));
  if (activeMiniAppId === id) activeMiniAppId = null;
}

function saveExpenseFromForm(): void {
  const merchant = document.querySelector<HTMLInputElement>("#expense-merchant")?.value.trim() ?? "";
  const amountRaw = document.querySelector<HTMLInputElement>("#expense-amount")?.value.trim() ?? "";
  const category = document.querySelector<HTMLInputElement>("#expense-category")?.value.trim() ?? "";
  const note = document.querySelector<HTMLInputElement>("#expense-note")?.value.trim() ?? "";
  const amount = Number(amountRaw.replace(/[^0-9. -]/g, ""));
  if (!merchant || !Number.isFinite(amount) || amount <= 0) {
    expensesStatus = "Merchant and a valid amount are required.";
    return;
  }
  logExpense({ merchant, amount, category: category || inferExpenseCategory(`${merchant} ${note}`), note });
}

function logExpense(input: { merchant: string; amount: number; category?: string; note?: string; currency?: string; date?: string }): ExpenseRecord {
  const now = new Date().toISOString();
  const record: ExpenseRecord = {
    id: localId("expense"),
    merchant: input.merchant,
    amount: Math.round(input.amount * 100) / 100,
    currency: input.currency ?? "USD",
    category: input.category || "General",
    note: input.note ?? "",
    date: input.date ?? now.slice(0, 10),
    createdAt: now,
    updatedAt: now
  };
  saveExpenseRecords([record, ...expenseRecords()]);
  memoryStore.add({
    kind: "expense",
    title: `Expense: ${record.merchant}`,
    body: `${formatMoney(record.amount, record.currency)} · ${record.category}${record.note ? ` · ${record.note}` : ""}`,
    tags: ["expense", "receipt", "brain", record.category.toLowerCase()],
    source: "expenses"
  });
  expensesStatus = `Logged ${formatMoney(record.amount, record.currency)} at ${record.merchant}.`;
  return record;
}

function parseExpensePrompt(prompt: string): { merchant: string; amount: number; category?: string; note?: string } | null {
  if (!/\b(spent|expense|receipt|invoice|purchase|bought|paid)\b/i.test(prompt)) return null;
  const amountMatch = prompt.match(/(?:\$|usd\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  if (!amountMatch?.[1]) return null;
  const amount = Number(amountMatch[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const merchant =
    prompt.match(/\b(?:at|to|from|for)\s+([A-Za-z0-9&' .-]{2,48}?)(?:\s+(?:for|on|as|category|because)\b|[.,;]|$)/i)?.[1]?.trim() ||
    prompt.match(/\b(?:spent|paid|bought|purchase(?:d)?)\s+(?:\$|usd\s*)?\d+(?:[.,]\d{1,2})?\s+([A-Za-z0-9&' .-]{2,48}?)(?:\s+(?:for|on|as|category|because)\b|[.,;]|$)/i)?.[1]?.trim() ||
    "Unknown merchant";
  const note = prompt.replace(amountMatch[0], "").trim();
  return { merchant: merchant.replace(/[.,;:!?]+$/g, ""), amount, category: inferExpenseCategory(prompt), note };
}

function inferExpenseCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(coffee|restaurant|lunch|dinner|breakfast|food|starbucks|doordash|uber eats)\b/.test(lower)) return "Food";
  if (/\b(uber|lyft|taxi|train|flight|gas|parking)\b/.test(lower)) return "Travel";
  if (/\b(aws|supabase|openai|github|software|domain|hosting|vercel)\b/.test(lower)) return "Software";
  if (/\b(hotel|airbnb|lodging)\b/.test(lower)) return "Lodging";
  return "General";
}

async function runLocalWorkflow(request: string): Promise<boolean> {
  const lower = request.toLowerCase();

  const checklistText = extractChecklistText(request);
  if (checklistText) {
    const item = addChecklistItem(checklistText);
    homeChecklistVisible = true;
    agentAnswer = `Added to checklist: ${item.text}`;
    return true;
  }
  if (/\b(show|open|view)\s+(my\s+)?(checklist|todo|to-do|tasks)\b/.test(lower)) {
    homeChecklistVisible = true;
    screen = "checklist";
    agentAnswer = "Checklist opened.";
    return true;
  }

  const emailMatch = request.match(/\b(?:write|draft|compose|send)\s+(?:an?\s+)?email(?:\s+to\s+([^,]+?))?(?:\s+(?:about|saying|for)\s+(.+))?$/i);
  if (emailMatch) {
    emailTo = cleanCommandSubject(emailMatch[1] ?? "");
    emailTopic = cleanCommandSubject(emailMatch[2] ?? request.replace(/\b(write|draft|compose|send|an?|email|to)\b/gi, " "));
    emailStatus = "Review the recipient and purpose, then generate through the brain.";
    screen = "email-compose";
    agentAnswer = "Email composer opened.";
    return true;
  }

  if (/\b(spicy post|constructive roast|post to reddit|post to x)\b/i.test(request)) {
    spicyTopic = cleanCommandSubject(request.replace(/\b(write|draft|create|make|a|spicy|post|constructive|roast|to|reddit|x|about|on)\b/gi, " "));
    spicyStatus = "Review the topic, then generate through the brain.";
    screen = "spicy";
    agentAnswer = "Spicy post opened.";
    return true;
  }

  const socialMatch = request.match(/\b(?:write|draft|compose|create|make)\s+(?:a\s+)?(?:linkedin|instagram|x|twitter)?\s*post(?:\s+(?:about|on)\s+(.+))?$/i);
  if (socialMatch) {
    composePlatform = /linkedin/i.test(request) ? "LinkedIn" : /instagram/i.test(request) ? "Instagram" : "X";
    composeTopic = cleanCommandSubject(socialMatch[1] ?? request.replace(/\b(write|draft|compose|create|make|a|linkedin|instagram|x|twitter|post|about|on)\b/gi, " "));
    composeStatus = "Review the topic, then generate through the brain.";
    screen = "compose";
    agentAnswer = "Post composer opened.";
    return true;
  }

  if (/\b(shop|buy|best price|compare prices|find.*price)\b/i.test(request)) {
    shopQuery = cleanCommandSubject(request.replace(/\b(shop|buy|find|me|the|best|price|compare|prices|for)\b/gi, " "));
    shopStatus = "Review the request, then run a live search.";
    screen = "shop";
    agentAnswer = "Shopping search opened.";
    return true;
  }

  if (/\b(who(?:'s| is) this|recognize (?:a )?face|face recognition|add (?:a )?person)\b/i.test(request)) {
    screen = "faces";
    agentAnswer = "Face recognition opened.";
    return true;
  }

  if (/\b(outreach|cold email|csv.*email|email.*csv)\b/i.test(request)) {
    outreachTopic = cleanCommandSubject(request.replace(/\b(create|make|draft|outreach|cold|emails?|from|a|csv|about|for)\b/gi, " "));
    outreachStatus = "Add the contact CSV to create review-gated drafts.";
    screen = "outreach";
    agentAnswer = "Outreach opened.";
    return true;
  }

  if (/\b(power|github repo|install.*repo|add.*repo)\b/i.test(request)) {
    powerQuery = cleanCommandSubject(request.replace(/\b(find|search|install|add|a|power|github|repo|repository|for)\b/gi, " "));
    screen = "store";
    agentAnswer = "Powers opened.";
    return true;
  }

  if (isJobRequest(request)) {
    jobTargetPrompt = cleanCommandSubject(request);
    jobStatus = providerApiKey.trim()
      ? "Add your resume and the posting, then generate through the brain."
      : "Add and test a model key in Setup before generating an application.";
    screen = "job";
    agentAnswer = "Job workspace opened.";
    return true;
  }

  if (isArchitectRequest(request)) {
    architectPrompt = cleanCommandSubject(
      request.replace(/\b(?:build|create|make|architect|an?|mini[- ]?app|tool)\b/gi, " ")
    );
    architectStatus = hasTextModel()
      ? "Describe the behavior precisely, then build it through the brain."
      : "Add a cloud model key or enable an on-device text model before building an app.";
    screen = "architect";
    agentAnswer = "Architect opened.";
    return true;
  }

  const missionGoal = extractMissionGoal(request);
  if (missionGoal) {
    startMission(missionGoal);
    screen = "mission";
    agentAnswer = `Mission set: ${missionGoal}`;
    return true;
  }

  const expense = parseExpensePrompt(request);
  if (expense) {
    logExpense(expense);
    screen = "expenses";
    agentAnswer = expensesStatus;
    return true;
  }

  const paperTopic = extractResearchTopic(request);
  if (paperTopic) {
    agentBusy = true;
    screen = "research";
    render();
    try {
      const paper = await createResearchPaper(paperTopic);
      agentAnswer = `Research paper drafted: ${paper.title}`;
    } finally {
      agentBusy = false;
    }
    return true;
  }

  const fileTask = extractCoworkTask(request);
  if (fileTask) {
    agentBusy = true;
    screen = "cowork";
    render();
    try {
      const file = await createCoworkFile(fileTask.name, fileTask.task);
      agentAnswer = `Cowork built ${file.name}.`;
    } finally {
      agentBusy = false;
    }
    return true;
  }

  const networkSearch = extractNetworkSearch(request);
  if (networkSearch) {
    networkQuery = networkSearch;
    const results = networkResults(networkQuery);
    networkStatus = results.length
      ? `Found ${results.length} local brain match${results.length === 1 ? "" : "es"}.`
      : "No local matches yet. Import contacts/history or save people memories first.";
    screen = "network";
    agentAnswer = networkStatus;
    return true;
  }

  return false;
}

async function runNativeReadWorkflow(request: string): Promise<boolean> {
  if (nativePlatform !== "ios" && (!deviceBridgeUrl || !deviceBridgeToken)) return false;
  const lower = request.toLowerCase();

  if (/\b(calendar|schedule|agenda|appointments?|meetings?)\b/.test(lower) && /\b(what|show|check|read|on|have|upcoming|today|tomorrow|week)\b/.test(lower)) {
    const range = calendarRangeForPrompt(lower);
    const action = { type: "calendar_events", start: range.start.toISOString(), end: range.end.toISOString(), limit: 40 };
    const payload = nativePlatform === "ios"
      ? await runIosDevicePrimitive(action)
      : await deviceFetch("/actions", { method: "POST", body: JSON.stringify(action) });
    const result = payload.result as Record<string, unknown> | undefined;
    const events = Array.isArray(result?.events) ? result.events : [];
    agentAnswer = events.length
      ? events.slice(0, 12).map((event: Record<string, unknown>) => formatNativeCalendarEvent(event)).join("\n")
      : `Nothing is scheduled ${range.label}.`;
    memoryStore.add({
      kind: "memory",
      title: `Calendar checked: ${range.label}`,
      body: agentAnswer,
      tags: ["calendar", "device", "brain"],
      source: platformLabel()
    });
    return true;
  }

  if (/\b(reminders?|to[ -]?dos?)\b/.test(lower) && /\b(what|show|check|read|list|have|upcoming|today|tomorrow|week|open)\b/.test(lower)) {
    const range = calendarRangeForPrompt(lower);
    const useRange = /\b(today|tomorrow|week|upcoming|due)\b/.test(lower);
    const action: DevicePrimitive = { type: "reminder_items", limit: 50 };
    if (useRange) {
      action.start = range.start.toISOString();
      action.end = range.end.toISOString();
    }
    const payload = nativePlatform === "ios"
      ? await runIosDevicePrimitive(action)
      : await deviceFetch("/actions", { method: "POST", body: JSON.stringify(action) });
    const result = payload.result as Record<string, unknown> | undefined;
    const reminders = Array.isArray(result?.reminders) ? result.reminders : [];
    agentAnswer = reminders.length
      ? reminders.slice(0, 20).map((reminder: Record<string, unknown>) => formatNativeReminder(reminder)).join("\n")
      : `No incomplete reminders matched${useRange ? ` ${range.label}` : ""}.`;
    memoryStore.add({
      kind: "memory",
      title: `Reminders checked${useRange ? `: ${range.label}` : ""}`,
      body: agentAnswer,
      tags: ["reminder", "task", "device", "brain"],
      source: platformLabel()
    });
    return true;
  }

  const contactQuery = extractNativeContactQuery(request);
  if (contactQuery) {
    const action = { type: "search_contacts", query: contactQuery, limit: 12 };
    const payload = nativePlatform === "ios"
      ? await runIosDevicePrimitive(action)
      : await deviceFetch("/actions", { method: "POST", body: JSON.stringify(action) });
    const result = payload.result as Record<string, unknown> | undefined;
    const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
    agentAnswer = contacts.length
      ? contacts.map((contact: Record<string, unknown>) => formatNativeContact(contact)).join("\n")
      : `No ${nativePlatform === "ios" ? "iPhone" : "Mac"} contact matched “${contactQuery}”.`;
    memoryStore.add({
      kind: "profile",
      title: `Contact lookup: ${contactQuery}`,
      body: agentAnswer,
      tags: ["contact", "person", "device", "brain"],
      source: platformLabel()
    });
    return true;
  }

  const fileQuery = extractNativeFileQuery(request);
  if (fileQuery) {
    const payload = await deviceFetch("/actions", {
      method: "POST",
      body: JSON.stringify({ type: "search_files", query: fileQuery, limit: 30 })
    });
    const files = Array.isArray(payload.result?.files) ? payload.result.files : [];
    agentAnswer = files.length
      ? files.slice(0, 12).map((file: Record<string, unknown>) => `${file.directory ? "Folder" : "File"}: ${String(file.path ?? file.name ?? "")}`).join("\n")
      : `No file matched “${fileQuery}” in Desktop, Documents, or Downloads.`;
    memoryStore.add({
      kind: "document",
      title: `File search: ${fileQuery}`,
      body: agentAnswer,
      tags: ["file", "device", "brain"],
      source: platformLabel()
    });
    return true;
  }

  return false;
}

function calendarRangeForPrompt(prompt: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/\btomorrow\b/.test(prompt)) {
    const start = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000), label: "tomorrow" };
  }
  if (/\btoday\b/.test(prompt)) {
    return { start: dayStart, end: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000), label: "today" };
  }
  return { start: now, end: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), label: "in the next seven days" };
}

function formatNativeCalendarEvent(event: Record<string, unknown>): string {
  const start = new Date(String(event.start ?? ""));
  const when = Number.isFinite(start.getTime())
    ? start.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Time unavailable";
  const location = String(event.location ?? "").trim();
  return `${String(event.title ?? "Untitled event")} · ${when}${location ? ` · ${location}` : ""}`;
}

function extractNativeContactQuery(request: string): string {
  if (!/\b(contact|contacts|phone number|mobile number|email address|address book)\b/i.test(request)) return "";
  const match = request.match(/\b(?:find|search|look up|show|what(?:'s| is))\s+(?:the\s+)?(?:contact|phone number|mobile number|email address)?\s*(?:for|of)?\s+(.+)$/i);
  return cleanCommandSubject(match?.[1] ?? request.replace(/\b(find|search|look|up|show|what|is|the|contact|contacts|phone|mobile|number|email|address|book|for|of)\b/gi, " "));
}

function formatNativeContact(contact: Record<string, unknown>): string {
  const phones = Array.isArray(contact.phones) ? contact.phones.map(String).filter(Boolean) : [];
  const emails = Array.isArray(contact.emails) ? contact.emails.map(String).filter(Boolean) : [];
  const organization = String(contact.organization ?? "").trim();
  return [String(contact.name ?? "Unnamed contact"), organization, phones.join(", "), emails.join(", ")].filter(Boolean).join(" · ");
}

function formatNativeReminder(reminder: Record<string, unknown>): string {
  const due = new Date(String(reminder.due ?? ""));
  const when = Number.isFinite(due.getTime())
    ? due.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "No due date";
  const notes = String(reminder.notes ?? "").trim();
  return `${String(reminder.title ?? "Untitled reminder")} · ${when}${notes ? ` · ${notes}` : ""}`;
}

function extractNativeFileQuery(request: string): string {
  const match =
    request.match(/\b(?:find|locate|search for|where(?:'s| is))\s+(?:my\s+)?(.+?)\s+(?:file|document|folder)s?\b/i) ||
    request.match(/\b(?:find|locate|search files? for)\s+(.+)$/i);
  return cleanCommandSubject(match?.[1] ?? "");
}

function isNativeReadRequest(request: string): boolean {
  const reminderRead = /\b(reminders?|to[ -]?dos?)\b/i.test(request) && /\b(what|show|check|read|list|have|upcoming|today|tomorrow|week|open)\b/i.test(request);
  return reminderRead || /\b(calendar|schedule|agenda|appointments?|meetings?|contact|contacts|phone number|mobile number|email address|address book)\b/i.test(request) || Boolean(extractNativeFileQuery(request));
}

function isJobRequest(prompt: string): boolean {
  return /\b(find me (?:a )?job|job hunt|job application|apply (?:to|for)|tailor (?:my )?resume|cover letter|resume for)\b/i.test(prompt);
}

function isArchitectRequest(prompt: string): boolean {
  return /\b(?:build|create|make|architect)\s+(?:me\s+)?(?:an?\s+)?(?:mini[- ]?)?(?:app|tool)\b/i.test(prompt);
}

function extractChecklistText(prompt: string): string {
  const patterns = [
    /\b(?:add|put|save)\s+(.+?)\s+(?:to|on|onto)\s+(?:my\s+)?(?:checklist|todo|to-do|task list)\b/i,
    /\b(?:checklist|todo|to-do|task)\s*[:\-]\s*(.+)$/i,
    /\bremember\s+(.+?)\s+as\s+(?:a\s+)?(?:task|todo|checklist item)\b/i
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match?.[1]) return cleanCommandSubject(match[1]);
  }
  return "";
}

function extractMissionGoal(prompt: string): string {
  const match =
    prompt.match(/\b(?:set|start|run|create)\s+(?:my\s+)?mission(?:\s+to)?\s+(.+)$/i) ||
    prompt.match(/\bmission\s*[:\-]\s*(.+)$/i);
  if (match?.[1]) return cleanCommandSubject(match[1]);
  const choice = missionChoices.find((item) => prompt.toLowerCase().includes(item.title.toLowerCase()));
  return choice?.title ?? "";
}

function extractResearchTopic(prompt: string): string {
  if (!/\b(research|paper|write-up|whitepaper)\b/i.test(prompt)) return "";
  const match =
    prompt.match(/\b(?:write|draft|create|make|start)\s+(?:a\s+)?(?:research\s+)?(?:paper|write-up|whitepaper)\s+(?:on|about|for)\s+(.+)$/i) ||
    prompt.match(/\bresearch\s+(?:paper\s+)?(?:on|about|for)?\s*(.+)$/i);
  return cleanCommandSubject(match?.[1] ?? prompt.replace(/\b(write|draft|create|make|start|research|paper|whitepaper|write-up)\b/gi, " "));
}

function extractCoworkTask(prompt: string): { name: string; task: string } | null {
  if (!/\b(cowork|file|markdown|document|doc|write|build|create|make)\b/i.test(prompt)) return null;
  if (/\b(research|paper|whitepaper)\b/i.test(prompt)) return null;
  const explicitName = prompt.match(/\b(?:file|as|named|called)\s+([A-Za-z0-9_. -]+\.(?:md|txt|json))\b/i)?.[1]?.trim() ?? "";
  const task = cleanCommandSubject(
    prompt.replace(/\b(?:cowork|create|make|build|write|a|an|new|file|document|markdown|doc)\b/gi, " ")
  );
  if (!task && !explicitName) return null;
  return {
    name: explicitName || `${slugify(task || "slyos-file") || "slyos-file"}.md`,
    task: task || `Create ${explicitName}`
  };
}

function extractNetworkSearch(prompt: string): string {
  const match =
    prompt.match(/\b(?:search|find|look for)\s+(?:my\s+)?(?:network|contacts|people)\s+(?:for|about)?\s*(.+)$/i) ||
    prompt.match(/\b(?:find|look for)\s+(.+?)\s+(?:in|from)\s+(?:my\s+)?(?:network|contacts|people)\b/i);
  if (match?.[1]) return cleanCommandSubject(match[1]);
  if (/\b(my network|contacts|people i know|investors|ctos|founders)\b/i.test(prompt)) return cleanCommandSubject(prompt);
  return "";
}

function cleanCommandSubject(value: string): string {
  return value
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
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
  if (!hasTextModel()) {
    proposals.push({
      id: "model",
      title: "Connect a model",
      subtitle: "Add a cloud key or enable an on-device text model for replies, drafts, memory answers, and Cowork.",
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

function reflexSkills(): ReflexSkill[] {
  return readJsonStorage<ReflexSkill[]>(reflexSkillsKey, [])
    .filter(isReflexSkill)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveReflexSkills(skills: ReflexSkill[]): void {
  writeJsonStorage(reflexSkillsKey, skills.filter(isReflexSkill).slice(0, 100));
}

function isReflexSkill(value: unknown): value is ReflexSkill {
  if (!value || typeof value !== "object") return false;
  const skill = value as Record<string, unknown>;
  return (
    typeof skill.id === "string" &&
    typeof skill.name === "string" &&
    typeof skill.instruction === "string" &&
    Array.isArray(skill.steps) &&
    skill.steps.every((step) => Boolean(step && typeof step === "object" && typeof (step as Record<string, unknown>).type === "string")) &&
    typeof skill.createdAt === "string" &&
    typeof skill.updatedAt === "string"
  );
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

function syncedVaultEnvelope(): SyncedVaultEnvelope | null {
  const raw = window.localStorage.getItem(syncedVaultKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SyncedVaultEnvelope>;
    return typeof value.cipherBlob === "string" && typeof value.salt === "string" && typeof value.updatedAt === "number"
      ? value as SyncedVaultEnvelope
      : null;
  } catch {
    return null;
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
  else if (!syncUserId) blockers.push("Sign in to sync your brain");
  if (nativePlatform !== "ios" && !deviceBridgeHealthy()) {
    blockers.push("Check the Mac device bridge");
  }
  if (nativePlatform === "macos" && devicePermissionStatus.sessionLocked) {
    blockers.push("Unlock Mac for device control");
  } else if (nativePlatform === "macos" && devicePermissionStatus.checked && devicePermissionStatus.screenRecording === false) {
    blockers.push("Grant Mac Screen Recording");
  }
  if (nativePlatform === "macos" && !devicePermissionStatus.sessionLocked && devicePermissionStatus.checked && devicePermissionStatus.accessibility === false) {
    blockers.push("Grant Mac Accessibility");
  }
  return blockers;
}

function deviceBridgeHealthy(): boolean {
  return /^(?:bridge online|device observed|ran \d+ step|completed in )/i.test(deviceBridgeStatus);
}

function buildMemoryContext(query = ""): string {
  const profile = [
    profileName ? `Name: ${profileName}` : "",
    aboutYou ? `About the user: ${aboutYou}` : "",
    profileVoice ? `Voice/persona: ${profileVoice}` : "",
    profileEmail ? `Email: ${profileEmail}` : "",
    profilePhone ? `Phone: ${profilePhone}` : "",
    profileAddress ? `Address: ${profileAddress}` : "",
    bookingLink ? `Booking link: ${bookingLink}` : ""
  ].filter(Boolean);
  const relevant = query.trim() ? memoryStore.search(query).slice(0, 40) : [];
  const recent = localMemories().slice(0, query.trim() ? 12 : 32);
  const persistentProfiles = localMemories().filter((item) => item.kind === "profile").slice(0, 20);
  const seen = new Set<string>();
  const memories = [...persistentProfiles, ...relevant, ...recent]
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map((item) => `${item.kind}: ${item.title} - ${item.body}`);
  const powerInstructions = powerRecords()
    .filter((power) => power.enabled && power.type === "skill" && power.instructions)
    .map((power) => `Active power - ${power.name}: ${power.instructions}`);
  const mission = missionState();
  const missionContext = mission
    ? [`Active mission: ${mission.goal}`, `Mission progress: ${mission.percent}% - ${mission.lastAssessment}`]
    : [];
  const conversation = homeConversation()
    .slice(-10)
    .map((turn) => `Recent ${turn.role}: ${turn.body}`);
  return [...profile, ...missionContext, ...powerInstructions, ...conversation, ...memories]
    .join("\n")
    .slice(0, 28_000);
}

function navigate(next: ShellScreen): void {
  if (screen === "look" && next !== "look") stopLookCamera();
  if (screen === "voice" && next !== "voice") stopVoiceListening();
  if (next !== "manual") agentPaused = false;
  screen = next;
  const params = new URLSearchParams(window.location.search);
  params.set("screen", screen);
  if (nativePlatform) params.set("native", nativePlatform);
  history.replaceState(null, "", `?${params.toString()}`);
  render();
}

function render(): void {
  try {
    renderShell();
    (window as Window & { __slyosLastError?: string; __slyosScreen?: string }).__slyosScreen = screen;
  } catch (error) {
    reportRuntimeFailure(`render.${screen}`, error);
    const message = error instanceof Error ? error.message : String(error);
    appRoot.innerHTML = `
      <main class="os-stage">
        <section class="device-shell runtime-failure" aria-label="SlyOS recovery">
          <div>
            <span>SlyOS recovery</span>
            <h1>The shell hit a runtime error.</h1>
            <p>${escapeHtml(message)}</p>
            <button type="button" onclick="window.location.reload()">Reload SlyOS</button>
          </div>
        </section>
      </main>
    `;
  }
}

function renderShell(): void {
  syncRouteToScreen();
  appRoot.innerHTML = `
    <main class="os-stage">
      <section class="device-shell ${screen === "boot" ? "booting" : ""} ${agentBusy ? "agent-active" : ""}" aria-label="SlyOS shell">
        <div class="screen-body ${["voice", "app-view"].includes(screen) ? "edge-to-edge" : ""}">
          ${renderScreen()}
        </div>
        ${shouldShowNav(screen) ? renderBottomNav() : ""}
        ${agentBusy ? renderEdgeShimmer() : ""}
        <div class="busy-dog" aria-hidden="true"><span></span></div>
      </section>
    </main>
  `;
  wireEvents();
}

function reportRuntimeFailure(context: string, value: unknown): void {
  const message = value instanceof Error ? `${value.message}\n${value.stack ?? ""}` : String(value);
  const detail = `${context}: ${message}`.slice(0, 1200);
  (window as Window & { __slyosLastError?: string }).__slyosLastError = detail;
  console.error("SlyOS runtime failure", context, value);
  recordDiagnostic("runtime", "error", detail);
  try {
    (window as any).webkit?.messageHandlers?.slyosLog?.postMessage(`runtime: ${detail}`);
  } catch {
    // The native logger is optional in browsers and on iOS previews.
  }
}

function syncRouteToScreen(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("screen") === screen && (!nativePlatform || params.get("native") === nativePlatform)) return;
  params.set("screen", screen);
  if (nativePlatform) params.set("native", nativePlatform);
  history.replaceState(null, "", `?${params.toString()}`);
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
    case "profile":
      return renderProfileSettings();
    case "efficiency":
      return renderEfficiency();
    case "appearance":
      return renderAppearance();
    case "lock-settings":
      return renderLockSettings();
    case "account":
      return renderAccount();
    case "diagnostics":
      return renderDiagnostics();
    case "permissions":
      return renderPermissions();
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
    case "job":
      return renderJob();
    case "architect":
      return renderArchitect();
    case "app-view":
      return renderAppView();
    case "chat":
      return renderChat();
    case "operate":
      return renderOperate();
    case "skill":
      return renderSkill();
    case "checklist":
      return renderChecklist();
    case "documents":
      return renderDocuments();
    case "faces":
      return renderFaces();
    case "shop":
      return renderShop();
    case "compose":
      return renderCompose();
    case "email-compose":
      return renderEmailCompose();
    case "spicy":
      return renderSpicy();
    case "outreach":
      return renderOutreach();
    case "store":
      return renderStore();
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
  const conversation = homeConversation().slice(-4);
  const statusLeft = new Date().toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  const statusRight = agentBusy ? "thinking" : blockers.length ? `${blockers.length} setup` : "ready";
  const owner = firstName(profileName);
  if (!installedAppsAttempted && !installedAppsLoading && nativePlatform !== "ios") {
    queueMicrotask(() => void loadInstalledApps());
  }
  const appSeed = promptText.trim().toLowerCase();
  const appMatches = appSeed.length >= 2 && !appSeed.includes(" ")
    ? installedApps
        .filter((app) => app.label.toLowerCase().startsWith(appSeed))
        .concat(installedApps.filter((app) => !app.label.toLowerCase().startsWith(appSeed) && app.label.toLowerCase().includes(appSeed)))
        .slice(0, 3)
    : [];
  for (const app of appMatches) queueMicrotask(() => void loadInstalledAppIcon(app));
  return `
    <div class="home-screen">
      <div class="home-status">
        <span>${escapeHtml(statusLeft)}</span>
        <span>${escapeHtml(statusRight)}</span>
      </div>
      ${blockers.length ? `<button class="setup-warning home-permission" type="button" data-screen="setup">${escapeHtml(blockers[0] ?? "Open setup")}</button>` : ""}
      <div class="home-spacer" aria-hidden="true"></div>
      <div class="home-greeting">
        <div class="prompt-title">what should happen${owner && owner !== "there" ? `, ${escapeHtml(owner)}` : ""}?</div>
        <span></span>
      </div>
      ${appMatches.length ? `<div class="home-app-matches">${appMatches.map(renderHomeAppMatch).join("")}</div>` : ""}
      ${conversation.length ? `<div class="home-conversation" aria-live="polite">${conversation.map(renderHomeTurn).join("")}</div>` : ""}
      <form id="prompt-form" class="ask-row">
        <input id="prompt-input" value="${escapeAttr(promptText)}" autocomplete="off" placeholder="ask me anything…" />
        <button class="camera-button" type="button" data-screen="look" aria-label="Look">${materialIcon("photoCamera")}</button>
        <button class="send-button" type="submit">${agentBusy ? "Run" : "Send"}</button>
      </form>
      ${agentBusy ? `<section class="agent-answer thinking-answer">${renderSlyOrbit(34)}<p>thinking…</p></section>` : conversation.length ? "" : agentAnswer ? `<section class="agent-answer"><span>SlyOS</span><p>${escapeHtml(agentAnswer)}</p></section>` : ""}
      ${homeChecklistVisible ? renderChecklistCard("home") : ""}
      <button class="talk-target home-talk" type="button" data-screen="voice">
        <div class="ring">●</div>
        <div>tap to talk</div>
      </button>
      <div class="home-bottom-spacer" aria-hidden="true"></div>
    </div>
  `;
}

function renderHomeTurn(turn: HomeConversationTurn): string {
  return `<article class="home-turn ${turn.role}"><span>${turn.role === "user" ? "You" : "SlyOS"}</span><p>${escapeHtml(turn.body)}</p></article>`;
}

function renderHomeAppMatch(app: NativeAppEntry): string {
  const icon = installedAppIcons.get(app.app);
  return `<button type="button" data-open-installed-app="${escapeAttr(app.app)}"><span>${icon ? `<img src="${escapeAttr(icon)}" alt="" />` : escapeHtml(app.label.slice(0, 1).toUpperCase())}</span><small>${escapeHtml(app.label.slice(0, 10))}</small></button>`;
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
  const summary = nowDigest || (tasks.length
    ? `SlyOS has ${tasks.length} item${tasks.length === 1 ? "" : "s"} waiting and ${proposals.length} suggestion${proposals.length === 1 ? "" : "s"} ready.`
    : `SlyOS is quiet with ${memoryCount} local memor${memoryCount === 1 ? "y" : "ies"} and ${outputCount} sent-for-you record${outputCount === 1 ? "" : "s"}.`);
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
          ${agentBusy ? renderSlyOrbit(16) : `<button type="button" data-refresh-now="true">↻</button>`}
        </div>
        ${agentBusy ? `<div class="now-reading">${renderSlyOrbit(18)}<span>reading your day</span></div>` : `<p>${escapeHtml(summary)}</p><strong>${escapeHtml(nowTextBack(tasks, proposals))}</strong>`}
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

async function refreshNowDigest(): Promise<void> {
  const tasks = taskFeed();
  const proposals = proposalFeed();
  const sent = outboxRecords().slice(0, 8);
  if (!hasTextModel()) {
    nowDigest = tasks.length
      ? `You have ${tasks.length} item${tasks.length === 1 ? "" : "s"} waiting and ${proposals.length} suggestion${proposals.length === 1 ? "" : "s"} ready.`
      : "You're all caught up.";
    render();
    return;
  }

  agentBusy = true;
  render();
  try {
    nowDigest = await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      memoryContext: buildMemoryContext(),
      maxOutputTokens: 500,
      prompt: [
        "Write a concise SlyOS 'What you missed' briefing for the owner.",
        "Prioritize what needs attention, mention quiet state plainly, and end with one direct next action.",
        "Do not invent events, people, messages, or urgency.",
        `Waiting items: ${JSON.stringify(tasks.map((task) => ({ contact: task.contact, app: task.app, text: task.text, status: task.status })))}`,
        `Suggestions: ${JSON.stringify(proposals.map((proposal) => ({ title: proposal.title, subtitle: proposal.subtitle })))}`,
        `Recent sent-for-you: ${JSON.stringify(sent.map((record) => ({ target: record.target, channel: record.channel, status: record.status })))}`
      ].join("\n")
    });
  } catch (error) {
    nowDigest = error instanceof Error ? error.message : String(error);
  } finally {
    agentBusy = false;
    render();
  }
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
  const isCalendarTask = Boolean(task.calendarEvent);
  const canNativeSend = nativePlatform === "macos" && (task.app === "Mail" || task.app === "Messages");
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
              : `${isCalendarTask ? "" : `<button type="button" data-task-draft="${escapeAttr(task.id)}">${task.draft ? "Regenerate" : "Draft"}</button>`}
                 <button type="button" data-task-send="${escapeAttr(task.id)}" ${task.draft ? "" : "disabled"}>${isCalendarTask ? "Add to Calendar" : canNativeSend ? "Send" : "Open draft"}</button>
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
  if (blocker.includes("Sign in")) return "Sign in with the same SlyOS account used on Android, then pull the brain.";
  return "Start the local Mac bridge and check it so SlyOS can observe and operate this computer.";
}

function blockerScreen(blocker: string): ShellScreen {
  if (blocker.includes("API")) return "models";
  if (blocker.includes("Supabase")) return "backup";
  if (blocker.includes("Sign in")) return "account";
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
        <button class="text-button settings-button" type="button" data-screen="memory-settings">${materialIcon("settings")}<span>Settings</span></button>
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
        ${shown.length ? renderBrainCanvas("memory") : `<p>No memory nodes yet. Import or add a memory to grow the brain.</p>`}
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
    { title: syncUserId ? `Welcome, ${firstName(profileName || supabaseEmail)}` : "Account", subtitle: syncUserId ? `${supabaseEmail || "Signed in"} · ${syncStatus}` : "Sign in to fetch and sync your brain", screen: "account" },
    { title: "Character", subtitle: profileVoice || "How the agent should sound like you", screen: "profile" },
    { title: "Your details", subtitle: profileName || "Name, contact, and profile context", screen: "profile" },
    { title: "API keys & model", subtitle: providerStatus, screen: "setup" },
    { title: "Efficiency", subtitle: `${agentResponses().length} agent output${agentResponses().length === 1 ? "" : "s"} stored`, screen: "efficiency" },
    { title: "On-device model", subtitle: "Available per platform when native runtimes are installed", screen: "models" },
    { title: "Device permissions", subtitle: nativePlatform === "macos" ? permissionSummary() : "Camera, microphone, files, and Shortcuts", screen: "permissions" },
    { title: "Appearance", subtitle: darkMode ? "Dark mode · on" : "Dark mode · off", screen: "appearance" },
    { title: "Investing", screen: "investing" },
    { title: "Banking link", screen: "vault" },
    { title: "Talk to your agent", screen: "voice" },
    { title: "Your writing voice", ...(profileVoice ? { subtitle: profileVoice } : {}), screen: "setup" },
    { title: "Persona per platform", screen: "per-app" },
    { title: "Your uploads", subtitle: `${localMemories().length} local brain item${localMemories().length === 1 ? "" : "s"}`, screen: "documents" },
    { title: "Import & voice", screen: "imports" },
    { title: "Teach a skill", subtitle: `${skillMemories().length} saved`, screen: "skill" },
    { title: "Models & spending", subtitle: `${providerLabel()} · ${modelName}`, screen: "models" },
    { title: "Connections", subtitle: syncStatus, screen: "account" },
    { title: "Per-app responses", screen: "per-app" },
    { title: "Document Q&A", screen: "documents" },
    { title: "Lock screen", subtitle: automationPrefs().lockScreenBrief ? "SlyOS brief · on" : "SlyOS brief · off", screen: "lock-settings" },
    { title: "Floating nav panel", subtitle: deviceBridgeStatus, screen: "floating-nav" },
    { title: "Brain backup", subtitle: syncStatus, glyph: "shield", screen: "backup" },
    { title: "Diagnostics", subtitle: `${diagnosticsEvents().length} local event${diagnosticsEvents().length === 1 ? "" : "s"} · ${deviceBridgeStatus}`, screen: "diagnostics" }
  ];
  return `
    <div class="panel-screen memory-settings-screen">
      ${screenHeader("Memory", "memory")}
      <div class="build-pill">✦ Settings build v30 · runtime diagnostics</div>
      <div class="settings-list">
        ${cards.map(renderSettingsCard).join("")}
      </div>
      <p class="privacy-note">The agent reads this on every request. Nothing here leaves your phone except as part of a prompt you trigger.</p>
    </div>
  `;
}

function renderProfileSettings(): string {
  return `
    <div class="panel-screen profile-settings-screen">
      ${screenHeader("Memory", "memory-settings")}
      <form id="profile-settings-form" class="stack-form profile-settings-form">
        <div class="eyebrow">Character</div>
        <h3>What should the agent know about you?</h3>
        <p class="screen-subtitle">Name, tone, work, people who matter, and context that should ground every request.</p>
        <textarea id="profile-about" class="profile-about" placeholder="e.g. Keep replies short and warm. I work nights…">${escapeHtml(aboutYou)}</textarea>
        <textarea id="profile-voice" placeholder="How SlyOS should sound when writing as you…">${escapeHtml(profileVoice)}</textarea>
        <div class="eyebrow">Your details</div>
        <div class="sync-grid profile-detail-grid">
          <input id="profile-full-name" value="${escapeAttr(profileName)}" placeholder="Full name" />
          <input id="profile-email" value="${escapeAttr(profileEmail)}" inputmode="email" placeholder="Email" />
          <input id="profile-phone" value="${escapeAttr(profilePhone)}" inputmode="tel" placeholder="Phone" />
          <input id="profile-booking" value="${escapeAttr(bookingLink)}" inputmode="url" placeholder="Booking link" />
        </div>
        <textarea id="profile-address" placeholder="Shipping address">${escapeHtml(profileAddress)}</textarea>
        <button class="primary-wide orange" type="submit">Save to brain</button>
      </form>
    </div>
  `;
}

function renderEfficiency(): string {
  const days = efficiencyHistory();
  const recentMinutes = days.slice(-7).reduce((sum, day) => sum + day.minutes, 0);
  const priorMinutes = days.slice(0, 7).reduce((sum, day) => sum + day.minutes, 0);
  const score = Math.min(100, Math.round(recentMinutes / 4.2));
  const trend = priorMinutes ? Math.round(((recentMinutes - priorMinutes) / priorMinutes) * 100) : recentMinutes ? 100 : 0;
  const maxMinutes = Math.max(1, ...days.map((day) => day.minutes));
  return `
    <div class="panel-screen efficiency-screen">
      ${screenHeader("Efficiency", "memory-settings")}
      <section class="efficiency-score">
        <div><strong>${score}</strong><span>/100</span></div>
        <b class="${trend >= 0 ? "up" : "down"}">${trend >= 0 ? "▲ +" : "▼ "}${trend}%</b>
      </section>
      <p class="screen-subtitle">vs last week · ~${recentMinutes >= 60 ? `${Math.floor(recentMinutes / 60)}h ${recentMinutes % 60}m` : `${recentMinutes} min`} saved this week</p>
      <div class="efficiency-chart" aria-label="14 day estimated time saved">
        ${days.map((day, index) => `<i style="height:${Math.max(3, Math.round((day.minutes / maxMinutes) * 100))}%" class="${index === days.length - 1 ? "today" : ""}" title="${escapeAttr(`${day.label}: ${day.minutes} minutes`)}"></i>`).join("")}
      </div>
      <p class="privacy-note">Estimated from completed SlyOS actions and sent-for-you records. One hour saved per day maps to a score of 100.</p>
    </div>
  `;
}

function efficiencyHistory(): Array<{ label: string; minutes: number }> {
  const now = new Date();
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - index));
    const key = date.toISOString().slice(0, 10);
    const completed = outboxRecords().filter((record) => record.createdAt.slice(0, 10) === key && ["done", "sent", "recalled"].includes(record.status));
    const agentTurns = localMemories().filter((item) => item.createdAt.slice(0, 10) === key && item.tags.includes("agent-response"));
    return {
      label: date.toLocaleDateString([], { month: "short", day: "numeric" }),
      minutes: completed.length * 4 + agentTurns.length * 2
    };
  });
}

function renderAppearance(): string {
  return `
    <div class="panel-screen appearance-screen">
      ${screenHeader("Appearance", "memory-settings")}
      <section class="brief-card">
        <div class="brief-head"><span>Dark mode</span><button type="button" data-theme-toggle="true">${darkMode ? "On" : "Off"}</button></div>
        <p>Applies to the launcher, Memory, workflows, and native Mac/iPhone shell.</p>
      </section>
      <div class="appearance-preview ${darkMode ? "dark" : "light"}"><span>SlyOS</span><strong>what should happen?</strong><i></i></div>
    </div>
  `;
}

function renderLockSettings(): string {
  const prefs = automationPrefs();
  return `
    <div class="panel-screen lock-settings-screen">
      ${screenHeader("Lock screen", "memory-settings")}
      <p class="screen-subtitle">The SlyOS lock surface shows real brain priorities before the launcher opens. Apple keeps control of the physical device lock screen.</p>
      <section class="brief-card automation-card">
        <div class="pref-list">
          ${renderPrefToggle("lockScreenBrief", "Lock-screen brief", "Show setup blockers, recent memory, and waiting actions.", prefs.lockScreenBrief)}
          ${renderPrefToggle("totalRecall", "Remember operated screens", "Save completed device-control observations into the brain.", prefs.totalRecall)}
          ${renderPrefToggle("floatingNav", "SlyOS launcher bar", floatingNavCopy(), prefs.floatingNav)}
        </div>
      </section>
      <button class="primary-wide orange" type="button" data-screen="lock">Preview SlyOS lock screen</button>
    </div>
  `;
}

function renderAccount(): string {
  const identity = syncUserId ? (supabaseEmail || syncUserId.slice(0, 8)) : "Not signed in";
  return `
    <div class="panel-screen account-screen">
      ${screenHeader("Account & sync", "memory-settings")}
      <section class="account-banner ${syncUserId ? "signed-in" : ""}">
        <span>${escapeHtml(firstName(profileName || supabaseEmail || "S" ).slice(0, 1).toUpperCase())}</span>
        <div><strong>${syncUserId ? `Welcome, ${escapeHtml(firstName(profileName || supabaseEmail))}` : "You're not signed in"}</strong><small>${escapeHtml(identity)} · ${escapeHtml(syncStatus)}</small></div>
      </section>
      ${syncUserId ? `
        <p class="screen-subtitle">This account is the cross-device identity for Brain memories and settings. New local brain records are pushed after prompts.</p>
        <div class="button-pair account-sync-actions">
          <button id="sync-pull" type="button">${syncBusy ? "Syncing…" : "Pull brain"}</button>
          <button id="sync-push" type="button">Push brain</button>
          <button id="sync-signout" type="button">Sign out</button>
        </div>
      ` : renderSetupAccount()}
      <div class="account-stats">
        <span><strong>${localMemories().length}</strong> local brain items</span>
        <span><strong>${memoryStore.listSettings().length}</strong> portable settings</span>
      </div>
    </div>
  `;
}

function renderDiagnostics(): string {
  if (!diagnosticsLoaded && nativePlatform !== "ios") {
    diagnosticsLoaded = true;
    queueMicrotask(() => void loadDeviceDiagnostics());
  }
  const events = diagnosticsEvents();
  return `
    <div class="panel-screen diagnostics-screen">
      ${screenHeader("Diagnostics", "memory-settings")}
      <p class="screen-subtitle">Local runtime evidence for account sync, memory creation, provider calls, and device-control actions. Prompt text and keys are not written to these logs.</p>
      <div class="diagnostic-health">
        ${diagnosticHealthRow("Device bridge", deviceBridgeStatus, deviceBridgeHealthy())}
        ${nativePlatform === "macos" ? diagnosticHealthRow("Screen access", permissionSummary(), devicePermissionStatus.screenRecording === true && devicePermissionStatus.accessibility === true) : ""}
        ${diagnosticHealthRow("Account", syncUserId ? `signed in · ${syncUserId.slice(0, 8)}` : "not signed in", Boolean(syncUserId))}
        ${diagnosticHealthRow("Brain", `${localMemories().length} items · ${memoryStore.listSettings().length} settings`, localMemories().length > 0)}
        ${diagnosticHealthRow("Model", `${providerLabel()} · ${providerStatus}`, Boolean(providerApiKey))}
      </div>
      <div class="button-pair diagnostic-actions">
        <button id="diagnostics-refresh" type="button">Refresh</button>
        ${nativePlatform === "macos" ? `<button id="diagnostics-open" type="button">Open log folder</button>` : ""}
        <button id="diagnostics-clear" type="button">Clear app events</button>
      </div>
      ${deviceDiagnosticPath ? `<p class="diagnostic-path">${escapeHtml(deviceDiagnosticPath)}</p>` : ""}
      <div class="eyebrow">App events</div>
      <div class="diagnostic-list">
        ${events.length ? events.map(renderDiagnosticEvent).join("") : `<p class="empty-state">No app events recorded yet.</p>`}
      </div>
      ${deviceDiagnosticLines.length ? `<div class="eyebrow">Device agent</div><pre class="diagnostic-log">${escapeHtml(deviceDiagnosticLines.slice(-80).join("\n"))}</pre>` : ""}
    </div>
  `;
}

function diagnosticHealthRow(label: string, value: string, ok: boolean): string {
  return `<div><i class="${ok ? "ok" : "warn"}"></i><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(value)}</small></span></div>`;
}

function renderDiagnosticEvent(event: DiagnosticEvent): string {
  const time = new Date(event.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  return `<article class="diagnostic-event ${event.level}"><span>${escapeHtml(time)} · ${escapeHtml(event.area)}</span><p>${escapeHtml(event.message)}</p></article>`;
}

async function loadDeviceDiagnostics(): Promise<void> {
  if (nativePlatform === "ios") return;
  try {
    const payload = await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "get_diagnostics", limit: 160 }) });
    deviceDiagnosticPath = typeof payload.result?.path === "string" ? payload.result.path : "";
    deviceDiagnosticLines = Array.isArray(payload.result?.lines) ? payload.result.lines.map(String) : [];
  } catch (error) {
    recordDiagnostic("bridge", "error", error instanceof Error ? error.message : String(error));
  }
  if (screen === "diagnostics") render();
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
  const mission = missionState();
  const prospects = missionProspects();
  return `
    <div class="panel-screen mission-screen">
      ${screenHeader("Mission", "memory")}
      ${missionStatus ? `<section class="agent-answer"><span>mission</span><p>${escapeHtml(missionStatus)}</p></section>` : ""}
      ${
        mission
          ? `<section class="mission-card">
              <div class="mission-head">
                <span>Current mission</span>
                <b>${mission.percent}%</b>
              </div>
              <h3>${escapeHtml(mission.goal)}</h3>
              <div class="mission-meter"><i style="width:${Math.max(2, Math.min(100, mission.percent))}%"></i></div>
              <p>${escapeHtml(mission.lastAssessment)}</p>
              <div class="mission-list">
                ${mission.milestones.map((step) => renderMissionStep(step)).join("")}
              </div>
              <button class="primary-wide orange" type="button" data-mission-search ${missionRunning ? "disabled" : ""}>${missionRunning ? "Searching the web…" : prospects.length ? "Find more targets" : "Find live targets"}</button>
            </section>`
          : ""
      }
      ${
        prospects.length
          ? `<div class="section-label">Targets found · ${prospects.length}</div>
             <div class="sent-list mission-prospects">${prospects.map(renderMissionProspect).join("")}</div>`
          : ""
      }
      <div class="section-label">Pick a mission</div>
      <div class="settings-list compact">
        ${missionChoices.map(renderMissionChoice).join("")}
      </div>
      <form id="mission-form" class="stack-form">
        <textarea id="mission-input" class="mission-input" placeholder="Or type your own mission (include a location)..."></textarea>
        <button class="primary-wide" type="submit">Run custom mission</button>
      </form>
    </div>
  `;
}

function renderMissionProspect(prospect: MissionProspect): string {
  const title = prospect.name || prospect.company;
  const details = [prospect.role, prospect.name && prospect.company ? prospect.company : ""].filter(Boolean).join(" · ");
  return `
    <article class="sent-card mission-prospect">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(title)}</h3>
          ${details ? `<span>${escapeHtml(details)}</span>` : ""}
        </div>
        <b>${prospect.status === "drafted" ? "drafted" : "found"}</b>
      </div>
      <p>${escapeHtml(prospect.why)}</p>
      ${prospect.email ? `<small>${escapeHtml(prospect.email)} · found</small>` : `<small>No verified email found. SlyOS will prepare a LinkedIn note.</small>`}
      <div class="outbox-actions">
        ${prospect.website ? `<button type="button" data-mission-open="${escapeAttr(prospect.website)}">Website ↗</button>` : ""}
        ${prospect.linkedin ? `<button type="button" data-mission-open="${escapeAttr(prospect.linkedin)}">LinkedIn ↗</button>` : ""}
        <button type="button" data-mission-draft="${escapeAttr(prospect.id)}" ${missionRunning ? "disabled" : ""}>${prospect.status === "drafted" ? "Draft again" : "Draft outreach"}</button>
      </div>
    </article>
  `;
}

function renderMissionChoice(choice: SettingsCard): string {
  return `
    <button class="settings-card" type="button" data-mission-choice="${escapeAttr(choice.title)}">
      <span class="settings-copy">
        <strong>${escapeHtml(choice.title)}</strong>
        ${choice.subtitle ? `<small>${escapeHtml(choice.subtitle)}</small>` : ""}
      </span>
      <b>›</b>
    </button>
  `;
}

function renderMissionStep(step: { id: string; text: string; done: boolean }): string {
  return `
    <button class="mission-step ${step.done ? "done" : ""}" type="button" data-mission-toggle="${escapeAttr(step.id)}">
      <span>${step.done ? "☑" : "☐"}</span>
      <b>${escapeHtml(step.text)}</b>
    </button>
  `;
}

function renderNetwork(): string {
  const results = networkQuery ? networkResults(networkQuery) : [];
  return `
    <div class="panel-screen network-screen">
      ${screenHeader("My network", "memory")}
      <form id="network-form" class="stack-form">
        <textarea id="network-query" class="network-input" placeholder="Who are you looking for? e.g. CTOs, investors, people at Google">${escapeHtml(networkQuery)}</textarea>
        <button class="primary-wide orange" type="submit">Search my network</button>
      </form>
      ${networkStatus ? `<section class="agent-answer"><span>network</span><p>${escapeHtml(networkStatus)}</p></section>` : ""}
      <div class="section-label">Matches · ${results.length}</div>
      <div class="sent-list">
        ${
          results.length
            ? results.map(renderNetworkResult).join("")
            : `<p class="empty-state">Search your brain for people, companies, or relationships.</p>`
        }
      </div>
    </div>
  `;
}

function renderNetworkResult(item: MemoryItem): string {
  return `
    <article class="sent-card compact-card">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <span>${escapeHtml(item.source)} · ${escapeHtml(item.kind)}</span>
        </div>
      </div>
      <p>${escapeHtml(item.body)}</p>
      <div class="outbox-actions">
        <button type="button" data-network-draft="${escapeAttr(item.id)}">Draft message</button>
      </div>
    </article>
  `;
}

function renderResearch(): string {
  const papers = researchPapers();
  return `
    <div class="panel-screen">
      ${screenHeader("Research")}
      <p class="screen-subtitle">${papers.length} paper${papers.length === 1 ? "" : "s"} in local brain</p>
      ${researchStatus ? `<section class="agent-answer"><span>research</span><p>${escapeHtml(researchStatus)}</p></section>` : ""}
      <div class="research-actions">
        <button class="primary-pill" type="submit" form="research-form">+ New paper</button>
        <button class="secondary-pill" type="button" data-screen="cowork">⌘ Cowork</button>
      </div>
      <form id="research-form" class="stack-form compact-form">
        <input id="research-topic" placeholder="Paper topic..." />
      </form>
      <div class="sent-list">
        ${papers.length ? papers.map(renderPaperCard).join("") : `<p class="empty-state">No papers yet. Ask SlyOS to draft or import one.</p>`}
      </div>
    </div>
  `;
}

function renderPaperCard(paper: ResearchPaperRecord): string {
  return `
    <article class="sent-card research-card">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(paper.title)}</h3>
          <span>${escapeHtml(new Date(paper.updatedAt).toLocaleString())}</span>
        </div>
      </div>
      <p>${escapeHtml(paper.abstract)}</p>
      <small>${paper.outline.map((item) => `• ${escapeHtml(item)}`).join("<br />")}</small>
      <div class="outbox-actions">
        <button type="button" data-paper-open="${escapeAttr(paper.id)}">Save to Cowork</button>
      </div>
    </article>
  `;
}

function renderCowork(): string {
  const files = coworkFiles();
  const active = activeCoworkChat();
  const chats = coworkChats().filter((chat) => !coworkChatQuery || chat.title.toLowerCase().includes(coworkChatQuery.toLowerCase()));
  return `
    <div class="panel-screen cowork-screen">
      ${screenHeader("Cowork", "research")}
      <p class="screen-subtitle">A local agent that builds real files - give it a task, it does it step by step.</p>
      ${coworkStatus ? `<section class="agent-answer"><span>cowork</span><p>${escapeHtml(coworkStatus)}</p></section>` : ""}
      ${
        active
          ? `<div class="cowork-chat-head">
              <button type="button" data-cowork-back>← Chats</button>
              <strong>${escapeHtml(active.title)}</strong>
              <div>
                <button type="button" data-cowork-show-files>Files</button>
                <button type="button" data-cowork-new>New</button>
              </div>
            </div>
            <div class="cowork-thread" aria-live="polite">
              ${active.turns.length ? active.turns.map(renderCoworkTurn).join("") : `<p class="empty-state">Ask Cowork to build or edit a file. It will inspect the workspace and show every tool step.</p>`}
              ${agentBusy ? `<p class="cowork-working">working…</p>` : ""}
            </div>
            <form id="cowork-chat-form" class="cowork-composer">
              <textarea id="cowork-chat-input" placeholder="Message Cowork…" ${agentBusy ? "disabled" : ""}></textarea>
              <div class="cowork-composer-actions">
                <label class="text-button">Attach<input id="cowork-attach" type="file" multiple accept=".pdf,.txt,.md,.csv,.json,.html,.xml,text/*,application/pdf" /></label>
                <button class="primary-pill" type="submit" ${agentBusy ? "disabled" : ""}>Send</button>
              </div>
            </form>`
          : `<div class="cowork-actions">
              <button class="primary-pill" type="button" data-cowork-new>+ New chat</button>
              <button type="button" data-cowork-show-files>Files</button>
            </div>
            <form id="cowork-search-form" class="search-card">
              <span>⌕</span>
              <input id="cowork-chat-search" value="${escapeAttr(coworkChatQuery)}" placeholder="Search chats..." />
            </form>
            <div class="cowork-chat-list">
              ${chats.length ? chats.map(renderCoworkChatRow).join("") : `<p class="empty-state">${coworkChats().length ? "No matching chats." : "No chats yet. Tap New chat to start."}</p>`}
            </div>`
      }
      ${
        coworkShowFiles
          ? `<div class="section-label">Files · ${files.length}</div>
             <div class="sent-list cowork-file-list">${files.length ? files.map(renderCoworkFile).join("") : `<p class="empty-state">No files yet. Cowork will create them as it works.</p>`}</div>`
          : ""
      }
    </div>
  `;
}

function renderCoworkChatRow(chat: CoworkChatRecord): string {
  return `
    <article class="cowork-chat-row">
      <button type="button" data-cowork-open="${escapeAttr(chat.id)}">
        <span>◆</span>
        <span><strong>${escapeHtml(chat.title || "New chat")}</strong><small>${escapeHtml(new Date(chat.updatedAt).toLocaleString())}</small></span>
      </button>
      <button type="button" data-cowork-delete="${escapeAttr(chat.id)}" aria-label="Delete ${escapeAttr(chat.title)}">×</button>
    </article>
  `;
}

function renderCoworkTurn(turn: CoworkTurn): string {
  return `<div class="cowork-turn ${turn.role}"><p>${escapeHtml(turn.body)}</p></div>`;
}

function renderCoworkFile(file: CoworkFileRecord): string {
  return `
    <article class="sent-card compact-card">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(file.name)}</h3>
          <span>${escapeHtml(new Date(file.updatedAt).toLocaleString())}</span>
        </div>
      </div>
      <pre class="file-preview">${escapeHtml(file.content.slice(0, 900))}</pre>
      ${file.lastWrittenPath ? `<small>Written to ${escapeHtml(file.lastWrittenPath)}</small>` : ""}
      <div class="outbox-actions">
        <button type="button" data-cowork-export="${escapeAttr(file.id)}">${nativePlatform === "ios" ? "Share file" : "Download"}</button>
        ${nativePlatform === "macos" ? `<button type="button" data-cowork-write="${escapeAttr(file.id)}">Write to Mac</button>` : ""}
      </div>
    </article>
  `;
}

function renderJob(): string {
  const applications = jobApplications();
  return `
    <div class="panel-screen job-screen">
      ${screenHeader("Find a job", "apps")}
      <p class="screen-subtitle">Paste a role or posting and add your real résumé. SlyOS tailors the package without inventing credentials.</p>
      ${jobStatus ? `<section class="agent-answer"><span>job</span><p>${escapeHtml(jobStatus)}</p></section>` : ""}
      <form id="job-form" class="stack-form job-form">
        <input id="job-target" value="${escapeAttr(jobTargetPrompt)}" placeholder="Role and company" />
        <textarea id="job-posting" placeholder="Paste the job link, description, or requirements"></textarea>
        <label class="file-field">
          <span>Import résumé</span>
          <b>Select PDF or text</b>
          <input id="job-resume-file" type="file" accept=".txt,.md,.csv,.json,.html,.htm,.rtf,.pdf,text/plain,application/pdf" />
        </label>
        <textarea id="job-resume" class="job-resume-input" placeholder="Paste your résumé here, or import a text-based file">${escapeHtml(window.localStorage.getItem("slyos:jobResumeDraft") ?? "")}</textarea>
        <button class="primary-wide orange" type="submit" ${agentBusy || !providerApiKey.trim() ? "disabled" : ""}>${agentBusy ? "Working…" : "Generate application"}</button>
      </form>
      ${!providerApiKey.trim() ? `<button class="text-button" type="button" data-screen="setup">Add a model key in Setup</button>` : ""}
      <div class="section-label">Applications · ${applications.length}</div>
      <div class="sent-list">
        ${applications.length ? applications.map(renderJobApplication).join("") : `<p class="empty-state">No applications prepared yet.</p>`}
      </div>
    </div>
  `;
}

function renderJobApplication(application: JobApplicationRecord): string {
  return `
    <article class="sent-card job-application-card">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(application.target)}</h3>
          <span>${escapeHtml(new Date(application.updatedAt).toLocaleString())}</span>
        </div>
        <b>ready</b>
      </div>
      <details>
        <summary>Tailored résumé</summary>
        <pre class="file-preview job-document">${escapeHtml(application.tailoredResume)}</pre>
        <button type="button" data-job-copy="resume" data-job-id="${escapeAttr(application.id)}">Copy résumé</button>
      </details>
      <details>
        <summary>Cover letter</summary>
        <pre class="file-preview job-document">${escapeHtml(application.coverLetter)}</pre>
        <button type="button" data-job-copy="cover" data-job-id="${escapeAttr(application.id)}">Copy cover letter</button>
      </details>
      <details>
        <summary>Outreach email</summary>
        <pre class="file-preview job-document">${escapeHtml(application.outreachEmail)}</pre>
        <button type="button" data-job-copy="email" data-job-id="${escapeAttr(application.id)}">Copy email</button>
      </details>
      <div class="outbox-actions">
        <button type="button" data-screen="cowork">Open files in Cowork</button>
      </div>
    </article>
  `;
}

function renderArchitect(): string {
  const apps = miniApps();
  return `
    <div class="panel-screen architect-screen">
      ${screenHeader("Architect", "apps")}
      <p class="screen-subtitle">Describe an app or tool. Your configured model builds it as a self-contained SlyOS mini-app.</p>
      ${architectStatus ? `<section class="agent-answer"><span>architect</span><p>${escapeHtml(architectStatus)}</p></section>` : ""}
      <form id="architect-form" class="stack-form">
        <textarea id="architect-prompt" placeholder="e.g. a habit tracker, tip calculator, or launch checklist">${escapeHtml(architectPrompt)}</textarea>
        <button class="primary-wide orange" type="submit" ${agentBusy || !hasTextModel() ? "disabled" : ""}>${agentBusy ? "Building…" : "Build it"}</button>
      </form>
      ${!hasTextModel() ? `<button class="text-button" type="button" data-screen="setup">Add a cloud key or enable an on-device text model</button>` : ""}
      <div class="section-label">Your apps · ${apps.length}</div>
      <div class="mini-app-list">
        ${apps.length ? apps.map(renderMiniAppRow).join("") : `<p class="empty-state">No mini-apps yet.</p>`}
      </div>
    </div>
  `;
}

function renderMiniAppRow(app: MiniAppRecord): string {
  return `
    <div class="mini-app-row">
      <button class="mini-app-open" type="button" data-mini-app-open="${escapeAttr(app.id)}">
        <span>◆</span>
        <b>${escapeHtml(app.name)}</b>
        <small>${escapeHtml(app.description)}</small>
      </button>
      <button class="mini-app-delete" type="button" data-mini-app-delete="${escapeAttr(app.id)}" aria-label="Delete ${escapeAttr(app.name)}">×</button>
    </div>
  `;
}

function renderAppView(): string {
  const app = miniApps().find((candidate) => candidate.id === activeMiniAppId);
  if (!app) {
    return `
      <div class="panel-screen app-view-missing">
        ${screenHeader("App", "architect")}
        <p class="empty-state">This mini-app is no longer stored.</p>
      </div>
    `;
  }
  return `
    <div class="app-view-screen">
      <header class="app-view-header">
        <button type="button" data-screen="architect" aria-label="Back">${materialIcon("arrowBack")}</button>
        <h2>${escapeHtml(app.name)}</h2>
      </header>
      <iframe class="mini-app-frame" title="${escapeAttr(app.name)}" sandbox="allow-scripts allow-forms allow-modals allow-downloads" srcdoc="${escapeAttr(app.html)}"></iframe>
      <form id="mini-app-revise-form" class="mini-app-revise">
        <input id="mini-app-revise-input" placeholder="refine it - add a feature, change the look…" />
        <button type="submit" ${agentBusy ? "disabled" : ""}>${agentBusy ? "…" : "↻ Update"}</button>
      </form>
      ${architectStatus ? `<p class="mini-app-status">${escapeHtml(architectStatus)}</p>` : ""}
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
  const skills = reflexSkills();
  return `
    <div class="panel-screen skill-screen">
      ${screenHeader("Teach a skill", "memory-settings")}
      ${skillStatus ? `<section class="agent-answer"><span>reflex</span><p>${escapeHtml(skillStatus)}</p></section>` : ""}
      <form id="skill-form" class="stack-form">
        <input id="skill-name" placeholder="Skill name" />
        <textarea id="skill-steps" placeholder="One action per line..."></textarea>
        <button class="primary-wide orange" type="submit">Teach SlyOS</button>
      </form>
      <div class="section-label">Skills · ${skills.length}</div>
      <div class="sent-list skill-list">
        ${skills.length ? skills.map(renderReflexSkill).join("") : `<p class="empty-state">No saved skills yet.</p>`}
      </div>
    </div>
  `;
}

function renderReflexSkill(skill: ReflexSkill): string {
  return `<article class="sent-card">
    <div class="sent-top"><div><h3>${escapeHtml(skill.name)}</h3><span>${skill.steps.length} deterministic step${skill.steps.length === 1 ? "" : "s"}</span></div></div>
    <p>${escapeHtml(skill.instruction)}</p>
    <small>${escapeHtml(skill.steps.map((step) => step.type).join(" → "))}</small>
    <div class="outbox-actions">
      <button type="button" data-skill-run="${escapeAttr(skill.id)}">Run</button>
      <button type="button" data-skill-delete="${escapeAttr(skill.id)}">Delete</button>
    </div>
  </article>`;
}

function renderChecklist(): string {
  return `
    <div class="panel-screen checklist-screen">
      ${screenHeader("Checklist", "apps")}
      <form id="checklist-form" class="stack-form compact-form">
        <input id="checklist-input" placeholder="Add something..." />
        <button class="primary-wide orange" type="submit">Add to checklist</button>
      </form>
      ${renderChecklistCard("screen")}
    </div>
  `;
}

function renderChecklistCard(mode: "home" | "screen"): string {
  const items = checklistItems();
  const open = items.filter((item) => !item.done).length;
  return `
    <section class="checklist-card ${mode === "home" ? "home-checklist" : ""}">
      <div class="checklist-head">
        <span>Checklist</span>
        <b>${open} open</b>
      </div>
      ${
        items.length
          ? `<div class="checklist-items">${items.map(renderChecklistItem).join("")}</div>`
          : `<p class="empty-state small">Nothing on your checklist.</p>`
      }
      ${mode === "home" ? `<button class="text-button" type="button" data-screen="checklist">Open checklist</button>` : ""}
    </section>
  `;
}

function renderChecklistItem(item: ChecklistItem): string {
  return `
    <div class="checklist-item ${item.done ? "done" : ""}">
      <button type="button" data-checklist-toggle="${escapeAttr(item.id)}">${item.done ? "☑" : "☐"}</button>
      <span>${escapeHtml(item.text)}</span>
      <button type="button" data-checklist-remove="${escapeAttr(item.id)}">✕</button>
    </div>
  `;
}

function renderDocuments(): string {
  const docs = documentMemories();
  const scans = documentScans();
  return `
    <div class="panel-screen documents-screen">
      ${screenHeader("Documents", "memory-settings")}
      <h3 class="compact-heading">Scan a document</h3>
      <p class="screen-subtitle">Snap a receipt, invoice, ID or form. SlyOS reads the key fields and files it into the brain.</p>
      ${documentScanImage ? `<img class="document-scan-preview" src="${escapeAttr(documentScanImage)}" alt="Document ready to scan" />` : ""}
      <div class="document-scan-actions">
        <label class="document-scan-picker">${documentScanImage ? "Choose another" : "Scan with camera"}<input id="document-scan-file" type="file" accept="image/*" capture="environment" /></label>
        <button id="document-scan-run" type="button" ${documentScanImage && providerApiKey.trim() && !agentBusy ? "" : "disabled"}>${agentBusy ? "Reading…" : "Read & file"}</button>
      </div>
      ${documentScanStatus ? `<section class="agent-answer"><span>documents</span><p>${escapeHtml(documentScanStatus)}</p></section>` : ""}
      ${!providerApiKey.trim() ? `<button class="text-button" type="button" data-screen="setup">Add a vision-capable model key in Setup</button>` : ""}
      <details class="document-import-details">
        <summary>Import PDF or text files</summary>
        <form id="document-import-form" class="stack-form">
          <label class="file-field"><span>Select documents</span><b>PDF or text</b><input id="document-files" type="file" multiple accept=".pdf,.txt,.md,.csv,.json,.html,.xml,application/pdf,text/*" /></label>
          <textarea id="document-note" placeholder="Optional note for the brain..."></textarea>
          <button class="primary-wide orange" type="submit">Import documents</button>
        </form>
      </details>
      <div class="section-label">Filed scans · ${scans.length}</div>
      <div class="sent-list">
        ${scans.length ? scans.map(renderDocumentScan).join("") : `<p class="empty-state">No scans filed yet.</p>`}
      </div>
      <div class="section-label">Imported documents · ${docs.length}</div>
      <div class="tool-list">
        ${docs.length ? docs.slice(0, 30).map((doc) => rowTool(doc.title, "memory")).join("") : `<p class="empty-state">No files imported yet.</p>`}
      </div>
    </div>
  `;
}

function renderDocumentScan(scan: DocumentScanRecord): string {
  const fields = Object.entries(scan.fields);
  return `
    <article class="sent-card document-scan-card">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(scan.title)}</h3>
          <span>${escapeHtml(scan.category)} · ${escapeHtml(new Date(scan.updatedAt).toLocaleString())}</span>
        </div>
      </div>
      <p>${escapeHtml(scan.summary)}</p>
      <details>
        <summary>${fields.length} extracted field${fields.length === 1 ? "" : "s"}</summary>
        <dl>${fields.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
      </details>
      <button type="button" data-document-delete="${escapeAttr(scan.id)}">Remove</button>
    </article>
  `;
}

function renderCompose(): string {
  const platforms = ["Instagram", "LinkedIn", "X"];
  return `
    <div class="panel-screen compose-screen">
      ${screenHeader("Compose")}
      <div class="segmented compact-segments">
        ${platforms.map((platform) => `<button class="${platform === composePlatform ? "active" : ""}" type="button" data-compose-platform="${platform}">${platform}</button>`).join("")}
      </div>
      <form id="compose-form" class="stack-form">
        <input id="compose-topic" value="${escapeAttr(composeTopic)}" placeholder="What should the post be about?" />
        <div class="platform-preview platform-${slugify(composePlatform)}">
          <div class="platform-preview-head"><span class="avatar small-avatar">${escapeHtml((profileName || "S").slice(0, 1).toUpperCase())}</span><strong>${escapeHtml(profileName || "Your Name")}</strong></div>
          <textarea id="compose-body" placeholder="Take a photo and tap Generate, or type your post here…">${escapeHtml(composeBody)}</textarea>
        </div>
        <div class="inline-edit-row">
          <input id="compose-revision" placeholder="how should I change it?" />
          <button type="button" data-compose-revise="true">Revise</button>
        </div>
        <div class="button-pair workflow-actions">
          <button type="submit">${agentBusy ? "Writing…" : "Generate"}</button>
          <button type="button" data-compose-share="true" ${composeBody.trim() ? "" : "disabled"}>Share</button>
          <button type="button" data-compose-copy="true" ${composeBody.trim() ? "" : "disabled"}>Copy</button>
        </div>
      </form>
      ${composeStatus ? `<p class="workflow-status">${escapeHtml(composeStatus)}</p>` : ""}
    </div>
  `;
}

function renderEmailCompose(): string {
  return `
    <div class="panel-screen email-compose-screen">
      ${screenHeader("Email")}
      <form id="email-compose-form" class="stack-form email-sheet">
        <label><span>To</span><input id="email-to" value="${escapeAttr(emailTo)}" placeholder="name@example.com" inputmode="email" /></label>
        <label><span>Topic</span><input id="email-topic" value="${escapeAttr(emailTopic)}" placeholder="What should this email accomplish?" /></label>
        <label><span>Subject</span><input id="email-subject" value="${escapeAttr(emailSubject)}" placeholder="Subject" /></label>
        <textarea id="email-body" class="email-body" placeholder="SlyOS will draft this in your voice…">${escapeHtml(emailBody)}</textarea>
        <div class="inline-edit-row">
          <input id="email-revision" placeholder="shorter, warmer, add a line about…" />
          <button type="button" data-email-revise="true">Revise</button>
        </div>
        <div class="button-pair workflow-actions">
          <button type="submit">${agentBusy ? "Writing…" : "Generate"}</button>
          <button type="button" data-email-send="true" ${emailBody.trim() && emailTo.trim() ? "" : "disabled"}>Send</button>
          <button type="button" data-email-copy="true" ${emailBody.trim() ? "" : "disabled"}>Copy</button>
        </div>
      </form>
      ${emailStatus ? `<p class="workflow-status">${escapeHtml(emailStatus)}</p>` : ""}
    </div>
  `;
}

function renderSpicy(): string {
  return `
    <div class="panel-screen spicy-screen">
      ${screenHeader("Spicy post")}
      <div class="segmented compact-segments">
        ${["X", "Reddit"].map((platform) => `<button class="${platform === spicyPlatform ? "active" : ""}" type="button" data-spicy-platform="${platform}">${platform}</button>`).join("")}
      </div>
      <form id="spicy-form" class="stack-form">
        <input id="spicy-topic" value="${escapeAttr(spicyTopic)}" placeholder="What should SlyOS challenge?" />
        <div class="platform-preview spicy-preview">
          <small>${spicyPlatform === "Reddit" ? "r/ · draft" : "@you · now"}</small>
          <textarea id="spicy-body" placeholder="A constructive tech roast.">${escapeHtml(spicyBody)}</textarea>
          <small class="character-count">${spicyBody.length}/${spicyPlatform === "X" ? 280 : 10000}</small>
        </div>
        <div class="inline-edit-row">
          <input id="spicy-revision" placeholder="shorter, sharper, add a stat…" />
          <button type="button" data-spicy-revise="true">Edit</button>
        </div>
        <div class="button-pair workflow-actions">
          <button type="submit">${agentBusy ? "Writing…" : "Generate"}</button>
          <button type="button" data-spicy-share="true" ${spicyBody.trim() ? "" : "disabled"}>Post to ${spicyPlatform}</button>
        </div>
      </form>
      ${spicyStatus ? `<p class="workflow-status">${escapeHtml(spicyStatus)}</p>` : ""}
    </div>
  `;
}

function renderFaces(): string {
  const profiles = faceProfiles();
  return `
    <div class="panel-screen faces-screen">
      ${screenHeader("Who's this?")}
      <section class="workflow-section">
        <h3>Recognize a face</h3>
        <p>Point the camera at someone. SlyOS matches them against your people.</p>
        <label class="primary-wide file-action">${materialIcon("photoCamera")}<span>${agentBusy ? "Looking…" : "Who's this?"}</span><input id="face-recognize-file" type="file" accept="image/*" capture="user" /></label>
        ${faceRecognizeImage ? `<img class="face-capture" src="${escapeAttr(faceRecognizeImage)}" alt="Face to recognize" />` : ""}
        ${faceStatus ? `<div class="brief-card face-result"><p>${escapeHtml(faceStatus)}</p></div>` : ""}
      </section>
      <section class="workflow-section">
        <h3>Add a person</h3>
        <div class="face-enroll-row">
          ${faceEnrollImage ? `<img class="face-avatar" src="${escapeAttr(faceEnrollImage)}" alt="New person" />` : ""}
          <input id="face-name" placeholder="Their name" />
        </div>
        <div class="button-pair workflow-actions">
          <label class="secondary-pill file-action">${faceEnrollImage ? "Retake" : "Add with camera"}<input id="face-enroll-file" type="file" accept="image/*" capture="user" /></label>
          <button type="button" data-face-save="true" ${faceEnrollImage ? "" : "disabled"}>Save</button>
        </div>
      </section>
      ${profiles.length ? `<div class="eyebrow">Your people · ${profiles.length}</div><div class="face-roster">${profiles.map(renderFaceProfile).join("")}</div>` : ""}
    </div>
  `;
}

function renderFaceProfile(profile: FaceProfile): string {
  return `<div class="face-row"><img src="${escapeAttr(profile.imageDataUrl)}" alt="${escapeAttr(profile.name)}" /><strong>${escapeHtml(profile.name)}</strong><button type="button" data-face-remove="${escapeAttr(profile.id)}">Remove</button></div>`;
}

function renderShop(): string {
  return `
    <div class="panel-screen shop-screen">
      ${screenHeader("Shop")}
      <form id="shop-form" class="stack-form">
        <textarea id="shop-query" placeholder="What do you want to buy? Brand, size, budget…">${escapeHtml(shopQuery)}</textarea>
        <button class="primary-wide" type="submit">${agentBusy ? "Finding the best price…" : "Find best price"}</button>
      </form>
      ${shopStatus ? `<p class="workflow-status">${escapeHtml(shopStatus)}</p>` : ""}
      <div class="shop-results">${shopResults.map(renderShopResult).join("")}</div>
    </div>
  `;
}

function renderShopResult(result: ShopResult): string {
  return `
    <article class="brief-card shop-result">
      <div><strong>${escapeHtml(result.name)}</strong>${result.price ? `<b>${escapeHtml(result.price)}</b>` : ""}</div>
      <small>${escapeHtml(result.merchant)}${result.note ? ` · ${escapeHtml(result.note)}` : ""}</small>
      <button type="button" data-open-url="${escapeAttr(result.url)}">Open to buy ${materialIcon("arrowBack")}</button>
    </article>
  `;
}

function renderOutreach(): string {
  const drafts = draftRecords("outreach");
  return `
    <div class="panel-screen outreach-screen">
      ${screenHeader("Outreach")}
      <p class="screen-subtitle">Bring your own CSV. SlyOS drafts each email; every send stays review-gated.</p>
      <form id="outreach-form" class="stack-form">
        <textarea id="outreach-topic" placeholder="What is the outreach about?">${escapeHtml(outreachTopic)}</textarea>
        <input id="outreach-file" type="file" accept=".csv,text/csv,text/plain" />
        <button class="primary-wide" type="submit">${agentBusy ? "Drafting…" : "Import CSV & draft"}</button>
      </form>
      ${outreachStatus ? `<p class="workflow-status">${escapeHtml(outreachStatus)}</p>` : ""}
      <div class="draft-list">${drafts.map(renderOutreachDraft).join("")}</div>
    </div>
  `;
}

function renderOutreachDraft(draft: DraftRecord): string {
  return `
    <article class="brief-card outreach-draft">
      <small>${escapeHtml(draft.to)}</small>
      <strong>${escapeHtml(draft.subject)}</strong>
      <p>${escapeHtml(draft.body)}</p>
      <div class="button-pair"><button type="button" data-outreach-send="${escapeAttr(draft.id)}">Send</button><button type="button" data-draft-delete="${escapeAttr(draft.id)}">Delete</button></div>
    </article>
  `;
}

function renderStore(): string {
  const all = powerRecords();
  const query = powerQuery.toLowerCase().trim();
  const matched = query
    ? all
        .map((power) => ({ power, score: powerSearchScore(power, query) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || b.power.stars - a.power.stars)
        .map((entry) => entry.power)
    : [];
  const segmented = powerSegment === "for-you" ? all : all.filter((power) => power.type === powerSegment);
  const featured = all.find((power) => power.featured);
  const recommended = all.filter((power) => power.featured || power.trending).slice(0, 6);
  const top = segmented.slice().sort((a, b) => b.stars - a.stars).slice(0, 10);
  const selected = selectedPowerId ? all.find((power) => power.id === selectedPowerId) ?? null : null;
  return `
    <div class="panel-screen store-screen">
      <div class="power-title"><h2>Powers</h2>${all.some((power) => power.enabled) ? `<span>${all.filter((power) => power.enabled).length} active</span>` : ""}</div>
      <section class="power-intent">
        <label for="power-query">give your device the power to -</label>
        <div><input id="power-query" value="${escapeAttr(powerQuery)}" placeholder="${escapeAttr(powerIntentPlaceholder())}" autocomplete="off" />${powerQuery ? `<button type="button" data-power-clear="true">clear</button>` : ""}</div>
      </section>
      <div class="power-segments">
        ${(["for-you", "skill", "connect", "tool"] as const).map((segment) => `<button type="button" class="${powerSegment === segment && !query ? "active" : ""}" data-power-segment="${segment}">${segment === "for-you" ? "For you" : segment[0]?.toUpperCase() + segment.slice(1)}</button>`).join("")}
      </div>
      ${powerStatus ? `<p class="workflow-status">${escapeHtml(powerStatus)}</p>` : ""}
      <div class="power-discovery">
        ${
          query
            ? `${matched.length ? `<div class="power-rail-label">BEST MATCHES</div>${matched.map((power) => renderPowerRank(power, 0)).join("")}` : `<p class="empty-state">No curated power matches yet.</p>`}
               <form id="power-search-form" class="power-github"><span>FROM GITHUB</span><button type="submit">${agentBusy ? "searching…" : "search →"}</button></form>`
            : powerSegment === "for-you"
              ? `${featured ? renderPowerFeatured(featured) : ""}
                 <div class="power-rail-label">RECOMMENDED FOR YOU</div>
                 <div class="power-rail">${recommended.map(renderPowerRail).join("")}</div>
                 <div class="power-rail-label">TOP POWERS</div>
                 ${top.map((power, index) => renderPowerRank(power, index + 1)).join("")}`
              : `<div class="power-rail-label">${powerSegment.toUpperCase()} POWERS</div>${top.map((power) => renderPowerRank(power, 0)).join("")}`
        }
      </div>
      ${selected ? renderPowerSheet(selected) : ""}
    </div>
  `;
}

function renderPowerFeatured(power: PowerRecord): string {
  const [from, to] = powerCrest(power.id);
  return `
    <button type="button" class="power-featured" style="--crest-from:${from};--crest-to:${to}" data-power-open="${escapeAttr(power.id)}">
      <span>FEATURED</span><b>${escapeHtml(powerMonogram(power.name))}</b>
      <div><strong>power to ${escapeHtml(power.tagline || power.name)}</strong><small>${powerRating(power)}<em>${power.enabled ? "ACTIVE" : "GET"}</em></small></div>
    </button>
  `;
}

function renderPowerRail(power: PowerRecord): string {
  const [from, to] = powerCrest(power.id);
  return `<button type="button" class="power-rail-card" data-power-open="${escapeAttr(power.id)}"><span style="--crest-from:${from};--crest-to:${to}">${escapeHtml(powerMonogram(power.name))}</span><strong>${escapeHtml(power.tagline || power.name)}</strong><small>${powerRating(power)}</small></button>`;
}

function renderPowerRank(power: PowerRecord, rank: number): string {
  const [from, to] = powerCrest(power.id);
  return `<button type="button" class="power-rank" data-power-open="${escapeAttr(power.id)}">${rank ? `<b>${String(rank).padStart(2, "0")}</b>` : ""}<span class="power-crest" style="--crest-from:${from};--crest-to:${to}">${escapeHtml(powerMonogram(power.name))}</span><span><strong>${escapeHtml(power.tagline || power.name)}</strong><small>${powerRating(power)}</small></span><em>${power.enabled ? "ACTIVE" : "GET"}</em></button>`;
}

function renderPowerSheet(power: PowerRecord): string {
  const [from, to] = powerCrest(power.id);
  return `<div class="power-sheet-backdrop" data-power-close="true"><section class="power-sheet" role="dialog" aria-modal="true" aria-label="${escapeAttr(power.name)}"><div class="power-sheet-head"><span class="power-crest large" style="--crest-from:${from};--crest-to:${to}">${escapeHtml(powerMonogram(power.name))}</span><div><strong>power to ${escapeHtml(power.tagline || power.name)}</strong><small>${powerRating(power)} · ${escapeHtml((power.type || "skill").replace(/^./, (value) => value.toUpperCase()))}</small></div></div><p>${escapeHtml(power.description)}</p><button type="button" class="power-source" data-open-url="${escapeAttr(power.repoUrl)}">view on github ↗</button>${power.type && power.type !== "skill" ? `<input id="power-endpoint" value="${escapeAttr(power.endpoint || "")}" placeholder="https://your-instance (optional)" />` : ""}<button type="button" class="primary-wide ${power.enabled ? "quiet" : "orange"}" data-power-toggle="${escapeAttr(power.id)}">${power.enabled ? "Remove" : power.type === "connect" ? "Connect" : power.type === "tool" ? "Add tool" : "Add skill"}</button><button type="button" class="power-close" data-power-close="true">Close</button></section></div>`;
}

function powerSearchScore(power: PowerRecord, query: string): number {
  const terms = query.match(/[a-z]{3,}/g) ?? [];
  const haystack = `${power.name} ${power.tagline || ""} ${power.description} ${power.category || ""}`.toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length;
}

function powerIntentPlaceholder(): string {
  const prompts = ["see the live web", "speak in my voice", "read any scan", "make any image", "run my own model", "research while I sleep"];
  return `${prompts[Math.floor(Date.now() / 2600) % prompts.length]}…`;
}

function powerRating(power: PowerRecord): string {
  const stars = power.stars >= 1000 ? `${Math.round(power.stars / 1000)}k` : String(power.stars);
  return `★ ${(power.rating ?? 4.7).toFixed(1)} · ${stars}`;
}

function powerMonogram(name: string): string {
  return name.trim()[0]?.toUpperCase() || "S";
}

function powerCrest(id: string): [string, string] {
  const palette: Array<[string, string]> = [["#e8642c", "#b23a1e"], ["#4e86b0", "#2b5675"], ["#5e9a78", "#34614a"], ["#7b5ea7", "#4a3570"], ["#c9863f", "#8a5a22"], ["#b0506a", "#7a2e45"], ["#3e8e8e", "#205c5c"], ["#8a7bc8", "#5847a0"]];
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length] ?? palette[0]!;
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
  const synced = syncedVaultEnvelope();
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
      ${synced ? `<section class="brief-card"><div class="brief-head"><span>Synced Android vault</span><button id="vault-sync-reveal" type="button">Unlock</button></div><p>AES-256-GCM ciphertext from your account · ${escapeHtml(new Date(synced.updatedAt).toLocaleString())}</p></section>` : ""}
      ${revealedSyncedVault ? `<div class="sent-list">${revealedSyncedVault.map((item) => `<section class="agent-answer"><span>${escapeHtml(item.label)}</span><p>${escapeHtml(item.value)}</p></section>`).join("")}</div>` : ""}
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
      <section class="backup-portable">
        <div class="section-label">Portable encrypted snapshot</div>
        <p>Includes this device's brain, profile, workflows, settings, drafts, and encrypted vault records. Supabase login sessions are never included.</p>
        <input id="backup-password" type="password" autocomplete="new-password" placeholder="Backup password" />
        <div class="button-pair">
          <button id="backup-export" type="button">Export file</button>
          <label class="button-label" for="backup-import-file">Restore file</label>
        </div>
        <input id="backup-import-file" type="file" accept="application/json,.slyosbrain" hidden />
        <div class="caption-line">${escapeHtml(backupStatus)}</div>
      </section>
    </div>
  `;
}

async function exportBrainBackup(): Promise<void> {
  const password = document.querySelector<HTMLInputElement>("#backup-password")?.value ?? "";
  if (password.length < 8) throw new Error("Use a backup password of at least 8 characters.");
  const entries: Array<[string, string]> = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith("slyos:")) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) entries.push([key, value]);
  }
  const plaintext = JSON.stringify({ version: 1, platform: platformLabel(), createdAt: new Date().toISOString(), entries });
  const encrypted = await encryptText(plaintext, password);
  const payload = JSON.stringify({ format: "slyos-brain", version: 1, createdAt: new Date().toISOString(), ...encrypted }, null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `slyos-brain-${stamp}.slyosbrain`;

  if (nativePlatform === "macos") {
    const path = `~/Downloads/SlyOS/${name}`;
    await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "write_file", path, content: payload, overwrite: false }) });
    backupStatus = `Encrypted snapshot saved to Downloads/SlyOS/${name}`;
    return;
  }

  const file = new File([payload], name, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "SlyOS brain backup" });
    backupStatus = "Encrypted snapshot handed to the iOS share sheet.";
    return;
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  backupStatus = "Encrypted snapshot downloaded.";
}

async function importBrainBackup(file: File): Promise<void> {
  const password = document.querySelector<HTMLInputElement>("#backup-password")?.value ?? "";
  if (!password) throw new Error("Enter the password used for this backup.");
  const envelope = JSON.parse(await file.text()) as Record<string, unknown>;
  if (envelope.format !== "slyos-brain" || envelope.version !== 1) throw new Error("This is not a supported SlyOS brain backup.");
  const plaintext = await decryptText(
    {
      ciphertext: String(envelope.ciphertext ?? ""),
      iv: String(envelope.iv ?? ""),
      salt: String(envelope.salt ?? "")
    },
    password
  );
  const backup = JSON.parse(plaintext) as { version?: number; entries?: unknown };
  if (backup.version !== 1 || !Array.isArray(backup.entries)) throw new Error("The decrypted backup is invalid.");
  let restored = 0;
  for (const entry of backup.entries) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [key, value] = entry;
    if (typeof key !== "string" || typeof value !== "string" || !key.startsWith("slyos:")) continue;
    window.localStorage.setItem(key, value);
    restored += 1;
  }
  if (!restored) throw new Error("The backup contained no SlyOS records.");
  backupStatus = `Restored ${restored} local record${restored === 1 ? "" : "s"}. Reloading…`;
  render();
  setTimeout(() => window.location.reload(), 500);
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
  const tools: Array<{ label: string; screen: ShellScreen }> = [
    { label: "Setup", screen: "setup" },
    { label: "Memory", screen: "memory" },
    { label: "Now", screen: "now" },
    { label: "Checklist", screen: "checklist" },
    { label: "Chat", screen: "chat" },
    { label: "Operate device", screen: "operate" },
    { label: "Research", screen: "research" },
    { label: "Cowork", screen: "cowork" },
    { label: "Find a job", screen: "job" },
    { label: "Architect", screen: "architect" },
    { label: "Mission", screen: "mission" },
    { label: "My network", screen: "network" },
    { label: "Look", screen: "look" },
    { label: "Who's this?", screen: "faces" },
    { label: "Shop", screen: "shop" },
    { label: "Compose post", screen: "compose" },
    { label: "Compose email", screen: "email-compose" },
    { label: "Spicy post", screen: "spicy" },
    { label: "Outreach", screen: "outreach" },
    { label: "Powers", screen: "store" },
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
  if (!installedAppsAttempted && !installedAppsLoading && nativePlatform !== "ios") {
    queueMicrotask(() => void loadInstalledApps());
  }
  const query = installedAppsQuery.toLowerCase().trim();
  const shownApps = installedApps.filter((app) => !query || app.label.toLowerCase().includes(query));
  for (const app of shownApps.slice(0, 30)) queueMicrotask(() => void loadInstalledAppIcon(app));
  return `
    <div class="panel-screen">
      ${screenHeader("Apps")}
      <button class="manual-link" data-screen="manual">${materialIcon("pauseCircle")}<span>Manual mode - pause the agent</span></button>
      <div class="native-app-search">
        <input id="installed-app-query" value="${escapeAttr(installedAppsQuery)}" placeholder="Find an installed app…" autocomplete="off" />
        <button type="button" data-refresh-installed-apps="true" aria-label="Refresh installed apps">↻</button>
      </div>
      <p class="native-app-status">${escapeHtml(installedAppsStatus || (nativePlatform === "ios" ? "Ask SlyOS to open an app through its URL or Shortcut." : "Reading installed apps…"))}</p>
      <div class="tool-list installed-app-list">
        ${shownApps.map((app) => `<button class="tool-row native-app-row" type="button" data-open-installed-app="${escapeAttr(app.app)}">${renderInstalledAppIcon(app)}<span>${escapeHtml(app.label)}</span></button>`).join("")}
      </div>
      <div class="eyebrow">SlyOS tools</div>
      <div class="tool-list slyos-tool-list">
        ${tools.map((app) => rowTool(app.label, app.screen)).join("")}
      </div>
    </div>
  `;
}

async function loadInstalledApps(): Promise<void> {
  if (nativePlatform === "ios" || installedAppsLoading) return;
  installedAppsAttempted = true;
  installedAppsLoading = true;
  installedAppsStatus = "Reading installed apps…";
  render();
  try {
    const payload = await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "list_apps" }) });
    const rows = Array.isArray(payload.result?.apps) ? payload.result.apps : [];
    installedApps = rows
      .filter((row: unknown): row is NativeAppEntry => Boolean(row && typeof row === "object" && typeof (row as NativeAppEntry).label === "string" && typeof (row as NativeAppEntry).app === "string"))
      .slice(0, 500);
    installedAppsStatus = `${installedApps.length} installed app${installedApps.length === 1 ? "" : "s"}`;
  } catch (error) {
    installedAppsStatus = error instanceof Error ? error.message : String(error);
  } finally {
    installedAppsLoading = false;
    render();
  }
}

function renderInstalledAppIcon(app: NativeAppEntry): string {
  const icon = installedAppIcons.get(app.app);
  return `<i class="native-app-icon">${icon ? `<img src="${escapeAttr(icon)}" alt="" />` : escapeHtml(app.label.slice(0, 1).toUpperCase())}</i>`;
}

async function loadInstalledAppIcon(app: NativeAppEntry): Promise<void> {
  if (!app.path || nativePlatform !== "macos" || installedAppIcons.has(app.app) || installedAppIconAttempts.has(app.app) || installedAppIconLoads.has(app.app)) return;
  installedAppIconAttempts.add(app.app);
  installedAppIconLoads.add(app.app);
  try {
    const payload = await deviceFetch("/actions", {
      method: "POST",
      body: JSON.stringify({ type: "app_icon", path: app.path })
    });
    const dataUrl = typeof payload.result?.dataUrl === "string" ? payload.result.dataUrl : "";
    if (dataUrl.startsWith("data:image/")) installedAppIcons.set(app.app, dataUrl);
  } catch {
    // The launcher remains usable with its initial-letter fallback.
  } finally {
    installedAppIconLoads.delete(app.app);
    if (screen === "home" || screen === "apps") render();
  }
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
    defaultModel: "gemini-2.5-flash",
    keyPlaceholder: "AIza..."
  };
  const stepContent = [
    renderSetupModel(currentProvider),
    renderSetupOfflineModel(),
    renderSetupProfile(),
    renderSetupImports(),
    renderSetupPermissions()
  ][setupStep];
  return `
    <div class="panel-screen setup-screen">
      ${setupComplete ? screenHeader("Setup", "memory-settings") : ""}
      <h1 class="setup-welcome">Welcome to SlyOS</h1>
      <div class="setup-progress">
        <span>Step ${setupStep + 1} of 5</span>
        <div>${Array.from({ length: 5 }, (_, index) => `<i class="${index <= setupStep ? "active" : ""}"></i>`).join("")}</div>
      </div>
      <section class="setup-step">${stepContent ?? ""}</section>
      <div class="setup-controls">
        ${setupStep > 0 ? `<button id="setup-back" class="quiet-button" type="button">Back</button>` : ""}
        <button id="setup-next" class="primary-pill" type="button">${setupStep === 4 ? "Finish" : "Next"}</button>
        ${setupStep > 0 && setupStep < 4 ? `<button id="setup-skip" class="quiet-button" type="button">Skip</button>` : ""}
      </div>
    </div>
  `;
}

function renderSetupModel(currentProvider: (typeof providerOptions)[number]): string {
  const keyLinks: Record<ProviderId, string> = {
    gemini: "https://aistudio.google.com/app/apikey",
    openai: "https://platform.openai.com/api-keys",
    anthropic: "https://console.anthropic.com/settings/keys"
  };
  return `
    <h3>Pick your brain</h3>
    <p>SlyOS runs on your own model key, stored only on this device. Gemini has a free tier, so you can start free and switch anytime.</p>
    <div class="chip-row provider-row">
      ${providerOptions.map((option) => `<button class="${option.id === selectedProvider ? "active" : ""}" data-provider="${option.id}" type="button">${escapeHtml(option.label)}${option.id === "gemini" ? " · free" : ""}</button>`).join("")}
    </div>
    <div class="sync-grid setup-fields">
      <input id="provider-key" type="password" value="${escapeAttr(providerApiKey)}" placeholder="${escapeAttr(currentProvider.keyPlaceholder)}" />
    </div>
    <div class="setup-inline-actions">
      <button id="provider-key-toggle" class="text-button" type="button">Show</button>
      <a href="${escapeAttr(keyLinks[selectedProvider])}" target="_blank" rel="noreferrer">Get a ${escapeHtml(currentProvider.label)} key ↗</a>
    </div>
    <div class="caption-line">${escapeHtml(providerStatus)}</div>
    <p class="setup-fineprint">Add the other providers later in Brain → Models & spending to orchestrate a cheap everyday model and a powerful research model. Every model receives the same memory and persona context.</p>
  `;
}

function renderSetupOfflineModel(): string {
  if (localModelStatus === "not checked" && !localModelChecking) queueMicrotask(() => void refreshLocalModels());
  const platformCopy = nativePlatform === "ios"
    ? "On supported iPhones, Apple Intelligence can answer privately when every cloud model is unreachable."
    : "SlyOS can use an Ollama model already installed on this computer when every cloud model is unreachable.";
  const modelRows = localModelOptions.length
    ? localModelOptions.map((model) => {
        const selected = localModelEnabled && localModelId === model.id;
        const size = model.bytes > 0 ? `${Math.max(1, Math.round(model.bytes / 1_000_000))} MB` : "on device";
        return `<button class="local-model-choice ${selected ? "active" : ""}" type="button" data-local-model="${escapeAttr(model.id)}"><span><strong>${escapeHtml(model.name)}</strong><small>${escapeHtml(nativePlatform === "ios" ? "Private Apple on-device model" : "Installed in Ollama")}</small></span><b>${escapeHtml(size)}</b></button>`;
      }).join("")
    : `<div class="local-model-empty">${escapeHtml(localModelStatus)}</div>`;
  return `
    <h3>Add a free offline backup brain?</h3>
    <p>Optional. Your cloud model stays primary. ${platformCopy} It is a safety net: local models are slower, cannot search the web, and cannot read images.</p>
    <div class="local-model-list">${modelRows}</div>
    <div class="setup-inline-actions">
      <button id="local-model-none" class="text-button" type="button">None</button>
      <button id="local-model-refresh" class="text-button" type="button">Refresh</button>
    </div>
    <p class="setup-fineprint">${localModelEnabled && localModelId ? "Offline backup enabled. It only runs after the cloud provider fails." : nativePlatform === "ios" ? "Apple reports availability from this iPhone; no availability is assumed." : "Install Ollama and pull a model, then Refresh. No model is downloaded silently."}</p>
  `;
}

function renderSetupProfile(): string {
  return `
    <h3>About you</h3>
    <p>Tell the brain who you are and how you write. This context is included in model requests and can sync to your account.</p>
    <div class="sync-grid setup-fields">
      <input id="profile-name" value="${escapeAttr(profileName)}" placeholder="Your name" />
      <textarea id="profile-voice" rows="6" placeholder="What you do, how you text, tone, preferences…">${escapeHtml(profileVoice)}</textarea>
    </div>
    <form id="setup-remember-form" class="remember-form setup-memory-form">
      <input id="setup-remember-title" placeholder="A useful fact about you" />
      <input id="setup-remember-body" placeholder="What SlyOS should remember" />
      <button type="submit">Remember</button>
    </form>
  `;
}

function renderSetupImports(): string {
  return `
    <h3>Bring in your data</h3>
    <p>Optional, but this is what makes the brain sound like you. Import exported chats and network history; readable content is indexed locally.</p>
    <form id="setup-import-form" class="stack-form setup-import-form">
      <input id="history-files" type="file" multiple accept=".txt,.csv,.json,.md,.html,.zip" />
      <textarea id="history-note" placeholder="Source or context, for example: WhatsApp export with Daria"></textarea>
      <button type="submit">Import history</button>
    </form>
    <p class="setup-fineprint">WhatsApp .txt · LinkedIn .csv · Instagram/Telegram .json · Messenger exports. Archives are stored as file metadata until a platform extractor is available.</p>
    <div class="setup-account-inline">
      <h4>Connect your brain</h4>
      <p>Use one account to bring the Android profile, chats, and encrypted bank vault to this device.</p>
      ${renderSetupAccountFields()}
    </div>
  `;
}

function renderSetupAccount(): string {
  return `
    <h3>Connect your brain</h3>
    <p>Use one email and password on every device. Sign in, pull on a new device, and push after local changes.</p>
    ${renderSetupAccountFields()}
  `;
}

function renderSetupAccountFields(): string {
  return `
    <div class="sync-grid setup-fields">
      <input id="supabase-url" value="${escapeAttr(supabaseUrl)}" placeholder="Supabase project URL" />
      <input id="supabase-key" value="${escapeAttr(supabasePublishableKey)}" placeholder="Publishable key" />
      <input id="supabase-email" value="${escapeAttr(supabaseEmail)}" inputmode="email" placeholder="you@example.com" />
      <input id="supabase-password" type="password" autocomplete="current-password" placeholder="Account password" />
    </div>
    <div class="button-pair setup-account-actions">
      <button id="sync-configure" type="button">Use Supabase</button>
      <button id="sync-signup" type="button">Create account</button>
      <button id="sync-login" type="button">Sign in</button>
      <button id="sync-pull" type="button">Pull brain</button>
      <button id="sync-push" type="button">Push brain</button>
    </div>
    <div class="caption-line">${escapeHtml(syncStatus)}</div>
  `;
}

function renderSetupPermissions(): string {
  const permissionTitle = nativePlatform === "ios" ? "Turn it on for iPhone" : nativePlatform === "macos" ? "Turn it on for Mac" : "Turn it on";
  const cards = nativePlatform === "ios"
    ? [renderPermissionCard("iPhone", ["Camera and microphone when requested", "Photos and Files for imports", "Notifications for SlyOS alerts", "Shortcuts and App Intents for handoff actions"])]
    : [renderPermissionCard("macOS", ["Accessibility for click and type", "Screen Recording for observation", "Automation prompts for app control", "Microphone and camera for voice and Look"] )];
  return `
    <h3>${permissionTitle}</h3>
    <p>${nativePlatform === "ios" ? "iOS grants SlyOS control inside its own app and through explicit Shortcuts/App Intents. Apple does not permit arbitrary tapping through other apps." : "Grant these macOS permissions to the SlyOS app or the process running the local bridge so observe, click, type, and app control can work."}</p>
    <div class="permission-grid">${cards.join("")}</div>
    ${nativePlatform === "ios" ? "" : `
      <div class="mac-permission-status">
        ${permissionStatusRow("Screen Recording", devicePermissionStatus.screenRecording, "screen")}
        ${permissionStatusRow("Accessibility", devicePermissionStatus.accessibility, "accessibility")}
        ${permissionStatusRow("Automation", devicePermissionStatus.automation, "automation")}
      </div>
      <div class="sync-grid setup-fields">
        <input id="device-bridge-url" value="${escapeAttr(deviceBridgeUrl)}" placeholder="http://127.0.0.1:4317" />
        <input id="device-bridge-token" value="${escapeAttr(deviceBridgeToken)}" placeholder="Local agent token" />
      </div>
      <div class="button-pair">
        <button id="device-save" type="button">Save bridge</button>
        <button id="device-check" type="button">Check bridge</button>
        <button id="device-request-permissions" type="button">Request Mac access</button>
        <button id="device-permissions" type="button">Refresh permissions</button>
        <button id="device-observe" type="button">Observe</button>
      </div>
      <div class="caption-line">${escapeHtml(deviceBridgeStatus)}</div>
    `}
    <p class="setup-fineprint">You can change model, account, imports, and permission settings later from Brain → Settings.</p>
  `;
}

function renderPermissions(): string {
  return `
    <div class="panel-screen permissions-screen">
      ${screenHeader("Device permissions", "memory-settings")}
      <div class="setup-card setup-permissions-card">
        ${renderSetupPermissions()}
      </div>
    </div>
  `;
}

function permissionStatusRow(label: string, value: boolean | null, permission: string): string {
  const status = devicePermissionStatus.sessionLocked ? "Unlock Mac to check" : value === true ? "Allowed" : value === false ? "Required" : "Not checked";
  return `<div><span><strong>${escapeHtml(label)}</strong><small>${status}</small></span><button type="button" data-open-mac-permission="${escapeAttr(permission)}">Open</button></div>`;
}

function permissionSummary(): string {
  if (!devicePermissionStatus.checked) return "not checked";
  if (devicePermissionStatus.sessionLocked) return "Mac locked · unlock to test";
  return `screen ${devicePermissionStatus.screenRecording ? "yes" : "no"} · accessibility ${devicePermissionStatus.accessibility ? "yes" : "no"} · automation ${devicePermissionStatus.automation ? "yes" : "no"}`;
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
  const records = expenseRecords();
  const total = records.reduce((sum, item) => sum + item.amount, 0);
  return `
    <div class="panel-screen expenses-screen">
      ${screenHeader("Expenses")}
      ${expensesStatus ? `<section class="agent-answer"><span>expenses</span><p>${escapeHtml(expensesStatus)}</p></section>` : ""}
      <section class="brief-card">
        <div class="eyebrow">Receipt brain</div>
        <p>${records.length ? `${records.length} expense${records.length === 1 ? "" : "s"} logged · ${formatMoney(total)} total.` : "Receipts, invoices, and imports become searchable spending memory."}</p>
      </section>
      <form id="expenses-form" class="stack-form">
        <div class="sync-grid">
          <input id="expense-merchant" placeholder="Merchant" />
          <input id="expense-amount" inputmode="decimal" placeholder="Amount" />
          <input id="expense-category" placeholder="Category" />
          <input id="expense-note" placeholder="Note / receipt detail" />
        </div>
        <button class="primary-wide orange" type="submit">Log expense</button>
      </form>
      <div class="sent-list">
        ${records.length ? records.map(renderExpenseRecord).join("") : `<p class="empty-state">No expenses logged yet.</p>`}
      </div>
    </div>
  `;
}

function renderExpenseRecord(record: ExpenseRecord): string {
  return `
    <article class="sent-card compact-card">
      <div class="sent-top">
        <div>
          <h3>${escapeHtml(record.merchant)}</h3>
          <span>${escapeHtml(record.category)} · ${escapeHtml(record.date)}</span>
        </div>
        <b>${escapeHtml(formatMoney(record.amount, record.currency))}</b>
      </div>
      <p>${escapeHtml(record.note || "Logged from SlyOS.")}</p>
    </article>
  `;
}

function renderLook(): string {
  return `
    <div class="panel-screen look-screen">
      ${screenHeader("Look")}
      <p class="screen-subtitle">Point the camera or choose an image. What SlyOS sees is analyzed through the same model and memory brain.</p>
      <div class="camera-frame ${lookImageDataUrl ? "has-image" : ""}">
        ${lookImageDataUrl ? `<img src="${escapeAttr(lookImageDataUrl)}" alt="Selected for SlyOS Look" />` : `<video id="look-video" autoplay muted playsinline></video>`}
        <div class="focus-ring" aria-hidden="true"></div>
        ${!lookImageDataUrl && !lookMediaStream ? `<p>Camera preview</p>` : ""}
      </div>
      <div class="look-actions">
        <button id="look-start" type="button">${lookMediaStream ? "Camera on" : "Open camera"}</button>
        <button id="look-capture" type="button" ${lookMediaStream ? "" : "disabled"}>Capture</button>
        <label class="look-file">Choose image<input id="look-file" type="file" accept="image/*" capture="environment" /></label>
        ${lookImageDataUrl ? `<button id="look-clear" type="button">Clear</button>` : ""}
      </div>
      <form id="look-analyze-form" class="stack-form look-form">
        <textarea id="look-prompt" placeholder="What is this? Read the receipt, identify the object, extract the form, or tell me what matters."></textarea>
        <button class="primary-wide orange" type="submit" ${lookImageDataUrl ? "" : "disabled"}>Analyze through brain</button>
      </form>
      <div class="caption-line">${escapeHtml(lookStatus)}</div>
      ${lookAnswer ? `<section class="agent-answer look-answer"><span>SlyOS sees</span><p>${escapeHtml(lookAnswer)}</p></section>` : ""}
    </div>
  `;
}

function renderVoice(): string {
  return `
    <div class="voice-screen">
      <button class="voice-end" type="button" data-voice-end="true"><span>●</span>End</button>
      <div class="voice-graph" aria-hidden="true">${renderBrainCanvas("voice")}</div>
      <div class="voice-transcript" id="voice-transcript">${escapeHtml(voiceTranscript)}</div>
      <div class="listening" id="voice-status">${escapeHtml(voiceStatus)}</div>
      <button class="voice-retry" id="voice-retry" type="button" data-voice-retry="true">Tap to listen</button>
    </div>
  `;
}

function renderSlyOrbit(size = 30): string {
  return `<canvas class="sly-orbit" data-sly-orbit="${size}" width="${size}" height="${size}" style="--orbit-size:${size}px" aria-hidden="true"></canvas>`;
}

function renderEdgeShimmer(): string {
  return `<div class="edge-shimmer" aria-hidden="true"></div>`;
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
    { id: "store", label: "Powers", icon: "storefront" }
  ];
  return `
    <nav class="bottom-nav" aria-label="SlyOS bottom navigation">
      ${items.slice(0, 2).map(renderNavItem).join("")}
      <button class="brain-tab ${["memory", "memory-settings", "mission", "network", "account", "diagnostics"].includes(screen) ? "active" : ""}" data-screen="memory" aria-label="Brain">
        <span class="nav-icon">${materialIcon("memory")}</span>
      </button>
      ${items.slice(2).map(renderNavItem).join("")}
    </nav>
  `;
}

function renderNavItem(item: { id: ShellScreen; label: string; icon: string; badge?: number }): string {
  const active =
    screen === item.id ||
    (item.id === "now" && ["outbox", "reconnect"].includes(screen)) ||
    (item.id === "research" && screen === "cowork") ||
    (item.id === "store" && ["store", "apps", "checklist", "job", "architect", "expenses", "documents", "faces", "shop", "compose", "email-compose", "spicy", "outreach", "imports", "skill", "investing", "vault", "backup", "models", "feature-parity"].includes(screen));
  return `
    <button class="nav-tab ${active ? "active" : ""}" data-screen="${item.id}" aria-label="${escapeAttr(item.label)}">
      <span class="nav-icon">${materialIcon(navMaterialIcon(item.icon))}${item.badge ? `<b>${item.badge}</b>` : ""}</span>
    </button>
  `;
}

function screenHeader(title: string, back: ShellScreen = "home"): string {
  return `
    <header class="screen-header">
      <button data-screen="${back}" aria-label="Back">${materialIcon("arrowBack")}</button>
      <h2>${escapeHtml(title)}</h2>
    </header>
  `;
}

function navMaterialIcon(icon: string): MaterialIconName {
  if (icon === "now") return "bolt";
  if (icon === "research") return "science";
  if (icon === "storefront") return "storefront";
  if (icon === "apps") return "apps";
  return "home";
}

function materialIcon(name: MaterialIconName): string {
  return materialIcons[name].replace("<svg ", '<svg aria-hidden="true" focusable="false" ');
}

function rowTool(label: string, target?: ShellScreen): string {
  return `<button class="tool-row" type="button" ${target ? `data-screen="${target}"` : ""}><span>${escapeHtml(label)}</span></button>`;
}

function shouldShowNav(current: ShellScreen): boolean {
  return !["boot", "lock", "voice", "app-view", "setup", "manual"].includes(current);
}

function wireEvents(): void {
  wireBrainCanvases();
  wireSlyOrbitCanvases();

  document.querySelector<HTMLInputElement>("#prompt-input")?.addEventListener("input", (event) => {
    const previousSeed = promptText.trim();
    promptText = (event.currentTarget as HTMLInputElement).value;
    const seed = promptText.trim();
    const previousCouldMatch = previousSeed.length >= 2 && !previousSeed.includes(" ");
    const nextCouldMatch = seed.length >= 2 && !seed.includes(" ");
    if ((!previousCouldMatch && !nextCouldMatch) || !installedApps.length) return;
    render();
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLInputElement>("#prompt-input");
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    });
  });

  document.querySelector<HTMLInputElement>("#installed-app-query")?.addEventListener("input", (event) => {
    installedAppsQuery = (event.currentTarget as HTMLInputElement).value;
    render();
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLInputElement>("#installed-app-query");
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    });
  });

  document.querySelector("[data-refresh-installed-apps]")?.addEventListener("click", () => {
    installedApps = [];
    installedAppsAttempted = false;
    installedAppIcons.clear();
    installedAppIconAttempts.clear();
    void loadInstalledApps();
  });

  document.querySelectorAll<HTMLElement>("[data-open-installed-app]").forEach((button) => {
    button.addEventListener("click", () => {
      const app = button.dataset.openInstalledApp;
      if (!app) return;
      void deviceAction(async () => {
        await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "open_app", app }) });
        agentAnswer = `Opened ${app}.`;
      });
    });
  });

  const lookVideo = document.querySelector<HTMLVideoElement>("#look-video");
  if (lookVideo && lookMediaStream) {
    lookVideo.srcObject = lookMediaStream;
    void lookVideo.play().catch(() => undefined);
  }

  document.querySelector("[data-voice-end]")?.addEventListener("click", () => {
    stopVoiceListening();
    navigate("home");
  });

  document.querySelector("[data-voice-retry]")?.addEventListener("click", () => {
    void startVoiceListening();
  });

  if (screen === "voice" && !voiceListening) {
    window.setTimeout(() => {
      if (screen === "voice" && !voiceListening) void startVoiceListening();
    }, 120);
  }

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
    void refreshNowDigest();
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
      void openTaskDraft(element.dataset.taskSend ?? "");
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

  document.querySelector("#profile-settings-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveProfileDetails();
  });

  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    darkMode = !darkMode;
    window.localStorage.setItem("slyos:darkMode", String(darkMode));
    memoryStore.setSetting("darkMode", darkMode);
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    scheduleBrainSync("appearance");
    render();
  });

  document.querySelector("#prompt-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void runPrompt();
  });

  document.querySelectorAll<HTMLElement>("[data-compose-platform]").forEach((element) => {
    element.addEventListener("click", () => {
      composePlatform = element.dataset.composePlatform || composePlatform;
      composeTopic = document.querySelector<HTMLInputElement>("#compose-topic")?.value ?? composeTopic;
      composeBody = document.querySelector<HTMLTextAreaElement>("#compose-body")?.value ?? composeBody;
      render();
    });
  });
  document.querySelector("#compose-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void generateCompose();
  });
  document.querySelector("[data-compose-revise]")?.addEventListener("click", () => {
    const revision = document.querySelector<HTMLInputElement>("#compose-revision")?.value.trim() ?? "";
    void generateCompose(revision);
  });
  document.querySelector("[data-compose-copy]")?.addEventListener("click", () => {
    void navigator.clipboard.writeText(document.querySelector<HTMLTextAreaElement>("#compose-body")?.value ?? composeBody).then(() => {
      composeStatus = "Copied.";
      render();
    });
  });
  document.querySelector("[data-compose-share]")?.addEventListener("click", () => {
    composeBody = document.querySelector<HTMLTextAreaElement>("#compose-body")?.value ?? composeBody;
    void shareText(`${composePlatform} post`, composeBody).then((shared) => {
      composeStatus = shared ? "Opened the system share sheet." : "Share cancelled.";
      render();
    });
  });

  document.querySelector("#email-compose-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void generateEmail();
  });
  document.querySelector("[data-email-revise]")?.addEventListener("click", () => {
    const revision = document.querySelector<HTMLInputElement>("#email-revision")?.value.trim() ?? "";
    void generateEmail(revision);
  });
  document.querySelector("[data-email-copy]")?.addEventListener("click", () => {
    emailSubject = document.querySelector<HTMLInputElement>("#email-subject")?.value ?? emailSubject;
    emailBody = document.querySelector<HTMLTextAreaElement>("#email-body")?.value ?? emailBody;
    void navigator.clipboard.writeText(`Subject: ${emailSubject}\n\n${emailBody}`).then(() => {
      emailStatus = "Copied.";
      render();
    });
  });
  document.querySelector("[data-email-send]")?.addEventListener("click", () => {
    emailTo = document.querySelector<HTMLInputElement>("#email-to")?.value.trim() ?? emailTo;
    emailSubject = document.querySelector<HTMLInputElement>("#email-subject")?.value.trim() ?? emailSubject;
    emailBody = document.querySelector<HTMLTextAreaElement>("#email-body")?.value ?? emailBody;
    void openEmailDraft({ to: emailTo, subject: emailSubject, body: emailBody }).then(() => {
      upsertDraft({ kind: "email", platform: "Email", topic: emailTopic, to: emailTo, subject: emailSubject, body: emailBody, status: "sent" });
      emailStatus = "Opened in your mail app for final review and send.";
      render();
    }).catch((error) => { emailStatus = error instanceof Error ? error.message : String(error); render(); });
  });

  document.querySelectorAll<HTMLElement>("[data-spicy-platform]").forEach((element) => {
    element.addEventListener("click", () => {
      spicyPlatform = element.dataset.spicyPlatform || spicyPlatform;
      spicyTopic = document.querySelector<HTMLInputElement>("#spicy-topic")?.value ?? spicyTopic;
      spicyBody = document.querySelector<HTMLTextAreaElement>("#spicy-body")?.value ?? spicyBody;
      render();
    });
  });
  document.querySelector("#spicy-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void generateSpicy();
  });
  document.querySelector("[data-spicy-revise]")?.addEventListener("click", () => {
    void generateSpicy(document.querySelector<HTMLInputElement>("#spicy-revision")?.value.trim() ?? "");
  });
  document.querySelector("[data-spicy-share]")?.addEventListener("click", () => {
    spicyBody = document.querySelector<HTMLTextAreaElement>("#spicy-body")?.value ?? spicyBody;
    void shareText(`${spicyPlatform} post`, spicyBody).then((shared) => {
      spicyStatus = shared ? "Opened the system share sheet." : "Share cancelled.";
      render();
    });
  });

  document.querySelector<HTMLInputElement>("#face-enroll-file")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    void fileToDataUrl(file).then((dataUrl) => { faceEnrollImage = dataUrl; faceStatus = ""; render(); });
  });
  document.querySelector<HTMLInputElement>("#face-recognize-file")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void recognizeFace(file);
  });
  document.querySelector("[data-face-save]")?.addEventListener("click", () => {
    const name = document.querySelector<HTMLInputElement>("#face-name")?.value.trim() ?? "";
    if (!name || !faceEnrollImage) { faceStatus = "Add a clear face photo and name."; render(); return; }
    const profile: FaceProfile = { id: localId("person"), name, imageDataUrl: faceEnrollImage, createdAt: new Date().toISOString() };
    saveFaceProfiles([profile, ...faceProfiles()]);
    memoryStore.add({ kind: "profile", title: name, body: `${name} was added to face recognition.`, tags: ["person", "face", "brain"], source: "people" });
    faceEnrollImage = "";
    faceStatus = `${name} added.`;
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-face-remove]").forEach((element) => {
    element.addEventListener("click", () => {
      saveFaceProfiles(faceProfiles().filter((profile) => profile.id !== element.dataset.faceRemove));
      faceStatus = "Person removed from face recognition.";
      render();
    });
  });

  document.querySelector("#shop-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void runShopSearch();
  });
  document.querySelectorAll<HTMLElement>("[data-open-url]").forEach((element) => {
    element.addEventListener("click", () => {
      const url = element.dataset.openUrl;
      if (!url) return;
      void openExternalUrl(url).catch((error) => { shopStatus = error instanceof Error ? error.message : String(error); render(); });
    });
  });

  document.querySelector("#outreach-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void importOutreachCsv();
  });
  document.querySelectorAll<HTMLElement>("[data-outreach-send]").forEach((element) => {
    element.addEventListener("click", () => {
      const draft = draftRecords("outreach").find((item) => item.id === element.dataset.outreachSend);
      if (!draft) return;
      void openEmailDraft(draft).then(() => {
        saveDraftRecords(draftRecords().map((item) => item.id === draft.id ? { ...item, status: "sent", updatedAt: new Date().toISOString() } : item));
        outreachStatus = `Opened ${draft.to} in your mail app for final review.`;
        render();
      }).catch((error) => { outreachStatus = error instanceof Error ? error.message : String(error); render(); });
    });
  });
  document.querySelectorAll<HTMLElement>("[data-draft-delete]").forEach((element) => {
    element.addEventListener("click", () => {
      saveDraftRecords(draftRecords().filter((draft) => draft.id !== element.dataset.draftDelete));
      render();
    });
  });

  document.querySelector("#power-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void searchPowers();
  });
  document.querySelector<HTMLInputElement>("#power-query")?.addEventListener("input", (event) => {
    powerQuery = (event.currentTarget as HTMLInputElement).value;
    render();
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLInputElement>("#power-query");
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    });
  });
  document.querySelector("[data-power-clear]")?.addEventListener("click", () => {
    powerQuery = "";
    powerStatus = "";
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-power-segment]").forEach((element) => {
    element.addEventListener("click", () => {
      const segment = element.dataset.powerSegment;
      if (!segment || !["for-you", "skill", "connect", "tool"].includes(segment)) return;
      powerSegment = segment as typeof powerSegment;
      powerQuery = "";
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-power-open]").forEach((element) => {
    element.addEventListener("click", () => {
      selectedPowerId = element.dataset.powerOpen ?? null;
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-power-close]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (element.classList.contains("power-sheet-backdrop") && event.target !== element) return;
      selectedPowerId = null;
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-power-toggle]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = element.dataset.powerToggle;
      const current = powerRecords().find((power) => power.id === id);
      if (!current) return;
      const endpoint = document.querySelector<HTMLInputElement>("#power-endpoint")?.value.trim() ?? current.endpoint ?? "";
      const enabled = !current.enabled;
      savePowerRecords(powerRecords().map((power) => power.id === id ? { ...power, enabled, endpoint, updatedAt: new Date().toISOString() } : power));
      powerStatus = enabled
        ? current.type === "skill"
          ? `${current.name} is active in the shared brain context.`
          : endpoint
            ? `${current.name} connection saved. Its endpoint still needs a compatible adapter before calls can run.`
            : `${current.name} added. Add a compatible endpoint/runtime before using it.`
        : `${current.name} removed.`;
      if (enabled && current.type === "skill" && current.instructions) {
        memoryStore.add({ kind: "memory", title: `Power: ${current.name}`, body: current.instructions, tags: ["power", "skill", "brain"], source: current.repoUrl });
      }
      selectedPowerId = null;
      render();
    });
  });

  document.querySelector("#checklist-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = document.querySelector<HTMLInputElement>("#checklist-input")?.value.trim() ?? "";
    if (!text) return;
    addChecklistItem(text);
    homeChecklistVisible = true;
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-checklist-toggle]").forEach((element) => {
    element.addEventListener("click", () => {
      toggleChecklistItem(element.dataset.checklistToggle ?? "");
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-checklist-remove]").forEach((element) => {
    element.addEventListener("click", () => {
      removeChecklistItem(element.dataset.checklistRemove ?? "");
      render();
    });
  });

  document.querySelector("#mission-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const goal = document.querySelector<HTMLTextAreaElement>("#mission-input")?.value.trim() ?? "";
    if (!goal) return;
    startMission(goal);
    render();
    void runMissionProspectSearch();
  });

  document.querySelectorAll<HTMLElement>("[data-mission-choice]").forEach((element) => {
    element.addEventListener("click", () => {
      const goal = element.dataset.missionChoice ?? "";
      if (!goal) return;
      startMission(goal);
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-mission-toggle]").forEach((element) => {
    element.addEventListener("click", () => {
      toggleMissionStep(element.dataset.missionToggle ?? "");
      render();
    });
  });

  document.querySelector<HTMLElement>("[data-mission-search]")?.addEventListener("click", () => {
    void runMissionProspectSearch();
  });

  document.querySelectorAll<HTMLElement>("[data-mission-draft]").forEach((element) => {
    element.addEventListener("click", () => {
      void draftMissionProspect(element.dataset.missionDraft ?? "");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-mission-open]").forEach((element) => {
    element.addEventListener("click", () => {
      const url = element.dataset.missionOpen ?? "";
      if (url) void openExternalUrl(url);
    });
  });

  document.querySelector("#network-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    networkQuery = document.querySelector<HTMLTextAreaElement>("#network-query")?.value.trim() ?? "";
    const results = networkResults(networkQuery);
    networkStatus = networkQuery
      ? results.length
        ? `Found ${results.length} local brain match${results.length === 1 ? "" : "es"}.`
        : "No local matches yet. Import contacts/history or save people memories first."
      : "";
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-network-draft]").forEach((element) => {
    element.addEventListener("click", () => {
      void draftNetworkMessage(element.dataset.networkDraft ?? "").then(() => render());
    });
  });

  document.querySelector("#research-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const topic = document.querySelector<HTMLInputElement>("#research-topic")?.value.trim() ?? "";
    if (!topic) return;
    researchStatus = "Drafting paper through the brain...";
    agentBusy = true;
    render();
    void createResearchPaper(topic).finally(() => {
      agentBusy = false;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-paper-open]").forEach((element) => {
    element.addEventListener("click", () => {
      savePaperToCowork(element.dataset.paperOpen ?? "");
      render();
    });
  });

  document.querySelector("#cowork-chat-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void runCoworkAgent();
  });

  document.querySelectorAll<HTMLElement>("[data-cowork-new]").forEach((element) => {
    element.addEventListener("click", () => {
      createCoworkChat();
      coworkStatus = "";
      render();
    });
  });

  document.querySelector<HTMLElement>("[data-cowork-back]")?.addEventListener("click", () => {
    coworkActiveChatId = null;
    window.localStorage.removeItem("slyos:coworkActiveChatId");
    coworkShowFiles = false;
    coworkStatus = "";
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-cowork-open]").forEach((element) => {
    element.addEventListener("click", () => {
      coworkActiveChatId = element.dataset.coworkOpen ?? null;
      if (coworkActiveChatId) window.localStorage.setItem("slyos:coworkActiveChatId", coworkActiveChatId);
      coworkShowFiles = false;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-cowork-delete]").forEach((element) => {
    element.addEventListener("click", () => {
      deleteCoworkChat(element.dataset.coworkDelete ?? "");
      render();
    });
  });

  document.querySelector("#cowork-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    coworkChatQuery = document.querySelector<HTMLInputElement>("#cowork-chat-search")?.value.trim() ?? "";
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-cowork-show-files]").forEach((element) => {
    element.addEventListener("click", () => {
      coworkShowFiles = !coworkShowFiles;
      render();
    });
  });

  document.querySelector<HTMLInputElement>("#cowork-attach")?.addEventListener("change", (event) => {
    void attachCoworkFiles((event.currentTarget as HTMLInputElement).files);
  });

  document.querySelectorAll<HTMLElement>("[data-cowork-write]").forEach((element) => {
    element.addEventListener("click", () => {
      void writeCoworkFileToBridge(element.dataset.coworkWrite ?? "");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-cowork-export]").forEach((element) => {
    element.addEventListener("click", () => {
      void exportCoworkFile(element.dataset.coworkExport ?? "").catch((error) => {
        coworkStatus = error instanceof Error ? error.message : String(error);
        render();
      });
    });
  });

  document.querySelector<HTMLInputElement>("#job-resume-file")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    jobStatus = `Reading ${file.name}…`;
    render();
    void readFileForBrain(file)
      .then((text) => {
        if (!text.trim()) throw new Error("That résumé format could not be read. Use a text-based PDF, TXT, MD, CSV, JSON, or HTML file.");
        const field = document.querySelector<HTMLTextAreaElement>("#job-resume");
        if (field) field.value = text;
        window.localStorage.setItem("slyos:jobResumeDraft", text);
        jobStatus = `${file.name} imported.`;
      })
      .catch((error) => {
        jobStatus = error instanceof Error ? error.message : String(error);
      })
      .finally(() => render());
  });

  document.querySelector("#job-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const target = document.querySelector<HTMLInputElement>("#job-target")?.value.trim() ?? "";
    const posting = document.querySelector<HTMLTextAreaElement>("#job-posting")?.value.trim() ?? "";
    const resumeSource =
      document.querySelector<HTMLTextAreaElement>("#job-resume")?.value.trim() ||
      window.localStorage.getItem("slyos:jobResumeDraft") ||
      "";
    if (!posting || !resumeSource) {
      jobStatus = "Add both the job posting and your résumé before generating.";
      render();
      return;
    }
    jobTargetPrompt = target;
    window.localStorage.setItem("slyos:jobResumeDraft", resumeSource);
    jobStatus = "Tailoring the application through your brain…";
    agentBusy = true;
    render();
    void createJobApplication({ target, posting, resumeSource })
      .catch((error) => {
        jobStatus = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        agentBusy = false;
        render();
      });
  });

  document.querySelectorAll<HTMLElement>("[data-job-copy]").forEach((element) => {
    element.addEventListener("click", () => {
      const application = jobApplications().find((candidate) => candidate.id === element.dataset.jobId);
      if (!application) return;
      const value =
        element.dataset.jobCopy === "resume"
          ? application.tailoredResume
          : element.dataset.jobCopy === "cover"
            ? application.coverLetter
            : application.outreachEmail;
      void navigator.clipboard.writeText(value).then(() => {
        jobStatus = "Copied to clipboard.";
        render();
      });
    });
  });

  document.querySelector("#architect-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    architectPrompt = document.querySelector<HTMLTextAreaElement>("#architect-prompt")?.value.trim() ?? "";
    if (!architectPrompt) return;
    architectStatus = "Building the app through your brain…";
    agentBusy = true;
    render();
    void buildMiniApp(architectPrompt)
      .then((app) => {
        activeMiniAppId = app.id;
        screen = "app-view";
      })
      .catch((error) => {
        architectStatus = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        agentBusy = false;
        render();
      });
  });

  document.querySelectorAll<HTMLElement>("[data-mini-app-open]").forEach((element) => {
    element.addEventListener("click", () => {
      activeMiniAppId = element.dataset.miniAppOpen ?? null;
      navigate("app-view");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-mini-app-delete]").forEach((element) => {
    element.addEventListener("click", () => {
      removeMiniApp(element.dataset.miniAppDelete ?? "");
      architectStatus = "Mini-app deleted.";
      render();
    });
  });

  document.querySelector("#mini-app-revise-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const instruction = document.querySelector<HTMLInputElement>("#mini-app-revise-input")?.value.trim() ?? "";
    if (!activeMiniAppId || !instruction) return;
    architectStatus = "Updating through your brain…";
    agentBusy = true;
    render();
    void reviseMiniApp(activeMiniAppId, instruction)
      .then((app) => {
        activeMiniAppId = app.id;
        architectStatus = `Updated “${app.name}”.`;
      })
      .catch((error) => {
        architectStatus = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        agentBusy = false;
        render();
      });
  });

  document.querySelector("#expenses-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveExpenseFromForm();
    render();
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

  document.querySelectorAll<HTMLElement>("[data-skill-run]").forEach((element) => {
    element.addEventListener("click", () => void runReflexSkill(element.dataset.skillRun ?? ""));
  });

  document.querySelectorAll<HTMLElement>("[data-skill-delete]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = element.dataset.skillDelete ?? "";
      const skill = reflexSkills().find((candidate) => candidate.id === id);
      saveReflexSkills(reflexSkills().filter((candidate) => candidate.id !== id));
      skillStatus = skill ? `Deleted ${skill.name}.` : "Skill deleted.";
      render();
    });
  });

  document.querySelector("#document-import-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void importDocumentFiles("document");
  });

  document.querySelector<HTMLInputElement>("#document-scan-file")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void loadDocumentScanImage(file);
  });

  document.querySelector("#document-scan-run")?.addEventListener("click", () => {
    void analyzeDocumentScan();
  });

  document.querySelectorAll<HTMLElement>("[data-document-delete]").forEach((element) => {
    element.addEventListener("click", () => {
      saveDocumentScans(documentScans().filter((scan) => scan.id !== element.dataset.documentDelete));
      documentScanStatus = "Document removed.";
      render();
    });
  });

  document.querySelector("#history-import-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void importDocumentFiles("history");
  });

  document.querySelector("#setup-import-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void importDocumentFiles("history");
  });

  document.querySelector("#look-start")?.addEventListener("click", () => {
    void startLookCamera();
  });

  document.querySelector("#look-capture")?.addEventListener("click", () => {
    void captureLookFrame();
  });

  document.querySelector<HTMLInputElement>("#look-file")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void loadLookImage(file);
  });

  document.querySelector("#look-clear")?.addEventListener("click", () => {
    lookImageDataUrl = "";
    lookAnswer = "";
    lookStatus = lookMediaStream ? "Camera ready." : "Camera idle.";
    render();
  });

  document.querySelector("#look-analyze-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void analyzeLookImage();
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

  document.querySelector("#vault-sync-reveal")?.addEventListener("click", () => {
    void unlockSyncedVault();
  });

  document.querySelector("#backup-pull")?.addEventListener("click", () => {
    void syncAction(async () => {
      await pullRemoteBrain("backup");
    });
  });

  document.querySelector("#backup-push")?.addEventListener("click", () => {
    void syncAction(async () => {
      if (!syncClient) throw new Error("Configure sync first.");
      await syncClient.pushMemory(memoryStore.list());
      await syncClient.pushSettings(memoryStore.listSettings());
      const vault = syncedVaultEnvelope();
      if (vault) await syncClient.pushVault(vault);
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
      if (document.querySelector("#provider-key")) saveProviderSettings();
      selectedProvider = readProviderId(element.dataset.provider ?? null);
      modelName = normalizeStoredModel(
        selectedProvider,
        window.localStorage.getItem(providerModelStorageKey(selectedProvider)) ?? defaultModelFor(selectedProvider)
      );
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

  document.querySelector("#provider-key-toggle")?.addEventListener("click", (event) => {
    const input = document.querySelector<HTMLInputElement>("#provider-key");
    const button = event.currentTarget as HTMLButtonElement;
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    button.textContent = input.type === "password" ? "Show" : "Hide";
  });

  document.querySelectorAll<HTMLElement>("[data-local-model]").forEach((element) => {
    element.addEventListener("click", () => {
      localModelId = element.dataset.localModel ?? "";
      localModelEnabled = Boolean(localModelId);
      window.localStorage.setItem("slyos:localModelId", localModelId);
      window.localStorage.setItem("slyos:localModelEnabled", String(localModelEnabled));
      render();
    });
  });

  document.querySelector("#local-model-none")?.addEventListener("click", () => {
    localModelEnabled = false;
    localModelId = "";
    window.localStorage.setItem("slyos:localModelId", "");
    window.localStorage.setItem("slyos:localModelEnabled", "false");
    render();
  });

  document.querySelector("#local-model-refresh")?.addEventListener("click", () => {
    void refreshLocalModels();
  });

  document.querySelector("#setup-back")?.addEventListener("click", () => {
    persistSetupStep(Math.max(0, setupStep - 1));
  });

  document.querySelector("#setup-skip")?.addEventListener("click", () => {
    persistSetupStep(Math.min(4, setupStep + 1));
  });

  document.querySelector("#setup-next")?.addEventListener("click", () => {
    if (setupStep === 0) {
      saveProviderSettings();
      if (providerApiKey.trim().length < 8) {
        providerStatus = "Paste a valid-looking provider key before continuing.";
        render();
        return;
      }
      providerStatus = `${providerLabel()} settings saved on this device.`;
    }
    if (setupStep === 2) saveProfileSettings();
    if (setupStep < 4) {
      persistSetupStep(setupStep + 1);
      return;
    }
    completeSetup();
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
      recordDiagnostic("sync", "ok", "Supabase client configured.");
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
      syncUserId = (await syncClient.currentUserId()) ?? "";
      if (!syncUserId) throw new Error("Sign-in returned no active account session.");
      syncStatus = `Signed in · ${syncUserId.slice(0, 8)}`;
      recordDiagnostic("sync", "ok", "Signed in and restored the account session.");
      await pullRemoteBrain("sign-in");
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
      syncUserId = (await syncClient.currentUserId()) ?? "";
      syncStatus = syncUserId ? `Account created and signed in · ${syncUserId.slice(0, 8)}` : "Account created. Confirm the email, then sign in.";
      recordDiagnostic("sync", "ok", syncStatus);
      if (syncUserId) await pullRemoteBrain("account-created");
    });
  });

  document.querySelector("#sync-push")?.addEventListener("click", () => {
    void syncAction(async () => {
      if (!syncClient) throw new Error("Configure sync first.");
      syncUserId = (await syncClient.currentUserId()) ?? "";
      if (!syncUserId) throw new Error("Sign in before syncing memory or settings.");
      await pushRemoteBrain("manual");
    });
  });

  document.querySelector("#sync-pull")?.addEventListener("click", () => {
    void syncAction(async () => {
      if (!syncClient) throw new Error("Configure sync first.");
      syncUserId = (await syncClient.currentUserId()) ?? "";
      if (!syncUserId) throw new Error("Sign in before syncing memory or settings.");
      await pullRemoteBrain("manual");
    });
  });

  document.querySelector("#sync-signout")?.addEventListener("click", () => {
    void syncAction(async () => {
      if (!syncClient) return;
      await syncClient.signOut();
      syncUserId = "";
      syncStatus = "Signed out.";
      recordDiagnostic("sync", "ok", "Signed out locally.");
    });
  });

  document.querySelector("#diagnostics-refresh")?.addEventListener("click", () => {
    void (async () => {
      try {
        await checkDeviceBridge();
        recordDiagnostic("bridge", "ok", deviceBridgeStatus);
      } catch (error) {
        recordDiagnostic("bridge", "error", error instanceof Error ? error.message : String(error));
      }
      if (syncClient) syncUserId = (await syncClient.currentUserId()) ?? "";
      await loadDeviceDiagnostics();
      render();
    })();
  });

  document.querySelector("#diagnostics-open")?.addEventListener("click", () => {
    void deviceAction(async () => {
      await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "open_diagnostics" }) });
    });
  });

  document.querySelector("#diagnostics-clear")?.addEventListener("click", () => {
    window.localStorage.removeItem(diagnosticsKey);
    recordDiagnostic("runtime", "info", "Local app diagnostics cleared.");
    render();
  });

  document.querySelector("#backup-export")?.addEventListener("click", () => {
    backupStatus = "Encrypting snapshot…";
    render();
    void exportBrainBackup().catch((error) => {
      backupStatus = error instanceof Error ? error.message : String(error);
      render();
    }).then(() => render());
  });

  document.querySelector<HTMLInputElement>("#backup-import-file")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    backupStatus = "Decrypting snapshot…";
    void importBrainBackup(file).catch((error) => {
      backupStatus = error instanceof Error ? `Restore failed: ${error.message}` : `Restore failed: ${String(error)}`;
      render();
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
      await refreshDevicePermissions();
    });
  });

  document.querySelector("#device-permissions")?.addEventListener("click", () => {
    void deviceAction(async () => {
      await refreshDevicePermissions();
    });
  });

  document.querySelector("#device-request-permissions")?.addEventListener("click", () => {
    const nativeWindow = window as Window & { slyosRequestMacPermissions?: () => void };
    if (typeof nativeWindow.slyosRequestMacPermissions === "function") {
      nativeWindow.slyosRequestMacPermissions();
      deviceBridgeStatus = "Follow the macOS prompts, then relaunch SlyOS once for Screen Recording.";
      window.setTimeout(() => void deviceAction(refreshDevicePermissions), 2500);
      render();
      return;
    }
    void deviceAction(async () => {
      await deviceFetch("/actions", {
        method: "POST",
        body: JSON.stringify({ type: "open_permission_settings", permission: "screen" })
      });
    });
  });

  document.querySelectorAll<HTMLElement>("[data-open-mac-permission]").forEach((element) => {
    element.addEventListener("click", () => {
      const permission = element.dataset.openMacPermission;
      if (!permission) return;
      void deviceAction(async () => {
        await deviceFetch("/actions", {
          method: "POST",
          body: JSON.stringify({ type: "open_permission_settings", permission })
        });
      });
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
  if (!hasTextModel()) return localDraft;
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

function isCalendarWriteRequest(prompt: string): boolean {
  const write = /\b(schedule|add|create|book|block|put|set up)\b/i.test(prompt);
  const target = /\b(calendar|meeting|appointment|event|call|time block)\b/i.test(prompt);
  const readOnly = /\b(what|show|check|read|do i have|what(?:'s| is) on)\b/i.test(prompt);
  return write && target && !readOnly;
}

function isReminderWriteRequest(prompt: string): boolean {
  const write = /\b(remind me|add|create|make|set)\b/i.test(prompt);
  const target = /\b(reminder|remind me|to[ -]?do)\b/i.test(prompt);
  const readOnly = /\b(what|show|check|read|list|do i have)\b/i.test(prompt);
  return write && target && !readOnly;
}

async function resolveReminderRequest(prompt: string): Promise<ReminderDraft> {
  const fallbackTitle = cleanCommandSubject(
    prompt
      .replace(/^.*?\bremind me(?:\s+to)?\s+/i, "")
      .replace(/^.*?\b(?:add|create|make|set)\s+(?:a\s+)?(?:reminder|to[ -]?do)(?:\s+to|\s+for)?\s+/i, "")
  ).slice(0, 240);
  if (!hasTextModel()) {
    if (!fallbackTitle) throw new Error("Tell SlyOS what the reminder should say.");
    return { title: fallbackTitle, due: "", notes: "" };
  }
  const now = new Date();
  const parsed = await generateJsonWithProvider<Record<string, unknown>>({
    provider: selectedProvider,
    apiKey: providerApiKey,
    model: modelName,
    maxOutputTokens: 500,
    memoryContext: buildMemoryContext(prompt),
    prompt: [
      "Extract one reminder from the request.",
      "Return JSON with string keys title, due, notes.",
      "due must be a complete ISO 8601 timestamp with an offset, or an empty string when no time is requested.",
      "Keep the title concise. Never invent notes.",
      `Current local time: ${now.toString()}`,
      `Current ISO time: ${now.toISOString()}`,
      `Request: ${prompt}`
    ].join("\n\n")
  });
  const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 240) : fallbackTitle;
  const dueDate = new Date(typeof parsed.due === "string" ? parsed.due : "");
  if (!title) throw new Error("SlyOS could not resolve a reminder title. Nothing was added.");
  return {
    title,
    due: Number.isFinite(dueDate.getTime()) ? dueDate.toISOString() : "",
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 2000) : ""
  };
}

async function createNativeReminder(prompt: string): Promise<string> {
  const reminder = await resolveReminderRequest(prompt);
  const action = { type: "create_reminder", ...reminder };
  const payload = nativePlatform === "ios"
    ? await runIosDevicePrimitive(action)
    : await deviceFetch("/actions", { method: "POST", body: JSON.stringify(action) });
  const message = String(payload.message ?? payload.result?.message ?? `Added ${reminder.title}.`);
  const due = reminder.due ? new Date(reminder.due).toLocaleString() : "No due date";
  memoryStore.add({
    kind: "memory",
    title: `Reminder: ${reminder.title}`,
    body: `${message}\nDue: ${due}${reminder.notes ? `\n${reminder.notes}` : ""}`,
    tags: ["reminder", "task", "device", "brain"],
    source: platformLabel()
  });
  recordOutbox({
    title: `Added reminder: ${reminder.title}`,
    target: due,
    channel: "Reminders",
    body: reminder.notes || reminder.title,
    why: "created from an explicit Home prompt through the native device bridge",
    status: "done"
  });
  return message;
}

async function stageCalendarRequest(prompt: string): Promise<NowTask> {
  if (!hasTextModel()) throw new Error("Add a cloud model key or enable an on-device text model before SlyOS resolves event details.");
  const now = new Date();
  const raw = await generateWithProvider({
    provider: selectedProvider,
    apiKey: providerApiKey,
    model: modelName,
    maxOutputTokens: 700,
    memoryContext: buildMemoryContext(),
    prompt: [
      "Extract one calendar event from the request. Return strict JSON only.",
      "Required string keys: title, start, end, location, notes.",
      "start and end must be complete ISO 8601 timestamps with an offset. Resolve relative dates from the supplied current time.",
      "Use a one-hour duration when no duration is stated. Never invent a location or notes; use an empty string.",
      `Current local time: ${now.toString()}`,
      `Current ISO time: ${now.toISOString()}`,
      `Request: ${prompt}`
    ].join("\n\n")
  });
  const parsed = parseJsonObject(raw);
  const title = typeof parsed?.title === "string" ? parsed.title.trim().slice(0, 160) : "";
  const startDate = new Date(typeof parsed?.start === "string" ? parsed.start : "");
  const endDate = new Date(typeof parsed?.end === "string" ? parsed.end : "");
  if (!title || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
    throw new Error("SlyOS could not resolve a valid event title and time. Be more specific; nothing was added.");
  }
  const calendarEvent: CalendarEventDraft = {
    title,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    location: typeof parsed?.location === "string" ? parsed.location.trim().slice(0, 300) : "",
    notes: typeof parsed?.notes === "string" ? parsed.notes.trim().slice(0, 2000) : ""
  };
  const when = startDate.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const draft = `${calendarEvent.title} · ${when}${calendarEvent.location ? ` · ${calendarEvent.location}` : ""}`;
  const createdAt = new Date().toISOString();
  const task: NowTask = {
    id: localId("task"),
    contact: calendarEvent.title,
    app: "Calendar",
    text: prompt,
    draft,
    status: "drafted",
    createdAt,
    updatedAt: createdAt,
    source: "home",
    calendarEvent
  };
  saveNowTasks([task, ...nowTasks()]);
  recordOutbox({
    title: `Calendar draft: ${calendarEvent.title}`,
    target: when,
    channel: "Calendar",
    body: draft,
    why: "parsed through the brain and held in Now until you confirm",
    status: "draft"
  });
  return task;
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

async function openTaskDraft(id: string): Promise<void> {
  const task = nowTasks().find((item) => item.id === id);
  if (!task || !task.draft) return;
  try {
    if (task.calendarEvent) {
      const action = { type: "create_calendar_event", ...task.calendarEvent };
      const payload = nativePlatform === "ios"
        ? await runIosDevicePrimitive(action)
        : await deviceFetch("/actions", { method: "POST", body: JSON.stringify(action) });
      const resultMessage = String(payload.message ?? (payload.result as Record<string, unknown> | undefined)?.message ?? "Event added to Calendar.");
      memoryStore.add({
        kind: "memory",
        title: `Calendar: ${task.calendarEvent.title}`,
        body: `${task.draft}\n${resultMessage}`,
        tags: ["calendar", "event", "confirmed", "brain"],
        source: platformLabel()
      });
      recordOutbox({
        title: `Added ${task.calendarEvent.title}`,
        target: task.draft,
        channel: "Calendar",
        body: task.text,
        why: "added only after confirmation in Now",
        status: "done"
      });
      saveNowTasks(nowTasks().map((item) => (item.id === id ? { ...item, status: "sent", updatedAt: new Date().toISOString() } : item)));
      agentAnswer = resultMessage;
      recordDiagnostic("bridge", "ok", resultMessage);
      scheduleBrainSync("calendar-event");
      render();
      return;
    } else if (task.app === "Mail") {
      const destination = await resolveDraftDestination(task.contact, "email");
      if (nativePlatform === "macos") {
        const payload = await deviceFetch("/actions", {
          method: "POST",
          body: JSON.stringify({ type: "send_email", to: destination, subject: task.text.slice(0, 80), body: task.draft })
        });
        const message = String(payload.result?.message ?? `Sent email to ${destination}.`);
        recordOutbox({
          title: `Sent email to ${task.contact}`,
          target: task.contact,
          channel: task.app,
          body: task.draft,
          why: "sent only after explicit confirmation in Now",
          status: "sent"
        });
        saveNowTasks(nowTasks().map((item) => (item.id === id ? { ...item, status: "sent", updatedAt: new Date().toISOString() } : item)));
        agentAnswer = message;
        recordDiagnostic("bridge", "ok", message);
        scheduleBrainSync("outbound-send");
        render();
        return;
      }
      await openEmailDraft({ to: destination, subject: task.text.slice(0, 80), body: task.draft });
    } else if (task.app === "Messages") {
      const destination = await resolveDraftDestination(task.contact, "phone");
      if (nativePlatform === "macos") {
        const payload = await deviceFetch("/actions", {
          method: "POST",
          body: JSON.stringify({ type: "send_message", to: destination, body: task.draft })
        });
        const message = String(payload.result?.message ?? `Sent a message to ${destination}.`);
        recordOutbox({
          title: `Sent message to ${task.contact}`,
          target: task.contact,
          channel: task.app,
          body: task.draft,
          why: "sent only after explicit confirmation in Now",
          status: "sent"
        });
        saveNowTasks(nowTasks().map((item) => (item.id === id ? { ...item, status: "sent", updatedAt: new Date().toISOString() } : item)));
        agentAnswer = message;
        recordDiagnostic("bridge", "ok", message);
        scheduleBrainSync("outbound-send");
        render();
        return;
      }
      await openExternalUrl(`sms:${encodeURIComponent(destination)}?body=${encodeURIComponent(task.draft)}`);
    } else if (task.app === "LinkedIn" && task.pkg && /^https:\/\//i.test(task.pkg)) {
      if (nativePlatform === "macos") {
        await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "set_clipboard", text: task.draft }) });
      } else {
        await navigator.clipboard.writeText(task.draft);
      }
      await openExternalUrl(task.pkg);
    } else {
      if (nativePlatform === "macos") {
        await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "set_clipboard", text: task.draft }) });
        await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "open_app", app: task.app }) });
      } else {
        await navigator.clipboard.writeText(task.draft);
      }
    }
    recordOutbox({
      title: `Draft opened for ${task.contact}`,
      target: task.contact,
      channel: task.app,
      body: task.draft,
      why: "drafted from your brain/persona and opened in the native app for final review",
      status: "draft"
    });
    saveNowTasks(nowTasks().map((item) => (item.id === id ? { ...item, status: "drafted", updatedAt: new Date().toISOString() } : item)));
    recordDiagnostic("bridge", "ok", `Opened ${task.app} draft for final review.`);
  } catch (error) {
    recordDiagnostic("bridge", "error", error instanceof Error ? error.message : String(error));
    agentAnswer = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function resolveDraftDestination(contact: string, kind: "email" | "phone"): Promise<string> {
  const clean = contact.trim();
  if (kind === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return clean;
  if (kind === "phone" && /^[+()\d\s.-]{7,}$/.test(clean)) return clean;
  if (nativePlatform !== "macos") return clean;
  const payload = await deviceFetch("/actions", {
    method: "POST",
    body: JSON.stringify({ type: "search_contacts", query: clean, limit: 5 })
  });
  const contacts = Array.isArray(payload.result?.contacts) ? payload.result.contacts : [];
  const values = contacts.flatMap((candidate: Record<string, unknown>) => {
    const field = kind === "email" ? candidate.emails : candidate.phones;
    return Array.isArray(field) ? field.map(String).filter(Boolean) : [];
  });
  if (!values.length) throw new Error(`No ${kind === "email" ? "email address" : "phone number"} was found for ${clean}.`);
  return values[0]!;
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

async function refreshDevicePermissions(): Promise<void> {
  if (nativePlatform !== "macos") return;
  const payload = await deviceFetch("/actions", {
    method: "POST",
    body: JSON.stringify({ type: "get_permissions" })
  });
  const result = payload.result ?? {};
  devicePermissionStatus = {
    checked: true,
    sessionLocked: result.sessionLocked === true,
    screenRecording: typeof result.screenRecording === "boolean" ? result.screenRecording : null,
    accessibility: typeof result.accessibility === "boolean" ? result.accessibility : null,
    automation: typeof result.automation === "boolean" ? result.automation : null,
    ...(result.errors && typeof result.errors === "object" ? { errors: result.errors as Record<string, string> } : {})
  };
  recordDiagnostic(
    "bridge",
    devicePermissionStatus.screenRecording && devicePermissionStatus.accessibility ? "ok" : "error",
    `Mac permissions · ${permissionSummary()}`
  );
}

function wireBrainCanvases(): void {
  document.querySelectorAll<HTMLCanvasElement>("[data-brain-canvas]").forEach((canvas) => {
    const mode = canvas.dataset.brainCanvas === "voice" ? "voice" : "memory";
    const pathKeys = new Set(memoryPathKeys);
    const items = mode === "memory" && memoryQuery
      ? localMemories().filter((item) => pathKeys.has(item.id))
      : localMemories();
    const graph = buildBrainGraph(items);
    const options: BrainCanvasOptions = {
      mode,
      selectedKey: mode === "memory" ? selectedBrainKey : null,
      filterType: mode === "memory" ? memoryFilter : null,
      highlightKeys: mode === "memory" ? memoryPathKeys : [],
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

function wireSlyOrbitCanvases(): void {
  document.querySelectorAll<HTMLCanvasElement>("[data-sly-orbit]").forEach(wireSlyOrbitCanvas);
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

  if (!hasTextModel()) {
    agentAnswer = "Setup needs a cloud key or an enabled on-device text model before SlyOS can answer.";
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
      memoryContext: buildMemoryContext(),
      useWebSearch: hasCloudModel()
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

async function generateCompose(revision = ""): Promise<void> {
  composePlatform = document.querySelector<HTMLElement>("[data-compose-platform].active")?.dataset.composePlatform || composePlatform;
  composeTopic = document.querySelector<HTMLInputElement>("#compose-topic")?.value.trim() ?? composeTopic;
  composeBody = document.querySelector<HTMLTextAreaElement>("#compose-body")?.value ?? composeBody;
  if (!composeTopic && !composeBody) {
    composeStatus = "Add a topic or a draft first.";
    render();
    return;
  }
  await runDraftProviderAction(async () => {
    const output = await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      memoryContext: buildMemoryContext(),
      maxOutputTokens: 1200,
      prompt: [
        `Write a ${composePlatform} post in the user's established voice.`,
        `Topic: ${composeTopic || "Use the current draft topic."}`,
        composeBody ? `Current draft: ${composeBody}` : "",
        revision ? `Revision request: ${revision}` : "",
        "Return only the post text, ready to paste. Do not invent personal experiences or factual claims."
      ].filter(Boolean).join("\n")
    });
    composeBody = output.trim();
    upsertDraft({ kind: "social", platform: composePlatform, topic: composeTopic, to: "", subject: "", body: composeBody, status: "draft" });
    composeStatus = `Drafted through ${providerLabel()}.`;
  }, (message) => { composeStatus = message; });
}

async function generateEmail(revision = ""): Promise<void> {
  emailTo = document.querySelector<HTMLInputElement>("#email-to")?.value.trim() ?? emailTo;
  emailTopic = document.querySelector<HTMLInputElement>("#email-topic")?.value.trim() ?? emailTopic;
  emailSubject = document.querySelector<HTMLInputElement>("#email-subject")?.value.trim() ?? emailSubject;
  emailBody = document.querySelector<HTMLTextAreaElement>("#email-body")?.value ?? emailBody;
  if (!emailTopic && !emailBody) {
    emailStatus = "Add the purpose of the email first.";
    render();
    return;
  }
  await runDraftProviderAction(async () => {
    const raw = await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      memoryContext: buildMemoryContext(),
      maxOutputTokens: 1600,
      prompt: [
        "Draft an email in the user's writing voice. Return strict JSON with subject and body only.",
        `Recipient: ${emailTo || "not supplied"}`,
        `Purpose: ${emailTopic || "revise the existing draft"}`,
        emailSubject ? `Current subject: ${emailSubject}` : "",
        emailBody ? `Current body: ${emailBody}` : "",
        revision ? `Revision request: ${revision}` : "",
        "Do not invent relationships, events, commitments, or claims."
      ].filter(Boolean).join("\n")
    });
    const parsed = parseJsonObject(raw);
    if (!parsed || typeof parsed.body !== "string") throw new Error("The model did not return a usable email draft.");
    emailSubject = typeof parsed.subject === "string" ? parsed.subject.trim() : emailSubject;
    emailBody = parsed.body.trim();
    upsertDraft({ kind: "email", platform: "Email", topic: emailTopic, to: emailTo, subject: emailSubject, body: emailBody, status: "draft" });
    emailStatus = `Drafted through ${providerLabel()}.`;
  }, (message) => { emailStatus = message; });
}

async function generateSpicy(revision = ""): Promise<void> {
  spicyTopic = document.querySelector<HTMLInputElement>("#spicy-topic")?.value.trim() ?? spicyTopic;
  spicyBody = document.querySelector<HTMLTextAreaElement>("#spicy-body")?.value ?? spicyBody;
  if (!spicyTopic && !spicyBody) {
    spicyStatus = "Add a topic first.";
    render();
    return;
  }
  await runDraftProviderAction(async () => {
    const limit = spicyPlatform === "X" ? 280 : 4000;
    const output = await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      memoryContext: buildMemoryContext(),
      maxOutputTokens: 1200,
      useWebSearch: true,
      prompt: [
        `Write a sharp but constructive ${spicyPlatform} post about: ${spicyTopic}.`,
        spicyBody ? `Current draft: ${spicyBody}` : "",
        revision ? `Revision request: ${revision}` : "",
        `Maximum ${limit} characters. Use evidence, avoid harassment, and return only the post.`
      ].filter(Boolean).join("\n")
    });
    spicyBody = output.split("\n\nSources:")[0]?.trim().slice(0, limit) ?? "";
    upsertDraft({ kind: "spicy", platform: spicyPlatform, topic: spicyTopic, to: "", subject: "", body: spicyBody, status: "draft" });
    spicyStatus = `Drafted through ${providerLabel()}.`;
  }, (message) => { spicyStatus = message; });
}

async function runDraftProviderAction(run: () => Promise<void>, setError: (message: string) => void): Promise<void> {
  if (!hasTextModel()) {
    setError("Add a cloud model key or enable an on-device text model in Setup first.");
    render();
    return;
  }
  agentBusy = true;
  render();
  try {
    await run();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    agentBusy = false;
    render();
  }
}

async function shareText(title: string, text: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
    }
  }
  await navigator.clipboard.writeText(text);
  return true;
}

async function openEmailDraft(draft: { to: string; subject: string; body: string }): Promise<void> {
  const url = `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  await openExternalUrl(url);
}

async function openExternalUrl(url: string): Promise<void> {
  if (!/^(https?:|mailto:|sms:|tel:|facetime:)/i.test(url)) throw new Error("Unsupported external URL.");
  if (nativePlatform === "macos" && deviceBridgeToken) {
    await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "open_url", url }) });
    return;
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

async function recognizeFace(file: File): Promise<void> {
  const profiles = faceProfiles();
  if (!profiles.length) {
    faceStatus = "Add some people first, then SlyOS can recognize them.";
    render();
    return;
  }
  if (!providerApiKey.trim()) {
    faceStatus = "Add and test a vision-capable model key in Setup first.";
    render();
    return;
  }
  agentBusy = true;
  faceStatus = "Looking…";
  render();
  try {
    faceRecognizeImage = await fileToDataUrl(file);
    const sheet = await buildFaceComparisonSheet(faceRecognizeImage, profiles);
    const names = profiles.map((profile) => profile.name);
    const answer = await generateVisionWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      memoryContext: "Face recognition roster supplied explicitly for this request.",
      imageDataUrl: sheet,
      prompt: `The large image labeled QUERY is the person to identify. Compare it to the labeled roster portraits. Return exactly one roster name from this JSON list ${JSON.stringify(names)}, or UNKNOWN. Do not guess when facial identity is uncertain.`
    });
    const normalized = answer.trim().replace(/^['"`]+|['"`.]+$/g, "");
    const matched = profiles.find((profile) => normalized.toLowerCase() === profile.name.toLowerCase());
    faceStatus = matched ? `This looks like ${matched.name}.` : "New face — not in your people yet.";
  } catch (error) {
    faceStatus = error instanceof Error ? error.message : String(error);
  } finally {
    agentBusy = false;
    render();
  }
}

async function buildFaceComparisonSheet(query: string, profiles: FaceProfile[]): Promise<string> {
  const selected = profiles.slice(0, 12);
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 360 + Math.ceil(selected.length / 4) * 230;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Face comparison canvas is unavailable.");
  context.fillStyle = "#f4efe6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const queryImage = await loadImageElement(query);
  drawCoverImage(context, queryImage, 330, 36, 300, 260);
  context.fillStyle = "#1a1714";
  context.font = "700 28px Roboto, sans-serif";
  context.textAlign = "center";
  context.fillText("QUERY", 480, 330);
  const images = await Promise.all(selected.map((profile) => loadImageElement(profile.imageDataUrl)));
  images.forEach((image, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = 30 + column * 232;
    const y = 370 + row * 230;
    drawCoverImage(context, image, x, y, 204, 170);
    context.fillStyle = "#1a1714";
    context.font = "500 22px Roboto, sans-serif";
    context.textAlign = "center";
    context.fillText(selected[index]?.name ?? "", x + 102, y + 204, 204);
  });
  return canvas.toDataURL("image/jpeg", 0.88);
}

function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number): void {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
}

async function runShopSearch(): Promise<void> {
  shopQuery = document.querySelector<HTMLTextAreaElement>("#shop-query")?.value.trim() ?? shopQuery;
  if (!shopQuery) return;
  shopStatus = "Searching current stores…";
  await runDraftProviderAction(async () => {
    const raw = await generateWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      memoryContext: buildMemoryContext(),
      maxOutputTokens: 2200,
      useWebSearch: true,
      prompt: [
        `Find current purchase options for: ${shopQuery}.`,
        "Return strict JSON only as {\"results\":[{\"name\":\"\",\"merchant\":\"\",\"price\":\"\",\"url\":\"https://...\",\"note\":\"\"}]}",
        "Use only URLs and prices found in live search results. Omit any option whose direct URL is uncertain. Return at most 6."
      ].join("\n")
    });
    const parsed = parseJsonObject(raw);
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    shopResults = results.map((item, index): ShopResult | null => {
      if (!item || typeof item !== "object") return null;
      const value = item as Record<string, unknown>;
      const url = typeof value.url === "string" ? value.url.trim() : "";
      const name = typeof value.name === "string" ? value.name.trim() : "";
      if (!name || !/^https:\/\//i.test(url)) return null;
      return {
        id: `shop_${index}`,
        name,
        merchant: typeof value.merchant === "string" ? value.merchant.trim() : new URL(url).hostname,
        price: typeof value.price === "string" ? value.price.trim() : "",
        url,
        note: typeof value.note === "string" ? value.note.trim() : ""
      };
    }).filter((item): item is ShopResult => Boolean(item));
    if (!shopResults.length) throw new Error("No verifiable purchase links were returned. Add more product detail and try again.");
    shopStatus = `${shopResults.length} current option${shopResults.length === 1 ? "" : "s"} found. Verify the final price on the store page.`;
    memoryStore.add({ kind: "memory", title: `Shopping search: ${shopQuery}`, body: shopResults.map((item) => `${item.name} · ${item.merchant} · ${item.price} · ${item.url}`).join("\n"), tags: ["shop", "research", "brain"], source: providerLabel() });
  }, (message) => { shopStatus = message; });
}

async function importOutreachCsv(): Promise<void> {
  outreachTopic = document.querySelector<HTMLTextAreaElement>("#outreach-topic")?.value.trim() ?? outreachTopic;
  const file = document.querySelector<HTMLInputElement>("#outreach-file")?.files?.[0];
  if (!outreachTopic || !file) {
    outreachStatus = "Add the outreach purpose and a CSV file.";
    render();
    return;
  }
  const rows = parseCsvRows(await file.text());
  const contacts = rows.map((row) => {
    const email = Object.values(row).find((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))?.trim() ?? "";
    const name = row.name || row.full_name || row.first_name || row.contact || "";
    const company = row.company || row.organization || row.org || "";
    return { email, name, company };
  }).filter((contact) => contact.email).slice(0, 25);
  if (!contacts.length) {
    outreachStatus = "No email addresses were found in the CSV.";
    render();
    return;
  }
  outreachStatus = `Drafting ${contacts.length} review-gated email${contacts.length === 1 ? "" : "s"}…`;
  await runDraftProviderAction(async () => {
    const created: DraftRecord[] = [];
    for (const contact of contacts) {
      const raw = await generateWithProvider({
        provider: selectedProvider,
        apiKey: providerApiKey,
        model: modelName,
        memoryContext: buildMemoryContext(),
        maxOutputTokens: 900,
        prompt: `Draft one concise outreach email. Purpose: ${outreachTopic}. Recipient name: ${contact.name || "unknown"}. Company: ${contact.company || "unknown"}. Email: ${contact.email}. Return strict JSON with subject and body only. Do not invent personal facts.`
      });
      const parsed = parseJsonObject(raw);
      if (!parsed || typeof parsed.body !== "string") continue;
      const now = new Date().toISOString();
      created.push({ id: localId("outreach"), kind: "outreach", platform: "Email", topic: outreachTopic, to: contact.email, subject: typeof parsed.subject === "string" ? parsed.subject.trim() : outreachTopic, body: parsed.body.trim(), status: "draft", createdAt: now, updatedAt: now });
    }
    if (!created.length) throw new Error("The model did not return usable outreach drafts.");
    saveDraftRecords([...created, ...draftRecords()]);
    outreachStatus = `${created.length} draft${created.length === 1 ? "" : "s"} ready for review.`;
  }, (message) => { outreachStatus = message; });
}

function parseCsvRows(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  const headers = (rows.shift() ?? []).map((header, index) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `column_${index + 1}`);
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

async function searchPowers(): Promise<void> {
  powerQuery = document.querySelector<HTMLInputElement>("#power-query")?.value.trim() ?? powerQuery;
  if (!powerQuery) return;
  powerStatus = "Searching GitHub…";
  render();
  try {
    const repoMatch = powerQuery.match(/github\.com\/([^/\s]+)\/([^/#?\s]+)/i);
    const query = repoMatch?.[1] && repoMatch[2] ? `repo:${repoMatch[1]}/${repoMatch[2].replace(/\.git$/i, "")}` : `${powerQuery} in:name,description`;
    const response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=12`, { headers: { accept: "application/vnd.github+json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String((payload as any)?.message || `GitHub search failed: ${response.status}`));
    const current = new Map(powerRecords().map((power) => [power.id, power]));
    const found: PowerRecord[] = (Array.isArray((payload as any)?.items) ? (payload as any).items : []).map((repo: any) => {
      const id = String(repo.full_name || repo.id);
      return { id, name: String(repo.full_name || repo.name || "Repository"), repoUrl: String(repo.html_url || ""), description: String(repo.description || ""), stars: Number(repo.stargazers_count || 0), enabled: current.get(id)?.enabled ?? false, updatedAt: new Date().toISOString() };
    }).filter((power: PowerRecord) => /^https:\/\/github\.com\//i.test(power.repoUrl));
    savePowerRecords([...found, ...powerRecords().filter((power) => !found.some((item) => item.id === power.id))]);
    powerStatus = found.length ? `${found.length} live GitHub result${found.length === 1 ? "" : "s"}. Review source before enabling.` : "No matching repositories found.";
  } catch (error) {
    powerStatus = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function startLookCamera(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    lookStatus = "Camera capture is unavailable here. Choose an image instead.";
    render();
    return;
  }
  try {
    stopLookCamera();
    lookMediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    lookImageDataUrl = "";
    lookStatus = "Camera ready. Frame the subject and tap Capture.";
  } catch (error) {
    lookStatus = error instanceof Error ? `Camera blocked: ${error.message}` : "Camera permission was not granted.";
  }
  render();
}

async function loadDocumentScanImage(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    documentScanStatus = "Choose a photo of a receipt, invoice, ID, or form.";
    render();
    return;
  }
  try {
    const raw = await fileToDataUrl(file);
    const image = await loadImageElement(raw);
    documentScanImage = imageElementToDataUrl(image, image.naturalWidth, image.naturalHeight);
    documentScanStatus = `${file.name} ready to read.`;
  } catch (error) {
    documentScanStatus = error instanceof Error ? error.message : "The document image could not be read.";
  }
  render();
}

async function analyzeDocumentScan(): Promise<void> {
  if (!documentScanImage || !providerApiKey.trim()) return;
  documentScanStatus = `Reading with ${providerLabel()}…`;
  agentBusy = true;
  render();
  try {
    const raw = await generateVisionWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      maxOutputTokens: 1800,
      memoryContext: buildMemoryContext(),
      imageDataUrl: documentScanImage,
      prompt: [
        "Read this document carefully and return strict JSON only.",
        "Required keys: category, title, summary, fields.",
        "category should be receipt, invoice, identity, form, statement, contract, letter, or other.",
        "fields must be an object of useful labels and exact visible values. Never infer hidden values."
      ].join(" ")
    });
    const parsed = parseJsonObject(raw);
    if (!parsed) throw new Error("The model did not return structured document data. Try a clearer, flatter photo.");
    const fields = normalizeDocumentFields(parsed.fields);
    const category = cleanCommandSubject(typeof parsed.category === "string" ? parsed.category : "other").toLowerCase() || "other";
    const title = cleanCommandSubject(typeof parsed.title === "string" ? parsed.title : "Scanned document") || "Scanned document";
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "Document scanned and filed through SlyOS.";
    const now = new Date().toISOString();
    const scan: DocumentScanRecord = {
      id: localId("scan"),
      category,
      title,
      summary,
      fields,
      createdAt: now,
      updatedAt: now
    };
    saveDocumentScans([scan, ...documentScans()]);
    memoryStore.add({
      kind: "document",
      title: scan.title,
      body: `${scan.summary}\n\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}`,
      tags: ["document", "scan", "brain", category],
      source: "document scan"
    });
    const expense = expenseFromDocumentScan(scan);
    if (expense) logExpense(expense);
    documentScanImage = "";
    documentScanStatus = `Filed in ${category}${expense ? " and logged as an expense" : ""}: ${title}`;
  } catch (error) {
    documentScanStatus = error instanceof Error ? error.message : String(error);
  } finally {
    agentBusy = false;
    render();
  }
}

function normalizeDocumentFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, field]) => field !== null && field !== undefined && typeof field !== "object")
      .map(([key, field]) => [key.trim().slice(0, 80), String(field).trim().slice(0, 1000)])
      .filter(([key, field]) => Boolean(key && field))
  );
}

function expenseFromDocumentScan(scan: DocumentScanRecord): {
  merchant: string;
  amount: number;
  category?: string;
  note?: string;
  date?: string;
} | null {
  if (!/receipt|invoice/i.test(scan.category)) return null;
  const entries = Object.entries(scan.fields);
  const amountValue = entries.find(([key]) => /^(grand\s*)?total|amount\s*(paid|due)?$/i.test(key))?.[1] ?? "";
  const amount = Number(amountValue.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{2}$)/, ".").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const merchant =
    entries.find(([key]) => /merchant|vendor|store|business|seller/i.test(key))?.[1] ||
    scan.title.replace(/\b(receipt|invoice)\b/gi, "").trim() ||
    "Scanned receipt";
  const date = entries.find(([key]) => /date/i.test(key))?.[1];
  return {
    merchant,
    amount,
    category: inferExpenseCategory(`${merchant} ${scan.summary}`),
    note: `Auto-filed from ${scan.title}`,
    ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {})
  };
}

function stopLookCamera(): void {
  lookMediaStream?.getTracks().forEach((track) => track.stop());
  lookMediaStream = null;
}

type NativeVoiceWindow = Window & {
  SpeechRecognition?: new () => NonNullable<typeof voiceRecognition>;
  webkitSpeechRecognition?: new () => NonNullable<typeof voiceRecognition>;
  webkit?: {
    messageHandlers?: {
      slyosVoice?: { postMessage(payload: Record<string, unknown>): void };
      slyosDevice?: { postMessage(payload: Record<string, unknown>): void };
    };
  };
  slyosVoiceResult?: (text: string, isFinal: boolean, error?: string) => void;
  slyosNativeActionResult?: (id: string, result: NativeDeviceResult) => void;
};

type NativeDeviceResult = { ok?: boolean; message?: string; result?: Record<string, unknown> };

const nativeVoiceWindow = window as NativeVoiceWindow;
const nativeDeviceRequests = new Map<
  string,
  {
    resolve(result: NativeDeviceResult): void;
    reject(error: Error): void;
    timer: number;
  }
>();
nativeVoiceWindow.slyosVoiceResult = (text, isFinal, error) => {
  handleVoiceResult(text, isFinal, error);
};
nativeVoiceWindow.slyosNativeActionResult = (id, result) => {
  const pending = nativeDeviceRequests.get(id);
  if (!pending) return;
  window.clearTimeout(pending.timer);
  nativeDeviceRequests.delete(id);
  if (result?.ok === false) pending.reject(new Error(result.message || "The iPhone action failed."));
  else pending.resolve(result ?? { ok: true });
};

function runIosDevicePrimitive(primitive: DevicePrimitive): Promise<NativeDeviceResult> {
  const handler = nativeVoiceWindow.webkit?.messageHandlers?.slyosDevice;
  if (!handler) throw new Error("The native iPhone device bridge is unavailable in this build.");
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `ios-${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      nativeDeviceRequests.delete(id);
      reject(new Error(`iPhone action timed out: ${String(primitive.type)}`));
    }, 15_000);
    nativeDeviceRequests.set(id, { resolve, reject, timer });
    try {
      handler.postMessage({ id, ...primitive });
    } catch (error) {
      window.clearTimeout(timer);
      nativeDeviceRequests.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function startVoiceListening(): Promise<void> {
  stopVoiceListening(false);
  voiceTranscript = "";
  voiceStatus = "listening…";
  voiceListening = true;
  updateVoiceDom();

  const nativeHandler = nativeVoiceWindow.webkit?.messageHandlers?.slyosVoice;
  if (nativeHandler) {
    nativeHandler.postMessage({ action: "start" });
    return;
  }

  const Recognition = nativeVoiceWindow.SpeechRecognition ?? nativeVoiceWindow.webkitSpeechRecognition;
  if (!Recognition) {
    voiceListening = false;
    voiceStatus = "Voice recognition is unavailable here. Type on Home instead.";
    updateVoiceDom();
    return;
  }

  const recognition = new Recognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";
  recognition.onresult = (event: any) => {
    let transcript = "";
    let final = false;
    for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
      transcript += String(event.results[index]?.[0]?.transcript ?? "");
      final ||= Boolean(event.results[index]?.isFinal);
    }
    handleVoiceResult(transcript.trim(), final);
  };
  recognition.onerror = (event: any) => {
    handleVoiceResult("", true, voiceErrorMessage(String(event.error ?? "")));
  };
  recognition.onend = () => {
    voiceRecognition = null;
    if (voiceListening) {
      voiceListening = false;
      voiceStatus = voiceTranscript ? "processing…" : "Tap to listen";
      updateVoiceDom();
    }
  };
  voiceRecognition = recognition;
  try {
    recognition.start();
  } catch (error) {
    voiceRecognition = null;
    voiceListening = false;
    voiceStatus = error instanceof Error ? error.message : String(error);
    updateVoiceDom();
  }
}

function voiceErrorMessage(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "Microphone permission was not granted.";
  if (code === "no-speech") return "I did not hear anything. Tap to try again.";
  if (code === "audio-capture") return "No microphone is available.";
  if (code === "network") return "Speech recognition could not reach its service.";
  return code || "Voice recognition failed.";
}

function stopVoiceListening(notifyNative = true): void {
  voiceListening = false;
  if (voiceRecognition) {
    const recognition = voiceRecognition;
    voiceRecognition = null;
    try {
      recognition.stop();
    } catch {
      recognition.abort();
    }
  }
  if (notifyNative) {
    nativeVoiceWindow.webkit?.messageHandlers?.slyosVoice?.postMessage({ action: "stop" });
  }
}

function handleVoiceResult(text: string, isFinal: boolean, error?: string): void {
  if (error) {
    voiceListening = false;
    voiceStatus = error;
    updateVoiceDom();
    return;
  }
  if (text) voiceTranscript = text;
  voiceStatus = isFinal ? "processing…" : "listening…";
  updateVoiceDom();
  if (isFinal && voiceTranscript) {
    const request = voiceTranscript;
    stopVoiceListening(false);
    void runVoicePrompt(request);
  }
}

function updateVoiceDom(): void {
  const transcript = document.querySelector<HTMLElement>("#voice-transcript");
  const status = document.querySelector<HTMLElement>("#voice-status");
  const retry = document.querySelector<HTMLButtonElement>("#voice-retry");
  if (transcript) transcript.textContent = voiceTranscript;
  if (status) status.textContent = voiceStatus;
  if (retry) retry.hidden = voiceListening;
}

async function runVoicePrompt(request: string): Promise<void> {
  screen = "home";
  promptText = request;
  render();
  const input = document.querySelector<HTMLInputElement>("#prompt-input");
  if (input) input.value = request;
  await runPrompt();
  if (agentAnswer && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(agentAnswer.slice(0, 1800));
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }
}

async function captureLookFrame(): Promise<void> {
  const video = document.querySelector<HTMLVideoElement>("#look-video");
  if (!video || !video.videoWidth || !video.videoHeight) {
    lookStatus = "The camera is still starting. Try Capture again in a moment.";
    render();
    return;
  }
  lookImageDataUrl = imageElementToDataUrl(video, video.videoWidth, video.videoHeight);
  stopLookCamera();
  lookAnswer = "";
  lookStatus = "Captured. Ask what you want SlyOS to see.";
  render();
}

async function loadLookImage(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    lookStatus = "Choose an image file.";
    render();
    return;
  }
  stopLookCamera();
  try {
    const raw = await fileToDataUrl(file);
    const image = await loadImageElement(raw);
    lookImageDataUrl = imageElementToDataUrl(image, image.naturalWidth, image.naturalHeight);
    lookAnswer = "";
    lookStatus = `${file.name} ready for the brain.`;
  } catch (error) {
    lookStatus = error instanceof Error ? error.message : "The image could not be read.";
  }
  render();
}

async function analyzeLookImage(): Promise<void> {
  const prompt = document.querySelector<HTMLTextAreaElement>("#look-prompt")?.value.trim() ||
    "Identify what is visible. Extract important text or structured details, explain what matters, and suggest the safest useful next action.";
  if (!lookImageDataUrl) return;
  if (!providerApiKey.trim()) {
    lookStatus = "Add and test a vision-capable model key in Setup first.";
    render();
    return;
  }
  lookStatus = `Analyzing with ${providerLabel()}…`;
  lookAnswer = "";
  agentBusy = true;
  render();
  try {
    lookAnswer = await generateVisionWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      prompt,
      memoryContext: buildMemoryContext(),
      imageDataUrl: lookImageDataUrl
    });
    memoryStore.add({
      kind: "memory",
      title: `Look: ${prompt.slice(0, 58)}`,
      body: lookAnswer,
      tags: ["look", "vision", "brain"],
      source: `${providerLabel()} vision`
    });
    lookStatus = "Analysis saved to the brain.";
  } catch (error) {
    lookStatus = error instanceof Error ? error.message : String(error);
  } finally {
    agentBusy = false;
    render();
  }
}

function imageElementToDataUrl(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): string {
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image canvas is unavailable.");
  context.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image format is not supported."));
    image.src = src;
  });
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

  const sequence = primitiveSequenceForPrompt(operatePrompt);
  if (nativePlatform === "ios" && !isIosDeviceSequenceSupported(sequence)) {
    operateStatus = "This step needs whole-device screen control, which iOS does not expose. SlyOS can open supported apps and URLs, copy text, and hand work to Shortcuts.";
    memoryStore.add({
      kind: "screen",
      title: `iOS operate blocked: ${operatePrompt.slice(0, 50)}`,
      body: operateStatus,
      tags: ["operate", "ios", "platform-limit"],
      source: "iPhone"
    });
    render();
    return;
  }

  await deviceAction(async () => {
    await executeDeviceSequence(operatePrompt, sequence, "operate");
    operateStatus = `ran ${sequence.length} step${sequence.length === 1 ? "" : "s"}`;
  });
}

async function executeDevicePrimitive(prompt: string, primitive: DevicePrimitive, source: "home" | "operate"): Promise<string> {
  return executeDeviceSequence(prompt, [primitive], source);
}

async function executeDeviceSequence(prompt: string, sequence: DeviceSequence, source: "home" | "operate"): Promise<string> {
  if (nativePlatform === "ios") return executeIosDeviceSequence(prompt, sequence, source);
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

const iosDevicePrimitiveTypes = new Set([
  "open_url", "open_app", "set_clipboard", "wait", "calendar_events", "create_calendar_event",
  "search_contacts", "reminder_items", "create_reminder", "run_shortcut"
]);

function isIosDeviceSequenceSupported(sequence: DeviceSequence): boolean {
  return (
    sequence.some((primitive) => primitive.type !== "wait") &&
    sequence.every((primitive) => iosDevicePrimitiveTypes.has(primitive.type))
  );
}

function orderedIosDeviceSequence(sequence: DeviceSequence): DeviceSequence {
  const terminal = sequence.filter((primitive) => primitive.type === "open_url" || primitive.type === "open_app");
  const setup = sequence.filter((primitive) => primitive.type !== "open_url" && primitive.type !== "open_app");
  return [...setup, ...terminal.slice(0, 1)];
}

async function executeIosDeviceSequence(prompt: string, sequence: DeviceSequence, source: "home" | "operate"): Promise<string> {
  if (!isIosDeviceSequenceSupported(sequence)) {
    const unsupported = sequence.find((primitive) => !iosDevicePrimitiveTypes.has(primitive.type))?.type ?? "device-control";
    throw new Error(`iOS does not expose ${unsupported} outside SlyOS. Use an App Intent or Shortcuts handoff for that step.`);
  }
  const executable = orderedIosDeviceSequence(sequence);
  const trace: string[] = [];
  for (const [index, primitive] of executable.entries()) {
    const result = await runIosDevicePrimitive(primitive);
    trace.push(`${index + 1}/${executable.length} ${result.message || String(primitive.type)}`);
    recordDiagnostic("bridge", "ok", `iPhone · ${result.message || String(primitive.type)}`);
  }
  deviceBridgeObservation = trace.join(" -> ");
  deviceBridgeStatus = `ran ${executable.length} iPhone step${executable.length === 1 ? "" : "s"}`;
  const title = executable.length === 1 ? `Ran ${executable[0]?.type ?? "action"}` : `Ran ${executable.length}-step iPhone handoff`;
  memoryStore.add({
    kind: "screen",
    title: `${title}: ${prompt.slice(0, 54)}`,
    body: `${prompt}\n${deviceBridgeObservation}`,
    tags: [source, "operate", "ios", "brain"],
    source: "iPhone"
  });
  recordOutbox({
    title,
    target: "iPhone",
    channel: source === "home" ? "Home prompt" : "Operate",
    body: prompt,
    why: `executed through the native iPhone handoff: ${executable.map((item) => item.type).join(" -> ")}`,
    status: "done"
  });
  return deviceBridgeObservation;
}

async function runAgenticDeviceLoop(prompt: string): Promise<string> {
  if (nativePlatform !== "macos") throw new Error("The visual device loop is currently native to the Mac app.");
  if (!providerApiKey.trim()) throw new Error("Add and test a vision-capable model key before running a visual device task.");
  if (isSensitiveDeviceRequest(prompt)) {
    throw new Error("This task can spend money, change security or credentials, or destroy data. Confirm that protected step from Now before SlyOS continues.");
  }

  const trace: string[] = [];
  let previousPlan = "";
  let repeatedPlanCount = 0;
  for (let turn = 0; turn < 32; turn += 1) {
    const observed = await deviceFetch("/actions", {
      method: "POST",
      body: JSON.stringify({ type: "observe_screen", includeImage: true })
    });
    const accessibility = await deviceFetch("/actions", {
      method: "POST",
      body: JSON.stringify({ type: "inspect_ui", maxElements: 160 })
    }).catch((error) => ({
      result: { error: error instanceof Error ? error.message : String(error), elements: [] }
    }));
    const imageDataUrl = observed.result?.screenshot?.dataUrl;
    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      throw new Error(String(observed.result?.screenshot?.error || "Screen Recording permission is required before the brain can see this Mac."));
    }
    const frontmost = String(observed.result?.frontmostApp?.app || "unknown app");
    const accessibilityContext = compactAccessibilitySnapshot(accessibility.result);
    const raw = await generateVisionWithProvider({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      imageDataUrl,
      memoryContext: buildMemoryContext(prompt),
      maxOutputTokens: 1800,
      prompt: [
        `You are controlling a Mac to complete this request: ${prompt}`,
        `The screenshot is the current full display. Frontmost app: ${frontmost}.`,
        accessibilityContext ? `macOS accessibility snapshot (current visible controls, with absolute pixel positions):\n${accessibilityContext}` : "No accessibility tree was available; rely on the screenshot.",
        trace.length ? `Actions already completed: ${trace.join(" -> ")}` : "No actions have run yet.",
        "Return strict JSON only: {\"done\":boolean,\"reason\":\"\",\"requiresConfirmation\":boolean,\"steps\":[...] }.",
        "Use at most 5 steps. Allowed steps: open_url{url}, open_app{app}, set_clipboard{text}, type_text{text}, key_press{key,modifiers}, hotkey{keys}, click_element{index}, pointer_click{x,y,button,clicks}, pointer_click_ratio{x,y,button,clicks}, scroll{deltaX,deltaY}, list_dir{path}, read_file{path}, write_file{path,content,overwrite}, append_file{path,content}, make_dir{path}, move_file{from,to,overwrite}, wait{ms}.",
        "File actions are limited by the bridge to the user's Desktop, Documents, and Downloads folders. Read/list before revising existing work.",
        "Prefer click_element with the exact #index from the accessibility snapshot. Use pointer_click_ratio only for a visible control absent from the tree.",
        "pointer_click_ratio x and y are decimals from 0 to 1 across the screenshot.",
        "Set done true only when the requested outcome is visibly complete.",
        "The user's explicit request authorizes ordinary navigation, typing, form filling, messages, posts, bookings, downloads, uploads, and local file work.",
        "Set requiresConfirmation true and return no steps only before a payment/purchase, credential or security change, destructive deletion, or an action with an ambiguous recipient/target.",
        "Never choose a control you cannot see or infer reliably."
      ].filter(Boolean).join("\n")
    });
    const parsed = parseJsonObject(raw);
    if (!parsed) throw new Error("The visual planner did not return a valid action plan.");
    if (parsed.requiresConfirmation === true) {
      throw new Error(typeof parsed.reason === "string" && parsed.reason ? `Confirmation required: ${parsed.reason}` : "Confirmation required before the next device action.");
    }
    if (parsed.done === true) {
      const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "Task completed.";
      const verification = await verifyVisualDeviceOutcome(prompt, trace);
      if (!verification.complete) {
        trace.push(`Verification: ${verification.reason || "requested result is not visible yet"}`);
        continue;
      }
      deviceBridgeObservation = [...trace, reason].filter(Boolean).join(" -> ");
      deviceBridgeStatus = `completed in ${turn + 1} observation${turn ? "s" : ""}`;
      memoryStore.add({ kind: "screen", title: `Completed: ${prompt.slice(0, 56)}`, body: deviceBridgeObservation, tags: ["home", "operate", "visual-loop", "brain"], source: "Mac" });
      recordOutbox({
        title: `Completed device task`,
        target: "Mac",
        channel: "Home prompt",
        body: prompt,
        why: `visually verified after ${turn + 1} observation${turn ? "s" : ""}: ${verification.reason || reason}`,
        status: "done"
      });
      return deviceBridgeObservation;
    }
    const steps = normalizeVisualDeviceSteps(parsed.steps, accessibility.result);
    if (!steps.length) throw new Error(typeof parsed.reason === "string" && parsed.reason ? parsed.reason : "The visual planner could not find a safe next action.");
    const signature = JSON.stringify(steps);
    repeatedPlanCount = signature === previousPlan ? repeatedPlanCount + 1 : 0;
    if (repeatedPlanCount >= 3) throw new Error("The visual loop repeated the same action plan three times and stopped before causing a loop.");
    previousPlan = signature;
    for (const step of steps) {
      const result = await deviceFetch("/actions", { method: "POST", body: JSON.stringify(step) });
      trace.push(describeDevicePayload(result));
      if (step.type !== "wait") {
        await deviceFetch("/actions", { method: "POST", body: JSON.stringify({ type: "wait", ms: step.type === "open_url" || step.type === "open_app" ? 1100 : 450 }) });
      }
    }
  }
  throw new Error("The visual loop reached its 32-observation limit before the result was visibly complete.");
}

async function verifyVisualDeviceOutcome(prompt: string, trace: string[]): Promise<{ complete: boolean; reason: string }> {
  const observed = await deviceFetch("/actions", {
    method: "POST",
    body: JSON.stringify({ type: "observe_screen", includeImage: true })
  });
  const imageDataUrl = observed.result?.screenshot?.dataUrl;
  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return { complete: false, reason: "SlyOS could not capture a verification screenshot." };
  }
  const raw = await generateVisionWithProvider({
    provider: selectedProvider,
    apiKey: providerApiKey,
    model: modelName,
    imageDataUrl,
    memoryContext: buildMemoryContext(prompt),
    maxOutputTokens: 500,
    prompt: [
      `Independently verify whether this requested Mac outcome is visibly complete: ${prompt}`,
      trace.length ? `Actions taken: ${trace.slice(-12).join(" -> ")}` : "No action trace is available.",
      "Return strict JSON only: {\"complete\":boolean,\"reason\":\"brief visible evidence\"}.",
      "Do not infer success from the action trace. Judge the current screenshot."
    ].join("\n")
  });
  const parsed = parseJsonObject(raw);
  return {
    complete: parsed?.complete === true,
    reason: typeof parsed?.reason === "string" ? parsed.reason.trim() : "No visible completion evidence."
  };
}

function compactAccessibilitySnapshot(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const payload = value as Record<string, unknown>;
  const elements = Array.isArray(payload.elements) ? payload.elements : [];
  const rows = elements.slice(0, 160).map((candidate) => {
    if (!candidate || typeof candidate !== "object") return "";
    const element = candidate as Record<string, unknown>;
    const position = Array.isArray(element.position) ? element.position.map(Number) : [];
    const size = Array.isArray(element.size) ? element.size.map(Number) : [];
    const center = position.length >= 2 && size.length >= 2
      ? ` center=${Math.round(position[0]! + size[0]! / 2)},${Math.round(position[1]! + size[1]! / 2)}`
      : "";
    const fields = [
      `#${String(element.index ?? "?")}`,
      String(element.role ?? ""),
      element.name ? `name=${JSON.stringify(String(element.name).slice(0, 100))}` : "",
      element.description ? `desc=${JSON.stringify(String(element.description).slice(0, 100))}` : "",
      element.value ? `value=${JSON.stringify(String(element.value).slice(0, 100))}` : "",
      center,
      element.enabled === false ? "disabled" : "",
      element.focused === true ? "focused" : ""
    ].filter(Boolean);
    return fields.join(" ");
  }).filter(Boolean);
  const header = [payload.app ? `app=${String(payload.app)}` : "", payload.window ? `window=${String(payload.window)}` : ""].filter(Boolean).join(" · ");
  return [header, ...rows].filter(Boolean).join("\n").slice(0, 18_000);
}

function normalizeVisualDeviceSteps(value: unknown, accessibility: unknown): DeviceSequence {
  if (!Array.isArray(value)) return [];
  const steps: DeviceSequence = [];
  for (const item of value.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const step = item as Record<string, unknown>;
    const type = typeof step.type === "string" ? step.type : "";
    if (type === "open_url" && typeof step.url === "string" && /^https?:\/\//i.test(step.url)) steps.push({ type, url: step.url });
    else if (type === "open_app" && typeof step.app === "string") steps.push({ type, app: step.app.slice(0, 80) });
    else if ((type === "set_clipboard" || type === "type_text") && typeof step.text === "string") steps.push({ type, text: step.text.slice(0, 5000) });
    else if (type === "key_press" && typeof step.key === "string") steps.push({ type, key: step.key.slice(0, 24), modifiers: Array.isArray(step.modifiers) ? step.modifiers.map(String).slice(0, 4) : [] });
    else if (type === "hotkey" && Array.isArray(step.keys) && step.keys.length >= 2) steps.push({ type, keys: step.keys.map(String).slice(0, 5) });
    else if (type === "click_element" && Number.isInteger(Number(step.index))) {
      const click = clickForAccessibilityElement(accessibility, Number(step.index));
      if (click) steps.push(click);
    }
    else if (type === "pointer_click" && typeof step.x === "number" && typeof step.y === "number") steps.push({ type, x: clampNumber(step.x, 0, 16000), y: clampNumber(step.y, 0, 16000), button: ["left", "right"].includes(String(step.button)) ? String(step.button) : "left", clicks: clampNumber(Number(step.clicks || 1), 1, 2) });
    else if (type === "pointer_click_ratio" && typeof step.x === "number" && typeof step.y === "number") steps.push({ type, x: clampNumber(step.x, 0, 1), y: clampNumber(step.y, 0, 1), button: ["left", "right"].includes(String(step.button)) ? String(step.button) : "left", clicks: clampNumber(Number(step.clicks || 1), 1, 2) });
    else if (type === "scroll") steps.push({ type, deltaX: clampNumber(Number(step.deltaX || 0), -1200, 1200), deltaY: clampNumber(Number(step.deltaY || 0), -1200, 1200) });
    else if ((type === "list_dir" || type === "read_file" || type === "make_dir") && typeof step.path === "string") steps.push({ type, path: step.path.slice(0, 1000) });
    else if ((type === "write_file" || type === "append_file") && typeof step.path === "string" && typeof step.content === "string") steps.push({ type, path: step.path.slice(0, 1000), content: step.content.slice(0, 100_000), ...(type === "write_file" ? { overwrite: step.overwrite === true } : {}) });
    else if (type === "move_file" && typeof step.from === "string" && typeof step.to === "string") steps.push({ type, from: step.from.slice(0, 1000), to: step.to.slice(0, 1000), overwrite: step.overwrite === true });
    else if (type === "wait") steps.push({ type, ms: clampNumber(Number(step.ms || 500), 100, 3000) });
  }
  return steps;
}

function clickForAccessibilityElement(accessibility: unknown, index: number): DevicePrimitive | null {
  if (!accessibility || typeof accessibility !== "object") return null;
  const elements = Array.isArray((accessibility as Record<string, unknown>).elements)
    ? (accessibility as Record<string, unknown>).elements as unknown[]
    : [];
  const candidate = elements.find((item) => {
    return Boolean(item && typeof item === "object" && Number((item as Record<string, unknown>).index) === index);
  });
  if (!candidate || typeof candidate !== "object") return null;
  const element = candidate as Record<string, unknown>;
  const position = Array.isArray(element.position) ? element.position.map(Number) : [];
  const size = Array.isArray(element.size) ? element.size.map(Number) : [];
  if (position.length < 2 || size.length < 2 || !position.concat(size).every(Number.isFinite)) return null;
  return {
    type: "pointer_click",
    x: Math.round(position[0]! + size[0]! / 2),
    y: Math.round(position[1]! + size[1]! / 2),
    button: "left",
    clicks: 1
  };
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function isSensitiveDeviceRequest(prompt: string): boolean {
  return /\b(purchase|buy|checkout|pay|transfer|delete|erase|uninstall|password|passcode|otp|2fa|verification code|change (?:my )?(?:account|security|password)|bank|wallet)\b/i.test(prompt);
}

function shouldRunAgenticDeviceLoop(prompt: string, sequence: DeviceSequence): boolean {
  if (nativePlatform !== "macos" || !providerApiKey.trim()) return false;
  const actionable = /\b(open|launch|go to|search|find|click|choose|select|type|fill|scroll|download|upload|create|make|move|rename|organize|turn on|turn off|change|set)\b/i.test(prompt);
  const multiStep = /\b(and|then|after that|once|find|choose|select|fill|download|upload|create|move|rename|organize|turn on|turn off|change|set)\b/i.test(prompt);
  const deterministic = sequence.some((step) => step.type !== "observe_screen" && step.type !== "wait");
  return actionable && (!deterministic || multiStep);
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

  const quotedShortcut = prompt.match(/\b(?:run|launch|start)\s+(?:the\s+)?shortcut\s+["“](.+?)["”](?:\s+with\s+["“](.+?)["”])?/i);
  const namedShortcut = prompt.match(/\b(?:run|launch|start)\s+(?:the\s+)?(.+?)\s+shortcut(?:\s+with\s+["“](.+?)["”])?(?:$|[.!?])/i);
  const shortcutName = cleanCommandSubject(quotedShortcut?.[1] ?? namedShortcut?.[1] ?? "");
  if (shortcutName) {
    return [{ type: "run_shortcut", name: shortcutName, input: quotedShortcut?.[2] ?? namedShortcut?.[2] ?? "" }];
  }

  const webUrl = urlForPrompt(prompt);
  if (webUrl) return [{ type: "open_url", url: webUrl }];

  const sequence: DeviceSequence = [];
  const app = prompt.match(/\bopen\s+([a-z][a-z ]{1,32}?)(?:$|\.|,| and |\s+then|\s+instead\b)/i)?.[1]?.trim();
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
  if (nativePlatform === "ios") return isIosDeviceSequenceSupported(sequence);
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
  if (typeof result.content === "string") return `read ${String(result.path || "file")}: ${result.content.slice(0, 4000)}`;
  if (Array.isArray(result.entries)) return `listed ${String(result.path || "folder")}: ${JSON.stringify(result.entries).slice(0, 4000)}`;
  if (result.moved) return `moved ${String(result.from)} to ${String(result.path)}`;
  if (result.bytesAppended) return `appended ${String(result.bytesAppended)} bytes to ${String(result.path)}`;
  if (result.bytes) return `wrote ${String(result.bytes)} bytes to ${String(result.path)}`;
  const app = result.frontmostApp?.app ? `front ${result.frontmostApp.app}` : "";
  const shot = result.screenshot?.path ? `shot ${result.screenshot.path}` : "";
  return [app, shot].filter(Boolean).join(" · ") || JSON.stringify(result).slice(0, 180);
}

function saveSkill(): void {
  const name = document.querySelector<HTMLInputElement>("#skill-name")?.value.trim() ?? "";
  const instruction = document.querySelector<HTMLTextAreaElement>("#skill-steps")?.value.trim() ?? "";
  if (!name || !instruction) return;
  const lines = instruction.split(/\n|;/).map((line) => line.trim()).filter(Boolean);
  const steps = lines.flatMap((line) => primitiveSequenceForPrompt(line)).filter((step) => step.type !== "observe_screen");
  if (!steps.length) {
    skillStatus = "No runnable action was found. Use actions such as open, copy, type, press, click coordinates, or scroll.";
    render();
    return;
  }
  if (nativePlatform === "ios" && !isIosDeviceSequenceSupported(steps)) {
    const unsupported = steps.find((step) => !iosDevicePrimitiveTypes.has(step.type))?.type ?? "screen action";
    skillStatus = `That skill includes ${unsupported}, which iOS does not expose outside the active app.`;
    render();
    return;
  }
  const existing = reflexSkills().find((skill) => skill.name.toLowerCase() === name.toLowerCase());
  const now = new Date().toISOString();
  const skill: ReflexSkill = {
    id: existing?.id ?? localId("skill"),
    name: name.slice(0, 80),
    instruction,
    steps,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(existing?.lastRunAt ? { lastRunAt: existing.lastRunAt } : {})
  };
  saveReflexSkills([skill, ...reflexSkills().filter((candidate) => candidate.id !== skill.id)]);
  memoryStore.add({
    kind: "memory",
    title: `Skill: ${name}`,
    body: `${instruction}\n\n${steps.map((step) => JSON.stringify(step)).join("\n")}`,
    tags: ["skill", "operate", "brain"],
    source: platformLabel()
  });
  skillStatus = `Saved ${skill.name} with ${steps.length} runnable step${steps.length === 1 ? "" : "s"}.`;
  render();
}

function matchingReflexSkill(prompt: string): ReflexSkill | null {
  const normalized = prompt.toLowerCase();
  return reflexSkills().find((skill) => {
    const words = skill.name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    return words.length > 0 && words.filter((word) => normalized.includes(word)).length >= Math.ceil(words.length / 2);
  }) ?? null;
}

async function runReflexSkill(id: string, source: "home" | "operate" = "operate"): Promise<string> {
  const skill = reflexSkills().find((candidate) => candidate.id === id);
  if (!skill) throw new Error("That skill is no longer saved.");
  if (nativePlatform === "ios" && !isIosDeviceSequenceSupported(skill.steps)) {
    throw new Error("This learned skill contains whole-screen actions that iOS does not expose.");
  }
  skillStatus = `Running ${skill.name}…`;
  render();
  try {
    const result = await executeDeviceSequence(`Skill: ${skill.name}`, skill.steps, source);
    const now = new Date().toISOString();
    saveReflexSkills(reflexSkills().map((candidate) => candidate.id === id ? { ...candidate, lastRunAt: now, updatedAt: now } : candidate));
    skillStatus = `Ran ${skill.name}: ${result}`;
    return result;
  } catch (error) {
    skillStatus = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    render();
  }
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
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .filter(Boolean)
            .join(" ")
        );
      }
    } finally {
      await document.destroy();
    }
    return pages.join("\n\n").slice(0, 80000);
  }
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
    const records = [record, ...vaultRecords()];
    saveVaultRecords(records);
    const envelope = await createSyncedVaultEnvelope(records, passphrase);
    window.localStorage.setItem(syncedVaultKey, JSON.stringify(envelope));
    if (syncClient && syncUserId) await syncClient.pushVault(envelope);
    memoryStore.add({
      kind: "vault",
      title: `Vault: ${label}`,
      body: "Vault item saved - locked.",
      tags: ["vault", "brain"],
      source: "vault"
    });
    revealedVault = null;
    vaultStatus = syncClient && syncUserId ? "encrypted and synced as ciphertext" : "encrypted and saved locally";
  } catch (error) {
    vaultStatus = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function createSyncedVaultEnvelope(records: VaultRecord[], passphrase: string): Promise<SyncedVaultEnvelope> {
  const items: Array<{ label: string; value: string }> = [];
  for (const record of records) {
    items.push({ label: record.label, value: await decryptText(record, passphrase) });
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(items));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext)));
  const blob = new Uint8Array(iv.length + ciphertext.length);
  blob.set(iv, 0);
  blob.set(ciphertext, iv.length);
  return { cipherBlob: bytesToBase64(blob), salt: bytesToBase64(salt), updatedAt: Date.now() };
}

async function unlockSyncedVault(): Promise<void> {
  const passphrase = document.querySelector<HTMLInputElement>("#vault-passphrase")?.value ?? "";
  const envelope = syncedVaultEnvelope();
  if (!passphrase || !envelope) {
    vaultStatus = "enter the Android vault PIN first";
    render();
    return;
  }
  try {
    const blob = base64ToBytes(envelope.cipherBlob);
    if (blob.length < 29) throw new Error("Synced vault ciphertext is invalid.");
    const iv = blob.slice(0, 12);
    const ciphertext = blob.slice(12);
    const key = await deriveVaultKey(passphrase, base64ToBytes(envelope.salt));
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext));
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Synced vault payload is invalid.");
    revealedSyncedVault = parsed.filter((item): item is { label: string; value: string } =>
      Boolean(item && typeof item === "object" && typeof item.label === "string" && typeof item.value === "string")
    );
    vaultStatus = `unlocked ${revealedSyncedVault.length} synced item${revealedSyncedVault.length === 1 ? "" : "s"}`;
  } catch {
    revealedSyncedVault = null;
    vaultStatus = "wrong vault PIN or unreadable synced vault";
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
    memoryPathKeys = [];
    render();
    return;
  }

  const hits = memoryStore.search(memoryQuery).slice(0, 8);
  memoryPathKeys = hits.map((item) => item.id);
  rememberMemorySearch(memoryQuery);
  const localAnswer = hits.length
    ? hits
        .slice(0, 3)
        .map((item) => `${item.title}: ${item.body}`)
        .join(" ")
    : "I don't have anything on that yet.";

  if (!hasTextModel()) {
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
    recordDiagnostic("sync", "error", syncStatus);
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
    recordDiagnostic("bridge", "error", deviceBridgeStatus);
  }
  render();
}

async function deviceFetch(path: string, init: RequestInit = {}): Promise<Record<string, any>> {
  if (!deviceBridgeUrl || !deviceBridgeToken) throw new Error("device bridge URL or token missing");
  const actionType = typeof init.body === "string" ? safeActionType(init.body) : init.method || "GET";
  recordDiagnostic("bridge", "info", `${actionType} → ${path}`);
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
  recordDiagnostic("bridge", "ok", `${actionType} completed.`);
  return payload;
}

function safeActionType(body: string): string {
  try {
    const parsed = JSON.parse(body) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type.slice(0, 80) : "POST";
  } catch {
    return "POST";
  }
}

function saveDeviceBridgeSettings(): void {
  deviceBridgeUrl =
    document.querySelector<HTMLInputElement>("#device-bridge-url")?.value.trim() || deviceBridgeUrl;
  deviceBridgeToken =
    document.querySelector<HTMLInputElement>("#device-bridge-token")?.value.trim() || deviceBridgeToken;
  window.localStorage.setItem("slyos:deviceBridgeUrl", deviceBridgeUrl);
  window.localStorage.setItem("slyos:deviceBridgeToken", deviceBridgeToken);
}

const homeRoutes = new Set<HomeRoute>([
  "answer", "device", "calendar", "native_read", "outbound", "checklist", "research", "cowork",
  "mission", "network", "job", "architect", "documents", "faces", "shop", "investing", "compose",
  "email", "spicy", "expenses", "apps"
]);

async function planHomeRequest(request: string): Promise<HomeDecision | null> {
  if (!hasTextModel()) return null;
  try {
    const decision = await generateJsonWithProvider<Partial<HomeDecision>>({
      provider: selectedProvider,
      apiKey: providerApiKey,
      model: modelName,
      memoryContext: buildMemoryContext(request),
      maxOutputTokens: 500,
      prompt: [
        "Route the user's request to exactly one SlyOS capability.",
        "Return strict JSON only with keys route, confidence, subject, target, requiresDevice, reason.",
        `Allowed routes: ${[...homeRoutes].join(", ")}.`,
        "Use device when completing the request requires operating another Mac app or website.",
        "Use native_read only for reading native calendar, reminders, contacts, or files. Use calendar only for creating/changing an event.",
        "Use outbound for a message or communication that should be drafted/reviewed in Now instead of visually operating its app.",
        "Use a named workflow route when its dedicated SlyOS screen is the natural destination. Use answer only for a conversational answer.",
        "subject is the cleaned topic/task; target is an app, person, site, file, or destination when present.",
        `User request: ${request}`
      ].join("\n")
    });
    const route = typeof decision.route === "string" && homeRoutes.has(decision.route as HomeRoute)
      ? decision.route as HomeRoute
      : "answer";
    return {
      route,
      confidence: clampNumber(Number(decision.confidence ?? 0.5), 0, 1),
      subject: typeof decision.subject === "string" ? decision.subject.trim().slice(0, 1000) : "",
      target: typeof decision.target === "string" ? decision.target.trim().slice(0, 500) : "",
      requiresDevice: decision.requiresDevice === true,
      reason: typeof decision.reason === "string" ? decision.reason.trim().slice(0, 500) : ""
    };
  } catch (error) {
    recordDiagnostic("provider", "error", `Home router fell back to local intent matching: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function runHomeDecisionWorkflow(decision: HomeDecision | null, request: string): Promise<boolean> {
  if (!decision || decision.confidence < 0.55) return false;
  const subject = cleanCommandSubject(decision.subject || request);
  if (decision.route === "checklist") {
    if (subject) addChecklistItem(subject);
    homeChecklistVisible = true;
    screen = "checklist";
    agentAnswer = subject ? `Added to checklist: ${subject}` : "Checklist opened.";
    return true;
  }
  if (decision.route === "mission") {
    if (subject) startMission(subject);
    screen = "mission";
    agentAnswer = subject ? `Mission set: ${subject}` : "Mission opened.";
    return true;
  }
  if (decision.route === "research") {
    screen = "research";
    if (subject) {
      agentBusy = true;
      render();
      try {
        const paper = await createResearchPaper(subject);
        agentAnswer = `Research paper drafted: ${paper.title}`;
      } finally {
        agentBusy = false;
      }
    } else {
      agentAnswer = "Research opened.";
    }
    return true;
  }
  if (decision.route === "network") {
    networkQuery = subject;
    networkStatus = subject ? "Ready to search the brain and synced network." : "";
    screen = "network";
    agentAnswer = "My network opened.";
    return true;
  }
  if (decision.route === "job") {
    jobTargetPrompt = subject;
    jobStatus = "Add the posting and resume, then generate through the brain.";
    screen = "job";
    agentAnswer = "Job workspace opened.";
    return true;
  }
  if (decision.route === "architect") {
    architectPrompt = subject;
    architectStatus = "Review the requirements, then build through the brain.";
    screen = "architect";
    agentAnswer = "Architect opened.";
    return true;
  }
  if (decision.route === "shop") {
    shopQuery = subject;
    shopStatus = "Ready for a live comparison.";
    screen = "shop";
    agentAnswer = "Shopping search opened.";
    return true;
  }
  if (decision.route === "compose") {
    composeTopic = subject;
    composeStatus = "Review the topic, then generate through the brain.";
    screen = "compose";
    agentAnswer = "Post composer opened.";
    return true;
  }
  if (decision.route === "email") {
    emailTopic = subject;
    emailTo = decision.target;
    emailStatus = "Review the recipient and purpose, then generate through the brain.";
    screen = "email-compose";
    agentAnswer = "Email composer opened.";
    return true;
  }
  if (decision.route === "spicy") {
    spicyTopic = subject;
    spicyStatus = "Review the topic, then generate through the brain.";
    screen = "spicy";
    agentAnswer = "Spicy post opened.";
    return true;
  }
  const directScreens: Partial<Record<HomeRoute, ShellScreen>> = {
    cowork: "cowork",
    documents: "documents",
    faces: "faces",
    investing: "investing",
    expenses: "expenses",
    apps: "apps"
  };
  const directScreen = directScreens[decision.route];
  if (directScreen) {
    screen = directScreen;
    agentAnswer = `${directScreen === "cowork" ? "Cowork" : directScreen[0]!.toUpperCase() + directScreen.slice(1)} opened.`;
    return true;
  }
  return false;
}

async function runPrompt(): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("#prompt-input");
  promptText = input?.value ?? "";
  const request = promptText.trim();
  if (!request || agentBusy) return;

  const priorTurns = homeConversation();
  const executionRequest = contextualizeHomeRequest(request, priorTurns);
  const plan = planPrompt(executionRequest);
  const sequence = primitiveSequenceForPrompt(request);
  lastPlan = null;
  agentAnswer = "";
  rememberHomeTurn("user", request, ["prompt"]);
  recordDiagnostic("brain", "info", `Prompt accepted · ${plan.actions.length} planned action(s) · ${sequence.length} native primitive(s).`);
  promptText = "";

  agentBusy = hasTextModel();
  if (agentBusy) render();
  const homeDecision = await planHomeRequest(executionRequest);
  agentBusy = false;
  if (homeDecision) {
    recordDiagnostic("brain", "info", `Home route · ${homeDecision.route} · ${Math.round(homeDecision.confidence * 100)}% · ${homeDecision.reason || "no reason supplied"}`);
  }

  if (isReminderWriteRequest(request)) {
    agentBusy = true;
    render();
    try {
      agentAnswer = await createNativeReminder(executionRequest);
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "reminder", "native-write"]);
      recordDiagnostic("bridge", "ok", "Native reminder created and written to Brain.");
    } catch (error) {
      agentAnswer = error instanceof Error ? error.message : String(error);
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "reminder", "error"]);
      recordDiagnostic("bridge", "error", agentAnswer);
    } finally {
      agentBusy = false;
      scheduleBrainSync("reminder-write");
      render();
    }
    return;
  }

  if (isCalendarWriteRequest(request) || (homeDecision?.route === "calendar" && homeDecision.confidence >= 0.55)) {
    agentBusy = true;
    render();
    try {
      const staged = await stageCalendarRequest(executionRequest);
      agentAnswer = `Calendar draft staged for ${staged.calendarEvent?.title ?? "your event"}. Open Now to confirm it.`;
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "calendar", "confirmation-gated"]);
      recordDiagnostic("brain", "ok", "Calendar event resolved and held in Now for confirmation.");
    } catch (error) {
      agentAnswer = error instanceof Error ? error.message : String(error);
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "calendar", "error"]);
      recordDiagnostic("brain", "error", agentAnswer);
    } finally {
      agentBusy = false;
      scheduleBrainSync("calendar-draft");
      render();
    }
    return;
  }

  const learnedSkill = matchingReflexSkill(request);
  if (learnedSkill && /\b(operate|run|repeat|do|execute|start)\b/i.test(request)) {
    agentBusy = true;
    render();
    try {
      const result = await runReflexSkill(learnedSkill.id, "home");
      agentAnswer = `Ran ${learnedSkill.name}. ${result}`;
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "skill", "operate"]);
      recordDiagnostic("bridge", "ok", `Replayed learned skill: ${learnedSkill.name}.`);
    } catch (error) {
      agentAnswer = error instanceof Error ? error.message : String(error);
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "skill", "error"]);
      recordDiagnostic("bridge", "error", agentAnswer);
    } finally {
      agentBusy = false;
      scheduleBrainSync("skill-replay");
      render();
    }
    return;
  }

  const modelRequestsDevice = Boolean(homeDecision && homeDecision.confidence >= 0.55 && (homeDecision.route === "device" || homeDecision.requiresDevice));
  const deterministicDeviceSequence = sequence.some((step) => step.type !== "observe_screen" && step.type !== "wait");
  if ((shouldAutoRunDeviceAction(request, sequence) || (modelRequestsDevice && deterministicDeviceSequence)) && !shouldRunAgenticDeviceLoop(request, sequence)) {
    agentBusy = true;
    render();
    try {
      const result = await executeDeviceSequence(request, sequence, "home");
      agentAnswer = `Done. ${result}`;
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "operate"]);
      recordDiagnostic("bridge", "ok", `Deterministic device sequence completed · ${sequence.length} primitive(s).`);
    } catch (error) {
      agentAnswer = error instanceof Error ? error.message : String(error);
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "error"]);
      recordDiagnostic("bridge", "error", agentAnswer);
    } finally {
      agentBusy = false;
      scheduleBrainSync("device-action");
      render();
    }
    return;
  }

  if (isNativeReadRequest(request) || (homeDecision?.route === "native_read" && homeDecision.confidence >= 0.55)) {
    agentBusy = true;
    render();
    try {
      if (await runNativeReadWorkflow(request)) {
        rememberHomeTurn("assistant", agentAnswer, ["agent-response", "native-read"]);
        recordDiagnostic("bridge", "ok", "Native device data was read and written to Brain.");
        scheduleBrainSync("native-read");
        return;
      }
    } catch (error) {
      agentAnswer = error instanceof Error ? error.message : String(error);
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "native-read", "error"]);
      recordDiagnostic("bridge", "error", agentAnswer);
      return;
    } finally {
      agentBusy = false;
      render();
    }
  }

  if (await runLocalWorkflow(request)) {
    rememberHomeTurn("assistant", agentAnswer || "The local workflow completed.", ["agent-response", "local-workflow"]);
    recordDiagnostic("brain", "ok", "Local workflow completed and wrote to the brain.");
    scheduleBrainSync("local-workflow");
    render();
    return;
  }

  if (await runHomeDecisionWorkflow(homeDecision, executionRequest)) {
    rememberHomeTurn("assistant", agentAnswer || "The selected SlyOS workflow opened.", ["agent-response", "model-routed-workflow"]);
    recordDiagnostic("brain", "ok", `Model-routed workflow completed · ${homeDecision?.route ?? "unknown"}.`);
    scheduleBrainSync("model-routed-workflow");
    render();
    return;
  }

  if (isOutboundRequest(request) || (homeDecision?.route === "outbound" && homeDecision.confidence >= 0.55)) {
    agentBusy = true;
    render();
    try {
      const staged = await stageOutboundRequest(request);
      agentAnswer = `Draft staged for ${staged.contact}. Open Now to review, send, or close it.`;
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "outbound-draft"]);
      recordDiagnostic("brain", "ok", "Outbound action held in Now for confirmation.");
    } catch (error) {
      agentAnswer = error instanceof Error ? error.message : String(error);
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "error"]);
      recordDiagnostic("brain", "error", agentAnswer);
    } finally {
      agentBusy = false;
      scheduleBrainSync("outbound-staged");
      render();
    }
    return;
  }

  if (shouldRunAgenticDeviceLoop(request, sequence) || (modelRequestsDevice && nativePlatform === "macos")) {
    agentBusy = true;
    agentAnswer = "SlyOS is observing and operating this Mac…";
    render();
    try {
      const result = await runAgenticDeviceLoop(executionRequest);
      agentAnswer = `Done. ${result}`;
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "operate", "visual-loop"]);
      recordDiagnostic("bridge", "ok", "Agentic observe-and-operate loop completed.");
    } catch (error) {
      agentAnswer = error instanceof Error ? error.message : String(error);
      rememberHomeTurn("assistant", agentAnswer, ["agent-response", "error"]);
      recordDiagnostic("bridge", "error", agentAnswer);
    } finally {
      agentBusy = false;
      scheduleBrainSync("device-loop");
      render();
    }
    return;
  }

  agentAnswer = hasTextModel() ? "" : "Setup needs a cloud key or an enabled on-device text model before SlyOS can answer.";
  if (!hasTextModel()) {
    rememberHomeTurn("assistant", agentAnswer, ["agent-response", "setup-blocker"]);
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
      prompt: executionRequest,
      memoryContext: buildMemoryContext(executionRequest),
      useWebSearch: hasCloudModel()
    });
    agentAnswer = answer;
    rememberHomeTurn("assistant", answer, ["agent-response"]);
    recordDiagnostic("provider", "ok", `${textModelLabel()} returned a response and it was saved to Brain.`);
  } catch (error) {
    agentAnswer = error instanceof Error ? error.message : String(error);
    rememberHomeTurn("assistant", agentAnswer, ["agent-response", "error"]);
    recordDiagnostic("provider", "error", agentAnswer);
  } finally {
    agentBusy = false;
    scheduleBrainSync("provider-response");
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
  memoryStore.setSetting("profileName", profileName);
  memoryStore.setSetting("profileVoice", profileVoice);
  scheduleBrainSync("profile-settings");
}

function saveProfileDetails(): void {
  profileName = document.querySelector<HTMLInputElement>("#profile-full-name")?.value.trim() ?? profileName;
  profileVoice = document.querySelector<HTMLTextAreaElement>("#profile-voice")?.value.trim() ?? profileVoice;
  aboutYou = document.querySelector<HTMLTextAreaElement>("#profile-about")?.value.trim() ?? aboutYou;
  profileEmail = document.querySelector<HTMLInputElement>("#profile-email")?.value.trim() ?? profileEmail;
  profilePhone = document.querySelector<HTMLInputElement>("#profile-phone")?.value.trim() ?? profilePhone;
  profileAddress = document.querySelector<HTMLTextAreaElement>("#profile-address")?.value.trim() ?? profileAddress;
  bookingLink = document.querySelector<HTMLInputElement>("#profile-booking")?.value.trim() ?? bookingLink;
  const values: Record<string, string> = { profileName, profileVoice, aboutYou, profileEmail, profilePhone, profileAddress, bookingLink };
  for (const [key, value] of Object.entries(values)) {
    window.localStorage.setItem(`slyos:${key}`, value);
    memoryStore.setSetting(key, value);
  }
  const now = new Date().toISOString();
  memoryStore.upsert({
    id: "about",
    kind: "profile",
    title: profileName || "Profile",
    body: aboutYou,
    tags: ["profile", "about", "brain"],
    source: platformLabel(),
    createdAt: localMemories().find((item) => item.id === "about")?.createdAt ?? now,
    updatedAt: now
  });
  scheduleBrainSync("profile-details");
  agentAnswer = "Profile saved to Brain.";
  render();
}

function persistSetupStep(next: number): void {
  setupStep = Math.min(4, Math.max(0, next));
  window.localStorage.setItem("slyos:setupStep", String(setupStep));
  render();
}

function completeSetup(): void {
  setupComplete = true;
  window.localStorage.setItem("slyos:setupComplete", "true");
  window.localStorage.removeItem("slyos:setupStep");
  setupStep = 0;
  memoryStore.setSetting("profileName", profileName);
  memoryStore.setSetting("profileVoice", profileVoice);
  memoryStore.setSetting("modelProvider", selectedProvider);
  memoryStore.setSetting("modelName", modelName);
  navigate("home");
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

async function decryptText(record: Pick<VaultRecord, "ciphertext" | "iv" | "salt">, passphrase: string): Promise<string> {
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
