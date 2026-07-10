import { execFileSync, execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const version = rootPackage.version ?? "0.0.0";
const commit = git(["rev-parse", "--short", "HEAD"]) || "unknown";
const artifactRoot = join(repoRoot, "release-artifacts");
const archiveBase = `slyos-desktop-agent-${version}-${commit}`;
const stagingDir = join(artifactRoot, archiveBase);
const archivePath = join(artifactRoot, `${archiveBase}.zip`);

rmSync(stagingDir, { recursive: true, force: true });
rmSync(archivePath, { force: true });
mkdirSync(stagingDir, { recursive: true });

run("npm", ["run", "typecheck", "-w", "@badscientist/desktop-agent"], repoRoot);

cpSync(join(repoRoot, "platforms/desktop-agent"), join(stagingDir, "desktop-agent"), { recursive: true });
cpSync(join(repoRoot, "shared/tool-contracts/LOCAL_DEVICE_BRIDGE.md"), join(stagingDir, "LOCAL_DEVICE_BRIDGE.md"));
writeFileSync(join(stagingDir, "INSTALL.md"), installGuide({ version, commit }));
writeFileSync(join(stagingDir, "RELEASE.json"), JSON.stringify(releaseMeta({ version, commit }), null, 2) + "\n");

if (commandExists("zip")) {
  run("zip", ["-qry", archivePath, "."], stagingDir);
} else {
  run("tar", ["-czf", join(artifactRoot, `${archiveBase}.tar.gz`), "."], stagingDir);
}

console.log(`Built ${archivePath}`);

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: "ignore", shell: "/bin/sh" });
    return true;
  } catch {
    return false;
  }
}

function releaseMeta({ version, commit }) {
  return {
    name: "SlyOS Desktop Device Agent",
    version,
    commit,
    builtAt: new Date().toISOString(),
    artifactType: "desktop-agent",
    platforms: ["macos", "linux", "windows"],
    defaultUrl: "http://127.0.0.1:4317",
    actions: [
      "open_url",
      "open_app",
      "screenshot",
      "observe_screen",
      "get_frontmost_app",
      "get_clipboard",
      "set_clipboard",
      "type_text",
      "key_press",
      "hotkey",
      "pointer_move",
      "pointer_click",
      "scroll",
      "wait",
      "list_dir",
      "write_file",
      "run_command"
    ],
    safety: {
      localhostOnly: true,
      bearerTokenRequired: true,
      deviceControlRequiresOptIn: true,
      writeRootsRestricted: true,
      shellDisabledByDefault: true
    }
  };
}

function installGuide({ version, commit }) {
  return `# SlyOS Desktop Device Agent

Version: ${version}
Commit: ${commit}

This artifact contains the local desktop bridge for macOS, Linux, and Windows. It gives the SlyOS shell controlled OS access that a browser/PWA cannot perform directly.

## Run

\`\`\`bash
cd desktop-agent
SLYOS_AGENT_TOKEN=choose-a-local-secret SLYOS_ENABLE_DEVICE_CONTROL=1 node src/server.mjs
\`\`\`

Default URL:

\`\`\`text
http://127.0.0.1:4317
\`\`\`

## Safety defaults

- Listens on localhost only.
- Requires \`Authorization: Bearer <token>\` for all non-health endpoints.
- Pointer, keyboard, clipboard, and observe-loop actions require \`SLYOS_ENABLE_DEVICE_CONTROL=1\`.
- File writes are restricted to \`SLYOS_ALLOWED_ROOTS\`.
- Shell execution is disabled unless \`SLYOS_ENABLE_SHELL=1\`.
- No delete endpoint exists.

## Smoke test

\`\`\`bash
curl http://127.0.0.1:4317/health
curl -H 'Authorization: Bearer choose-a-local-secret' http://127.0.0.1:4317/capabilities
\`\`\`

## Device-control loop

\`\`\`text
observe_screen -> pointer_click/type_text/hotkey/scroll -> wait -> observe_screen
\`\`\`

Stop before external sends, destructive changes, financial actions, credentials, account settings, or ambiguous screens.

Read \`LOCAL_DEVICE_BRIDGE.md\` for the action contract.
`;
}
