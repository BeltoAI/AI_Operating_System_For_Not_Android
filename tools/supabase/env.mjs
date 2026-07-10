import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadDotEnv(repoRoot) {
  for (const filename of [".env.local", ".env"]) {
    const filePath = join(repoRoot, filename);
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = stripQuotes(rawValue.trim());
    }
  }
}

export function redacted(value) {
  if (!value) return "missing";
  if (value.length <= 12) return "present (redacted)";
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
