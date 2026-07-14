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
  upsertMany(items: MemoryItem[]): MemoryItem[];
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
    upsertMany(items) {
      if (!items.length) return [];
      const merged = new Map(readMemory().map((item) => [item.id, item]));
      for (const item of items) {
        const current = merged.get(item.id);
        if (!current || current.updatedAt.localeCompare(item.updatedAt) < 0) merged.set(item.id, item);
      }
      const next = [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      writeMemory(next);
      return next;
    },
    search(query) {
      const needle = normalizeSearchText(query);
      if (!needle) return this.list();
      const terms = expandedSearchTerms(needle);
      return this.list()
        .map((item) => ({ item, score: memoryScore(item, needle, terms) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || right.item.updatedAt.localeCompare(left.item.updatedAt))
        .map((entry) => entry.item);
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

function memoryScore(item: MemoryItem, phrase: string, terms: string[]): number {
  const title = normalizeSearchText(item.title);
  const body = normalizeSearchText(item.body);
  const source = normalizeSearchText(item.source);
  const tags = item.tags.map(normalizeSearchText);
  const searchable = `${title} ${body} ${source} ${tags.join(" ")}`;
  let score = 0;

  if (title === phrase) score += 36;
  else if (title.includes(phrase)) score += 22;
  if (body.includes(phrase)) score += 14;
  if (tags.some((tag) => tag === phrase || tag.includes(phrase))) score += 12;
  if (source.includes(phrase)) score += 8;

  for (const term of terms) {
    if (title.includes(term)) score += 8;
    if (tags.some((tag) => tag.includes(term))) score += 6;
    if (source.includes(term)) score += 3;
    const occurrences = countOccurrences(body, term);
    score += Math.min(8, occurrences * 2);
  }

  const updatedAt = Date.parse(item.updatedAt);
  if (Number.isFinite(updatedAt)) {
    const ageDays = Math.max(0, (Date.now() - updatedAt) / 86_400_000);
    score += Math.max(0, 3 - ageDays / 30);
  }
  return score;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@.+-]+/g, " ")
    .trim();
}

function expandedSearchTerms(query: string): string[] {
  const stop = new Set([
    "about", "anything", "could", "does", "have", "know", "memory", "please", "remember", "slyos", "that", "the", "this", "what", "when", "where", "which", "who", "with", "would", "your"
  ]);
  const synonyms: Record<string, string[]> = {
    address: ["location", "home", "street"],
    calendar: ["meeting", "schedule", "event"],
    company: ["work", "employer", "organization"],
    email: ["mail", "contact"],
    job: ["role", "work", "career"],
    name: ["called", "identity", "profile"],
    person: ["contact", "people", "network"],
    phone: ["mobile", "number", "contact"],
    task: ["todo", "checklist", "pending"],
    wrote: ["paper", "document", "research"]
  };
  const terms = query.split(/\s+/).filter((term) => term.length > 2 && !stop.has(term));
  return [...new Set(terms.flatMap((term) => [term, ...(synonyms[term] ?? [])]))];
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let offset = 0;
  while (count < 4) {
    const next = text.indexOf(term, offset);
    if (next < 0) break;
    count += 1;
    offset = next + term.length;
  }
  return count;
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
