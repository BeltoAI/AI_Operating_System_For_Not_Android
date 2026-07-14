import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MemoryItem, SettingsItem } from "./memory";

export interface SupabaseSyncConfig {
  url: string;
  publishableKey: string;
}

export interface SyncedVaultEnvelope {
  cipherBlob: string;
  salt: string;
  updatedAt: number;
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
  pushVault(envelope: SyncedVaultEnvelope): Promise<void>;
  pullVault(): Promise<SyncedVaultEnvelope | null>;
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
    const rows = items.filter((item) => item.kind !== "vault").map((item) => ({
      user_id: userId,
      kind: item.kind,
      client_id: item.id,
      title: item.title,
      body: item.body,
      data: {
        tags: item.tags,
        source: item.source,
        createdAt: item.createdAt,
        ...(item.kind === "profile" && item.id === "about" ? { owner: item.title } : {})
      },
      updated_at: toEpochMs(item.updatedAt),
      deleted: false
    }));
    if (!rows.length) return;
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
    return (data ?? []).map((row) => {
      const androidProfile = row.kind === "profile" && row.client_id === "about";
      const androidChat = row.kind === "chat" && String(row.client_id).startsWith("chat:");
      return {
        id: row.client_id,
        kind: row.kind,
        title: androidProfile && typeof row.data?.owner === "string" && row.data.owner.trim()
          ? row.data.owner.trim()
          : row.title,
        body: row.kind === "vault" ? "Encrypted vault item synced. Unlock on a trusted device." : (row.body ?? ""),
        tags: row.data?.tags ?? (androidProfile ? ["profile", "android-profile", "brain"] : androidChat ? ["chat", "android-chat", "brain"] : []),
        source: row.data?.source ?? (androidProfile || androidChat ? "Android" : "supabase"),
        createdAt: row.data?.createdAt ?? row.created_at,
        updatedAt: fromEpochMs(row.updated_at)
      };
    }) as MemoryItem[];
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

  async pushVault(envelope: SyncedVaultEnvelope): Promise<void> {
    const userId = await this.requireUser();
    const { error } = await this.client.from("brain_items").upsert({
      user_id: userId,
      kind: "vault",
      client_id: "bank",
      title: "Bank vault",
      body: envelope.cipherBlob,
      data: { salt: envelope.salt },
      updated_at: envelope.updatedAt,
      deleted: false
    }, { onConflict: "user_id,kind,client_id" });
    if (error) throw error;
  }

  async pullVault(): Promise<SyncedVaultEnvelope | null> {
    const userId = await this.requireUser();
    const { data, error } = await this.client
      .from("brain_items")
      .select("body, data, updated_at, deleted")
      .eq("user_id", userId)
      .eq("kind", "vault")
      .eq("client_id", "bank")
      .maybeSingle();
    if (error) throw error;
    if (!data || data.deleted || typeof data.body !== "string" || typeof data.data?.salt !== "string") return null;
    return { cipherBlob: data.body, salt: data.data.salt, updatedAt: Number(data.updated_at) || 0 };
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
