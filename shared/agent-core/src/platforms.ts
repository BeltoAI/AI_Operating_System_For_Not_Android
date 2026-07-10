export type PlatformId = "android-reference" | "ios" | "macos" | "linux" | "windows";

export type CapabilityStatus = "same" | "equivalent" | "limited" | "no";

export interface PlatformCapability {
  feature: string;
  androidReference: string;
  ios: CapabilityStatus;
  macos: CapabilityStatus;
  linux: CapabilityStatus;
  windows: CapabilityStatus;
  approach: string;
}

export const PLATFORM_CAPABILITIES: PlatformCapability[] = [
  {
    feature: "Agent home surface",
    androidReference: "HOME launcher",
    ios: "limited",
    macos: "equivalent",
    linux: "equivalent",
    windows: "equivalent",
    approach: "iOS companion plus widgets; desktop tray/global command palette."
  },
  {
    feature: "Notification memory",
    androidReference: "NotificationListenerService",
    ios: "no",
    macos: "limited",
    linux: "limited",
    windows: "limited",
    approach: "Desktop adapters where permissions allow; iOS uses share/import/manual handoff."
  },
  {
    feature: "Screen operation",
    androidReference: "AccessibilityService gestures",
    ios: "limited",
    macos: "equivalent",
    linux: "equivalent",
    windows: "equivalent",
    approach: "Desktop accessibility/UI automation; iOS App Intents and Shortcuts only."
  },
  {
    feature: "Memory brain",
    androidReference: "SQLite + vector store + profile/settings",
    ios: "same",
    macos: "same",
    linux: "same",
    windows: "same",
    approach: "Shared schema, local store, optional Supabase sync."
  },
  {
    feature: "Receipts and documents",
    androidReference: "Camera, Gmail sync, PDF/doc ingestion",
    ios: "same",
    macos: "same",
    linux: "same",
    windows: "same",
    approach: "Native file pickers/camera where available plus shared extraction contract."
  },
  {
    feature: "Outbound actions",
    androidReference: "Confirm cards for SMS/email/chat/calendar",
    ios: "limited",
    macos: "equivalent",
    linux: "equivalent",
    windows: "equivalent",
    approach: "Draft-first everywhere; explicit confirmation before side effects."
  }
];

