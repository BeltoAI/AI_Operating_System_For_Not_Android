import type { MemoryItem } from "@badscientist/agent-core";
import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";
import initSqlJs, { type Database, type SqlValue } from "sql.js";
import sqlWasmUrl from "virtual:slyos-sql-wasm";

export interface AndroidBackupImport {
  memories: MemoryItem[];
  settings: Array<{ key: string; value: unknown }>;
  checklist: Array<{ id: string; text: string; done: boolean; createdAt: string; updatedAt: string }>;
  papers: Array<{ id: string; title: string; body: string; createdAt: string; updatedAt: string }>;
  expenses: Array<{ id: string; merchant: string; amount: number; currency: string; category: string; note: string; date: string; createdAt: string; updatedAt: string }>;
  coworkFiles: Array<{ id: string; name: string; kind: "markdown" | "text" | "json"; content: string; createdAt: string; updatedAt: string }>;
  report: {
    logEntries: number;
    messages: number;
    people: number;
    facts: number;
    checklist: number;
    papers: number;
    expenses: number;
    coworkFiles: number;
    networkConnections: number;
    warnings: string[];
  };
}

type PreferenceMap = Map<string, unknown>;
type ZipEntries = Record<string, Uint8Array>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false
});

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

export async function importAndroidBackup(file: Blob): Promise<AndroidBackupImport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("This is not an Android SlyOS brain ZIP.");
  const entries = unzipSync(bytes);
  const names = Object.keys(entries);
  if (!names.some((name) => name.startsWith("shared_prefs/") || name.includes("/shared_prefs/"))) {
    throw new Error("The ZIP does not contain Android SlyOS shared_prefs data.");
  }

  const warnings: string[] = [];
  const memories: MemoryItem[] = [];
  const settings: Array<{ key: string; value: unknown }> = [];
  const checklist: AndroidBackupImport["checklist"] = [];
  const papers: AndroidBackupImport["papers"] = [];
  const expenseRecords: AndroidBackupImport["expenses"] = [];
  const coworkFileRecords: AndroidBackupImport["coworkFiles"] = [];
  const main = readPreferences(entries, "slyos.xml");
  const logPreferences = readPreferences(entries, "slyos_memlog.xml");
  const checklistPreferences = readPreferences(entries, "slyos_checklist.xml");
  const paperPreferences = readPreferences(entries, "slyos_papers.xml");

  const profileName = stringPreference(main, "pf_name");
  const about = stringPreference(main, "about_you");
  const profileVoice = stringPreference(main, "style_profile");
  const profileEmail = stringPreference(main, "pf_email");
  const profilePhone = stringPreference(main, "pf_phone");
  const profileAddress = stringPreference(main, "pf_addr");
  const bookingLink = stringPreference(main, "booking_link");
  const darkMode = booleanPreference(main, "dark_mode");
  for (const [key, value] of [
    ["profileName", profileName],
    ["profileVoice", profileVoice],
    ["aboutYou", about],
    ["profileEmail", profileEmail],
    ["profilePhone", profilePhone],
    ["profileAddress", profileAddress],
    ["bookingLink", bookingLink]
  ] as const) {
    if (value) settings.push({ key, value });
  }
  if (darkMode !== null) settings.push({ key: "darkMode", value: darkMode });

  if (about || profileName || profileEmail || profilePhone || profileAddress) {
    const body = [
      about,
      profileEmail ? `Email: ${profileEmail}` : "",
      profilePhone ? `Phone: ${profilePhone}` : "",
      profileAddress ? `Address: ${profileAddress}` : ""
    ].filter(Boolean).join("\n");
    memories.push(memoryItem({
      id: "about",
      kind: "profile",
      title: profileName || "Profile",
      body,
      tags: ["profile", "person", "android-import", "brain"],
      source: "Android profile"
    }));
  }

  let factCount = 0;
  for (const [index, fact] of about.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).entries()) {
    memories.push(memoryItem({
      id: `android:fact:${index}`,
      kind: "fact",
      title: trimLabel(fact),
      body: fact,
      tags: ["fact", "android-import", "brain"],
      source: "About you"
    }));
    factCount += 1;
  }
  for (const [index, fact] of jsonArray(stringPreference(main, "learned_facts")).entries()) {
    if (typeof fact !== "string" || !fact.trim()) continue;
    memories.push(memoryItem({
      id: `android:learned:${index}`,
      kind: "fact",
      title: trimLabel(fact),
      body: fact,
      tags: ["fact", "learned", "android-import", "brain"],
      source: "Android learned"
    }));
    factCount += 1;
  }

  let logEntries = 0;
  for (const candidate of jsonArray(stringPreference(logPreferences, "log"))) {
    if (!isRecord(candidate)) continue;
    const id = scalarString(candidate.id);
    const body = scalarString(candidate.content);
    if (!id || !body) continue;
    const type = scalarString(candidate.type).toLowerCase();
    const createdAt = isoFromAndroidId(id);
    memories.push({
      id: `android:log:${id}`,
      kind: type === "paper" ? "paper" : type === "recall" || type === "screen" ? "screen" : type === "fact" ? "fact" : "message",
      title: scalarString(candidate.label) || trimLabel(body),
      body,
      tags: ["android-import", "brain", ...tagsForLogType(type)],
      source: scalarString(candidate.source) || "Android memory log",
      createdAt,
      updatedAt: createdAt
    });
    logEntries += 1;
  }

  for (const candidate of jsonArray(stringPreference(checklistPreferences, "items"))) {
    if (!isRecord(candidate)) continue;
    const text = scalarString(candidate.text).trim();
    const id = scalarString(candidate.id);
    if (!id || !text) continue;
    const at = isoFromAndroidId(id);
    const item = { id: `android-checklist-${id}`, text, done: candidate.done === true, createdAt: at, updatedAt: at };
    checklist.push(item);
    memories.push({
      id: `android:task:${id}`,
      kind: "memory",
      title: text,
      body: item.done ? "Completed" : "To do",
      tags: ["task", "checklist", "android-import", "brain"],
      source: "Android checklist",
      createdAt: at,
      updatedAt: at
    });
  }

  for (const candidate of jsonArray(stringPreference(paperPreferences, "index"))) {
    if (!isRecord(candidate)) continue;
    const id = scalarString(candidate.id);
    const title = scalarString(candidate.title).trim();
    if (!id || !title) continue;
    const updatedAt = isoFromAndroidId(scalarString(candidate.updated) || id);
    const html = textEntry(entries, `files/paper_${id}.html`) || "";
    const body = stripHtml(html).slice(0, 80_000) || "Research paper imported from Android.";
    papers.push({ id: `android-paper-${id}`, title, body, createdAt: isoFromAndroidId(id), updatedAt });
    memories.push({
      id: `android:paper:${id}`,
      kind: "paper",
      title,
      body,
      tags: ["paper", "research", "android-import", "brain"],
      source: "Android research",
      createdAt: isoFromAndroidId(id),
      updatedAt
    });
  }

  let people = 0;
  let messages = 0;
  let messageCharacters = 0;
  let expenses = 0;
  let networkConnections = 0;
  try {
    const messageDb = await openDatabase(entries, "slyos_msgs.db");
    if (messageDb) {
      const messageRows = queryRows(
        messageDb,
        "SELECT rowid, contact, platform, sender, role, body, ts FROM messages WHERE TRIM(body) <> '' ORDER BY ts DESC LIMIT 1200"
      );
      for (const row of messageRows) {
        const body = scalarString(row.body).trim().slice(0, 2000);
        if (!body) continue;
        if (messageCharacters + body.length > 1_400_000) break;
        const contact = scalarString(row.contact).trim() || "Unknown contact";
        const role = scalarString(row.role).toLowerCase();
        const sender = scalarString(row.sender).trim();
        const rowId = scalarString(row.rowid) || stableHash(`${contact}:${scalarString(row.ts)}:${body}`);
        const updatedAt = isoFromAndroidId(scalarString(row.ts));
        memories.push({
          id: `android:message:${rowId}`,
          kind: "message",
          title: `${role === "me" ? "You to" : sender || "From"} ${contact}`,
          body,
          tags: ["message", "chat", role === "me" ? "outgoing" : "incoming", "android-import", "brain"],
          source: scalarString(row.platform) || "Android chats",
          createdAt: updatedAt,
          updatedAt
        });
        messages += 1;
        messageCharacters += body.length;
      }

      const rows = queryRows(messageDb, "SELECT contact, COUNT(*) AS count, COALESCE(MAX(platform), 'Chats') AS platform, MAX(ts) AS latest FROM messages WHERE TRIM(contact) <> '' GROUP BY contact ORDER BY count DESC LIMIT 300");
      for (const row of rows) {
        const contact = scalarString(row.contact).trim();
        const count = Number(row.count) || 0;
        if (!contact || !count) continue;
        const updatedAt = isoFromAndroidId(scalarString(row.latest));
        memories.push({
          id: `android:person:${stableHash(contact)}`,
          kind: "profile",
          title: contact,
          body: `${count} message${count === 1 ? "" : "s"}`,
          tags: ["person", "chat", "android-import", "brain"],
          source: scalarString(row.platform) || "Android chats",
          createdAt: updatedAt,
          updatedAt
        });
        people += 1;
      }
      messageDb.close();
    }
  } catch (error) {
    warnings.push(`Messages database could not be read: ${errorMessage(error)}`);
  }

  try {
    const expenseDb = await openDatabase(entries, "slyos_expenses.db");
    if (expenseDb) {
      const rows = queryRows(expenseDb, "SELECT id, merchant, ts, total, currency, category, source, raw_text FROM expenses ORDER BY ts DESC LIMIT 500");
      for (const row of rows) {
        const merchant = scalarString(row.merchant).trim() || "Expense";
        const id = scalarString(row.id);
        const total = Number(row.total) || 0;
        const currency = scalarString(row.currency) || "USD";
        const at = isoFromAndroidId(scalarString(row.ts));
        const recordId = `android-expense-${id || stableHash(`${merchant}:${at}:${total}`)}`;
        const note = scalarString(row.raw_text).slice(0, 4000);
        expenseRecords.push({
          id: recordId,
          merchant,
          amount: total,
          currency,
          category: scalarString(row.category) || "Other",
          note,
          date: at.slice(0, 10),
          createdAt: at,
          updatedAt: at
        });
        memories.push({
          id: `android:expense:${id || stableHash(`${merchant}:${at}:${total}`)}`,
          kind: "expense",
          title: `Expense: ${merchant}`,
          body: `${currency} ${total.toFixed(2)} · ${scalarString(row.category) || "Other"}${note ? `\n${note}` : ""}`,
          tags: ["expense", "android-import", "brain"],
          source: scalarString(row.source) || "Android expenses",
          createdAt: at,
          updatedAt: at
        });
        expenses += 1;
      }
      expenseDb.close();
    }
  } catch (error) {
    warnings.push(`Expenses database could not be read: ${errorMessage(error)}`);
  }

  try {
    const networkDb = await openDatabase(entries, "slyos_conn.db");
    if (networkDb) {
      const row = queryRows(networkDb, "SELECT COUNT(*) AS count, SUM(CASE WHEN reachedOut = 1 THEN 1 ELSE 0 END) AS reached FROM conns")[0];
      networkConnections = Number(row?.count) || 0;
      if (networkConnections) {
        const reached = Number(row?.reached) || 0;
        memories.push(memoryItem({
          id: "android:network:linkedin",
          kind: "memory",
          title: "LinkedIn network",
          body: `${networkConnections} connections · reached out to ${reached}`,
          tags: ["network", "linkedin", "android-import", "brain"],
          source: "Android network"
        }));
      }
      networkDb.close();
    }
  } catch (error) {
    warnings.push(`Network database could not be read: ${errorMessage(error)}`);
  }

  let coworkFiles = 0;
  for (const [name, data] of Object.entries(entries)) {
    if (!/(?:^|\/)files\/cowork\/[^/]+$/i.test(name) || data.byteLength > 1_000_000) continue;
    const body = safeUtf8(data).trim();
    if (!body) continue;
    const title = name.split("/").pop() || "Cowork file";
    const kind = title.toLowerCase().endsWith(".json") ? "json" : title.toLowerCase().endsWith(".md") ? "markdown" : "text";
    const recordId = `android-cowork-${stableHash(name)}`;
    const now = new Date().toISOString();
    coworkFileRecords.push({ id: recordId, name: title, kind, content: body.slice(0, 80_000), createdAt: now, updatedAt: now });
    memories.push(memoryItem({
      id: `android:cowork:${stableHash(name)}`,
      kind: "document",
      title,
      body: body.slice(0, 80_000),
      tags: ["cowork", "document", "android-import", "brain"],
      source: "Android Cowork"
    }));
    coworkFiles += 1;
  }

  return {
    memories: dedupeMemories(memories),
    settings,
    checklist,
    papers,
    expenses: expenseRecords,
    coworkFiles: coworkFileRecords,
    report: {
      logEntries,
      messages,
      people,
      facts: factCount,
      checklist: checklist.length,
      papers: papers.length,
      expenses,
      coworkFiles,
      networkConnections,
      warnings
    }
  };
}

function readPreferences(entries: ZipEntries, fileName: string): PreferenceMap {
  const name = Object.keys(entries).find((candidate) => candidate.endsWith(`/shared_prefs/${fileName}`) || candidate === `shared_prefs/${fileName}`);
  if (!name || !entries[name]) return new Map();
  const parsed = xmlParser.parse(strFromU8(entries[name])) as { map?: Record<string, unknown> };
  const root = parsed.map;
  const values = new Map<string, unknown>();
  if (!root) return values;
  for (const tag of ["string", "boolean", "int", "long", "float", "set"] as const) {
    for (const item of asArray(root[tag])) {
      if (!isRecord(item) || typeof item.name !== "string") continue;
      if (tag === "string") values.set(item.name, scalarString(item["#text"]));
      else if (tag === "boolean") values.set(item.name, String(item.value).toLowerCase() === "true");
      else if (tag === "set") values.set(item.name, asArray(item.string).map((value) => isRecord(value) ? scalarString(value["#text"]) : scalarString(value)));
      else values.set(item.name, Number(item.value));
    }
  }
  return values;
}

async function openDatabase(entries: ZipEntries, fileName: string): Promise<Database | null> {
  const name = Object.keys(entries).find((candidate) => candidate.endsWith(`/databases/${fileName}`) || candidate === `databases/${fileName}`);
  if (!name || !entries[name]) return null;
  sqlPromise ??= initSqlJs({ locateFile: () => sqlWasmUrl });
  const SQL = await sqlPromise;
  return new SQL.Database(entries[name]);
}

function queryRows(database: Database, query: string): Array<Record<string, SqlValue>> {
  const result = database.exec(query)[0];
  if (!result) return [];
  return result.values.map((values) => Object.fromEntries(result.columns.map((column, index) => [column, values[index] ?? null])));
}

function memoryItem(input: Omit<MemoryItem, "createdAt" | "updatedAt">): MemoryItem {
  const now = new Date().toISOString();
  return { ...input, createdAt: now, updatedAt: now };
}

function stringPreference(preferences: PreferenceMap, key: string): string {
  return scalarString(preferences.get(key));
}

function booleanPreference(preferences: PreferenceMap, key: string): boolean | null {
  const value = preferences.get(key);
  return typeof value === "boolean" ? value : null;
}

function jsonArray(value: string): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function tagsForLogType(type: string): string[] {
  if (type === "prompt") return ["prompt", "home-prompt"];
  if (type === "response") return ["response", "agent-response"];
  if (type === "task") return ["task"];
  if (type === "paper") return ["paper", "research"];
  if (type === "recall" || type === "screen") return ["recall", "screen"];
  if (type === "person") return ["person"];
  if (type === "network") return ["network"];
  return type ? [type] : ["memory"];
}

function textEntry(entries: ZipEntries, suffix: string): string {
  const name = Object.keys(entries).find((candidate) => candidate.endsWith(`/${suffix}`) || candidate === suffix);
  return name && entries[name] ? safeUtf8(entries[name]) : "";
}

function safeUtf8(data: Uint8Array): string {
  try {
    return strFromU8(data);
  } catch {
    return "";
  }
}

function stripHtml(value: string): string {
  if (!value) return "";
  const documentValue = new DOMParser().parseFromString(value, "text/html");
  return (documentValue.body.textContent || "").replace(/\s+/g, " ").trim();
}

function dedupeMemories(memories: MemoryItem[]): MemoryItem[] {
  const map = new Map<string, MemoryItem>();
  for (const item of memories) map.set(`${item.kind}:${item.id}`, item);
  return [...map.values()];
}

function isoFromAndroidId(value: string): string {
  const number = Number(value);
  const date = new Date(Number.isFinite(number) && number > 946_684_800_000 && number < 4_102_444_800_000 ? number : Date.now());
  return date.toISOString();
}

function trimLabel(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 40 ? `${clean.slice(0, 39)}…` : clean;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function scalarString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return "";
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
