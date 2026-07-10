import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MemoryItem, SettingsItem } from "./memory";

export interface SupabaseSyncConfig {
  url: string;
  publishableKey: string;
}

export interface BrainSyncClient {
  signInWithOtp(email: string): Promise<void>;
  signUpWithPassword(email: string, password: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  currentUserId(): Promise<string | null>;
  pushMemory(items: MemoryItem[]): Promise<void>;
  pullMemory(limit?: number): Promise<MemoryItem[]>;
  pushSettings(settings: SettingsItem[]): Promise<void>;
  pullSettings(): Promise<SettingsItem[]>;
}

export function createBrainSyncClient(config: SupabaseSyncConfig): BrainSyncClient {
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  return new SupabaseBrainSync(client);
}

class SupabaseBrainSync implements BrainSyncClient {
  constructor(private readonly client: SupabaseClient) {}

  async signInWithOtp(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({ email });
    if (error) throw error;
  }

  async signUpWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async currentUserId(): Promise<string | null> {
    const { data, error } = await this.client.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  }

  async pushMemory(items: MemoryItem[]): Promise<void> {
    const userId = await this.requireUser();
    if (!items.length) return;
    const rows = items.map((item) => ({
      user_id: userId,
      kind: item.kind,
      client_id: item.id,
      title: item.title,
      body: item.kind === "vault" ? "Encrypted vault item synced. Unlock on a trusted device." : item.body,
      data: {
        tags: item.tags,
        source: item.source,
        createdAt: item.createdAt,
        originalBody: item.kind === "vault" ? item.body : undefined
      },
      updated_at: toEpochMs(item.updatedAt),
      deleted: false
    }));
    const { error } = await this.client.from("brain_items").upsert(rows, { onConflict: "user_id,kind,client_id" });
    if (error) throw error;
  }

  async pullMemory(limit = 200): Promise<MemoryItem[]> {
    const userId = await this.requireUser();
    const { data, error } = await this.client
      .from("brain_items")
      .select("kind, client_id, title, body, data, updated_at, created_at, deleted")
      .eq("user_id", userId)
      .neq("kind", "setting")
      .eq("deleted", false)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.client_id,
      kind: row.kind,
      title: row.title,
      body: row.kind === "vault" ? "Encrypted vault item synced. Unlock on a trusted device." : (row.body ?? ""),
      tags: row.data?.tags ?? [],
      source: row.data?.source ?? "supabase",
      createdAt: row.data?.createdAt ?? row.created_at,
      updatedAt: fromEpochMs(row.updated_at)
    })) as MemoryItem[];
  }

  async pushSettings(settings: SettingsItem[]): Promise<void> {
    const userId = await this.requireUser();
    if (!settings.length) return;
    const rows = settings.map((item) => ({
      user_id: userId,
      kind: "setting",
      client_id: item.key,
      title: item.key,
      body: JSON.stringify(item.value),
      data: { value: item.value },
      updated_at: toEpochMs(item.updatedAt),
      deleted: false
    }));
    const { error } = await this.client.from("brain_items").upsert(rows, { onConflict: "user_id,kind,client_id" });
    if (error) throw error;
  }

  async pullSettings(): Promise<SettingsItem[]> {
    const userId = await this.requireUser();
    const { data, error } = await this.client
      .from("brain_items")
      .select("client_id, body, data, updated_at")
      .eq("user_id", userId)
      .eq("kind", "setting")
      .eq("deleted", false)
      .order("client_id", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      key: row.client_id,
      value: row.data?.value ?? safeJson(row.body),
      updatedAt: fromEpochMs(row.updated_at)
    }));
  }

  private async requireUser(): Promise<string> {
    const userId = await this.currentUserId();
    if (!userId) throw new Error("Sign in before syncing memory or settings.");
    return userId;
  }
}

function toEpochMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function fromEpochMs(value: number): string {
  return new Date(value).toISOString();
}

function safeJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
