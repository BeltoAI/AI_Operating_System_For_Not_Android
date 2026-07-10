export type SlyScreen =
  | "boot"
  | "lock"
  | "home"
  | "now"
  | "people"
  | "memory"
  | "research"
  | "apps"
  | "manual"
  | "outbox"
  | "expenses"
  | "look"
  | "setup";

export interface SlyWorkflowSurface {
  id: SlyScreen;
  title: string;
  androidSource: string;
  purpose: string;
  routesThroughBrain: boolean;
}

export const SLY_WORKFLOWS: SlyWorkflowSurface[] = [
  {
    id: "boot",
    title: "Boot",
    androidSource: "BootScreen.kt",
    purpose: "Calm wake state before the lock surface.",
    routesThroughBrain: false
  },
  {
    id: "lock",
    title: "Lock",
    androidSource: "LockScreen.kt",
    purpose: "Shows the few things that matter and enters Home.",
    routesThroughBrain: true
  },
  {
    id: "home",
    title: "Home",
    androidSource: "HomeScreen.kt",
    purpose: "The heart: one prompt asks what should happen, then routes through the brain.",
    routesThroughBrain: true
  },
  {
    id: "now",
    title: "Now",
    androidSource: "NowScreen.kt",
    purpose: "Catch-up briefing, proposals, drafts, and waiting threads.",
    routesThroughBrain: true
  },
  {
    id: "people",
    title: "People",
    androidSource: "PeopleScreen.kt",
    purpose: "People waiting on replies, each ready for a one-tap agent draft.",
    routesThroughBrain: true
  },
  {
    id: "memory",
    title: "Memory",
    androidSource: "MemoryGraphScreen.kt",
    purpose: "Ask the memory brain and inspect remembered context.",
    routesThroughBrain: true
  },
  {
    id: "research",
    title: "Research",
    androidSource: "ResearchScreen.kt",
    purpose: "Paper/research workspace through the same brain context.",
    routesThroughBrain: true
  },
  {
    id: "apps",
    title: "Apps",
    androidSource: "AppsScreen.kt",
    purpose: "Reach installed apps and enter manual mode.",
    routesThroughBrain: false
  },
  {
    id: "manual",
    title: "Manual Mode",
    androidSource: "ManualModeScreen.kt",
    purpose: "Agent paused fallback with real device tools.",
    routesThroughBrain: false
  },
  {
    id: "expenses",
    title: "Expenses",
    androidSource: "ExpensesScreen.kt",
    purpose: "Receipts, invoices, and spending memory.",
    routesThroughBrain: true
  },
  {
    id: "look",
    title: "Look",
    androidSource: "LookScreen.kt",
    purpose: "Camera/screenshot understanding through vision and memory.",
    routesThroughBrain: true
  },
  {
    id: "setup",
    title: "Setup",
    androidSource: "SetupScreen.kt",
    purpose: "Provider keys, profile, imports, permissions, and on-device model choice.",
    routesThroughBrain: true
  }
];

