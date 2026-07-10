import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const checks = [];

checkFile("supabase/schema.sql");
checkFile("supabase/migrations/20260710000000_initial_sync_schema.sql");
checkFile("supabase/config.toml");
checkCommand("psql");
checkCommand("supabase", false);
checkCommand("docker", false);
checkEnv("SUPABASE_URL", false);
checkEnv("SUPABASE_PUBLISHABLE_KEY", false);
checkEnv("SUPABASE_DB_URL", false);
checkEnv("SUPABASE_ACCESS_TOKEN", false);
checkEnv("SUPABASE_PROJECT_ID", false);

const schema = readFileSync(join(repoRoot, "supabase/schema.sql"), "utf8");
record("schema_has_rls", /enable row level security/i.test(schema), "schema.sql enables RLS");
record("schema_has_auth_uid_policies", /auth\.uid\(\).*user_id/is.test(schema), "schema.sql restricts rows to auth.uid() = user_id");
record("schema_has_authenticated_grants", /grant select, insert, update, delete .* to authenticated/i.test(schema), "schema.sql grants authenticated Data API access");

const readyForLiveApply = Boolean(process.env.SUPABASE_DB_URL);
record(
  "ready_for_live_apply",
  readyForLiveApply,
  readyForLiveApply ? "SUPABASE_DB_URL is present, so npm run db:apply can apply schema" : "SUPABASE_DB_URL missing; live schema apply is not available yet",
  false
);

const strict = process.argv.includes("--strict");
for (const item of checks) {
  const mark = item.ok ? "PASS" : item.required ? "FAIL" : "WARN";
  console.log(`${mark} ${item.name}: ${item.message}`);
}

const failedRequired = checks.filter((item) => item.required && !item.ok);
if (strict && failedRequired.length) {
  process.exitCode = 1;
}

function checkFile(relativePath) {
  const ok = existsSync(join(repoRoot, relativePath));
  record(`file:${relativePath}`, ok, ok ? "present" : "missing", true);
}

function checkCommand(command, required = true) {
  const ok = commandExists(command);
  record(`command:${command}`, ok, ok ? "available" : "not installed", required);
}

function checkEnv(name, required = true) {
  const ok = Boolean(process.env[name]);
  record(`env:${name}`, ok, ok ? "present (redacted)" : "missing", required);
}

function commandExists(command) {
  try {
    execFileSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function record(name, ok, message, required = true) {
  checks.push({ name, ok, message, required });
}
