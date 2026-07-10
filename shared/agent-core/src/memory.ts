import { cryptoId } from "./actions";

export type MemoryKind =
  | "profile"
  | "fact"
  | "memory"
  | "message"
  | "chat"
  | "paper"
  | "setting"
  | "expense"
  | "document"
  | "doc"
  | "screen"
  | "vault";

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string;
  tags: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsItem {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface MemoryStore {
  list(): MemoryItem[];
  add(input: Omit<MemoryItem, "id" | "createdAt" | "updatedAt">): MemoryItem;
  upsert(item: MemoryItem): MemoryItem;
  search(query: string): MemoryItem[];
  remove(id: string): void;
  listSettings(): SettingsItem[];
  setSetting(key: string, value: unknown): SettingsItem;
}

export function createBrowserMemoryStore(storage: Storage, namespace = "badscientist"): MemoryStore {
  const memoryKey = `${namespace}:memory`;
  const settingsKey = `${namespace}:settings`;

  function readMemory(): MemoryItem[] {
    return safeJson<MemoryItem[]>(storage.getItem(memoryKey), []);
  }

  function writeMemory(items: MemoryItem[]): void {
    storage.setItem(memoryKey, JSON.stringify(items));
  }

  function readSettings(): SettingsItem[] {
    return safeJson<SettingsItem[]>(storage.getItem(settingsKey), []);
  }

  function writeSettings(items: SettingsItem[]): void {
    storage.setItem(settingsKey, JSON.stringify(items));
  }

  return {
    list() {
      return readMemory().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    add(input) {
      const now = new Date().toISOString();
      const item: MemoryItem = {
        ...input,
        id: cryptoId("memory"),
        createdAt: now,
        updatedAt: now
      };
      writeMemory([item, ...readMemory()]);
      return item;
    },
    upsert(item) {
      const existing = readMemory();
      const index = existing.findIndex((candidate) => candidate.id === item.id);
      if (index === -1) {
        writeMemory([item, ...existing]);
        return item;
      }
      const current = existing[index];
      if (!current) {
        writeMemory([item, ...existing]);
        return item;
      }
      if (current.updatedAt.localeCompare(item.updatedAt) >= 0) return current;
      const next = [...existing];
      next[index] = item;
      writeMemory(next);
      return item;
    },
    search(query) {
      const needle = query.trim().toLowerCase();
      if (!needle) return this.list();
      return this.list().filter((item) => {
        const haystack = [item.title, item.body, item.source, ...item.tags].join(" ").toLowerCase();
        return haystack.includes(needle);
      });
    },
    remove(id) {
      writeMemory(readMemory().filter((item) => item.id !== id));
    },
    listSettings() {
      return readSettings().sort((a, b) => a.key.localeCompare(b.key));
    },
    setSetting(key, value) {
      const updatedAt = new Date().toISOString();
      const next = readSettings().filter((item) => item.key !== key);
      const item = { key, value, updatedAt };
      writeSettings([item, ...next]);
      return item;
    }
  };
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
