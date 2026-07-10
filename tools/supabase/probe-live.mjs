import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv, redacted } from "./env.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
loadDotEnv(repoRoot);

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const checks = [];

if (!supabaseUrl || !publishableKey) {
  console.error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.");
  console.error("Put them in .env or pass them inline before npm run db:probe.");
  process.exit(1);
}

record("env:SUPABASE_URL", true, redacted(supabaseUrl));
record("env:SUPABASE_PUBLISHABLE_KEY", true, redacted(publishableKey));

await checkRestTable("profiles", "id");
await checkRestTable("brain_items", "client_id");
await checkRestTable("vault_items", "id");
await checkRestTable("vault_meta", "user_id");
await checkAuthSettings();

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}: ${item.message}`);
}

if (checks.some((item) => !item.ok)) {
  process.exitCode = 1;
}

async function checkRestTable(table, column) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}?select=${encodeURIComponent(column)}&limit=1`;
  try {
    const response = await fetch(url, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`
      }
    });
    if (response.ok) {
      record(`rest:${table}`, true, "reachable through the Data API");
      return;
    }
    const body = await safeText(response);
    record(`rest:${table}`, false, `HTTP ${response.status}: ${body.slice(0, 180)}`);
  } catch (error) {
    record(`rest:${table}`, false, error instanceof Error ? error.message : String(error));
  }
}

async function checkAuthSettings() {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`;
  try {
    const response = await fetch(url, {
      headers: { apikey: publishableKey }
    });
    if (!response.ok) {
      const body = await safeText(response);
      record("auth:settings", false, `HTTP ${response.status}: ${body.slice(0, 180)}`);
      return;
    }
    const settings = await response.json();
    const emailEnabled = Boolean(settings?.external?.email);
    const signupEnabled = settings?.disable_signup === false;
    record(
      "auth:email_password",
      emailEnabled && signupEnabled,
      emailEnabled && signupEnabled ? "email auth and signups are enabled" : "enable email auth and signups"
    );
  } catch (error) {
    record("auth:settings", false, error instanceof Error ? error.message : String(error));
  }
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function record(name, ok, message) {
  checks.push({ name, ok, message });
}
