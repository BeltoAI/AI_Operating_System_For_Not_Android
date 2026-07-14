#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { resolve } from "node:path";

const bridgeUrl = (process.env.SLYOS_AGENT_URL || "http://127.0.0.1:4317").replace(/\/$/, "");
const token = process.env.SLYOS_AGENT_TOKEN || "slyos-local-dev";
const logDirectory = platform() === "darwin"
  ? resolve(homedir(), "Library/Logs/SlyOS")
  : platform() === "win32"
    ? resolve(process.env.LOCALAPPDATA || homedir(), "SlyOS/Logs")
    : resolve(process.env.XDG_STATE_HOME || resolve(homedir(), ".local/state"), "slyos");

console.log("SlyOS local doctor");
console.log(`Bridge: ${bridgeUrl}`);

let failed = false;
try {
  const health = await request("/health", false);
  console.log(`Agent: online · v${health.version || "unknown"} · pid ${health.pid || "unknown"}`);

  const capabilityPayload = await request("/capabilities");
  const control = capabilityPayload.capabilities?.deviceControl || {};
  console.log(`Control: ${control.enabled ? "enabled" : "disabled"} · click ${yesNo(control.pointerClick)} · type ${yesNo(control.typeText)} · hotkey ${yesNo(control.hotkey)}`);

  if (platform() === "darwin") {
    const permissionPayload = await request("/actions", true, { type: "get_permissions" });
    const permissions = permissionPayload.result || {};
    console.log(permissions.sessionLocked
      ? "Permissions: unavailable while the Mac is locked"
      : `Permissions: screen ${yesNo(permissions.screenRecording)} · accessibility ${yesNo(permissions.accessibility)} · automation ${yesNo(permissions.automation)}`);
  }
} catch (error) {
  failed = true;
  console.error(`Agent check failed: ${error instanceof Error ? error.message : String(error)}`);
}

for (const filename of platform() === "darwin" ? ["host.log", "device-agent.log"] : ["device-agent.log"]) {
  const path = resolve(logDirectory, filename);
  try {
    const lines = (await readFile(path, "utf8")).trim().split("\n").slice(-8).map(redact);
    console.log(`\n${path}`);
    for (const line of lines) console.log(line);
  } catch {
    console.log(`\n${path}\n(no log yet)`);
  }
}

console.log("\nCross-device database: npm run db:probe");
if (failed) process.exitCode = 1;

async function request(path, authorize = true, body) {
  const response = await fetch(`${bridgeUrl}${path}`, {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers: {
      ...(authorize ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {})
    },
    signal: AbortSignal.timeout(8000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(String(payload.error || `HTTP ${response.status}`));
  return payload;
}

function yesNo(value) {
  return value === true ? "yes" : value === false ? "no" : "unknown";
}

function redact(value) {
  return value
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}
