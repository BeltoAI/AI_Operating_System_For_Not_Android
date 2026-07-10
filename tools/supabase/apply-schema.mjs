import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./env.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const schemaPath = join(repoRoot, "supabase/schema.sql");
loadDotEnv(repoRoot);

if (!existsSync(schemaPath)) {
  throw new Error("Missing supabase/schema.sql.");
}

if (!process.env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL is missing.");
  console.error("Create a Supabase project, copy its pooled or direct Postgres connection string, then run:");
  console.error("  SUPABASE_DB_URL='postgresql://...' npm run db:apply");
  console.error("");
  console.error("This script will not guess credentials or print secrets.");
  process.exit(1);
}

try {
  execFileSync("psql", [process.env.SUPABASE_DB_URL, "-v", "ON_ERROR_STOP=1", "-f", schemaPath], {
    cwd: repoRoot,
    stdio: "inherit"
  });
  console.log("Supabase schema applied successfully.");
} catch (error) {
  console.error("Failed to apply Supabase schema.");
  console.error("Check the DB URL, SSL mode, password, and whether the project is accepting connections.");
  process.exit(error.status ?? 1);
}
