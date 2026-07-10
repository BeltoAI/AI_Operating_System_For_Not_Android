import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MemoryItem, SettingsItem } from "./memory";

export interface SupabaseSyncConfig {
  url: string;
  publishableKey: string;
}

export interface BrainSyncClient {
  signInWithOtp(email: string): Promise<void>;
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
    const rows = items.map((item) => ({
      id: item.id,
      user_id: userId,
      kind: item.kind,
      title: item.title,
      body: item.body,
      tags: item.tags,
      source: item.source,
      created_at: item.createdAt,
      updated_at: item.updatedAt
    }));
    const { error } = await this.client.from("memory_items").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }

  async pullMemory(limit = 200): Promise<MemoryItem[]> {
    const { data, error } = await this.client
      .from("memory_items")
      .select("id, kind, title, body, tags, source, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      tags: row.tags ?? [],
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })) as MemoryItem[];
  }

  async pushSettings(settings: SettingsItem[]): Promise<void> {
    const userId = await this.requireUser();
    const rows = settings.map((item) => ({
      user_id: userId,
      key: item.key,
      value: item.value,
      updated_at: item.updatedAt
    }));
    const { error } = await this.client.from("settings").upsert(rows, { onConflict: "user_id,key" });
    if (error) throw error;
  }

  async pullSettings(): Promise<SettingsItem[]> {
    const { data, error } = await this.client
      .from("settings")
      .select("key, value, updated_at")
      .order("key", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at
    }));
  }

  private async requireUser(): Promise<string> {
    const userId = await this.currentUserId();
    if (!userId) throw new Error("Sign in before syncing memory or settings.");
    return userId;
  }
}

