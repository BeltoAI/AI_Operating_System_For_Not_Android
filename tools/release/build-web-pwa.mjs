import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const shellPackage = JSON.parse(readFileSync(join(repoRoot, "platforms/desktop-shell/package.json"), "utf8"));

const version = rootPackage.version ?? shellPackage.version ?? "0.0.0";
const commit = git(["rev-parse", "--short", "HEAD"]) || "unknown";
const artifactRoot = join(repoRoot, "release-artifacts");
const stagingDir = join(artifactRoot, `slyos-web-pwa-${version}-${commit}`);
const archiveBase = `slyos-web-pwa-${version}-${commit}`;
const archivePath = join(artifactRoot, `${archiveBase}.zip`);

rmSync(stagingDir, { recursive: true, force: true });
rmSync(archivePath, { force: true });
mkdirSync(stagingDir, { recursive: true });

run("npm", ["run", "typecheck"], repoRoot);
run("npm", ["run", "build", "-w", "@badscientist/desktop-shell"], repoRoot);

const distDir = join(repoRoot, "platforms/desktop-shell/dist");
if (!existsSync(join(distDir, "index.html"))) {
  throw new Error("Desktop shell build did not produce dist/index.html.");
}

cpSync(distDir, join(stagingDir, "app"), { recursive: true });
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
    name: "SlyOS BADSCIENTIST Web PWA",
    version,
    commit,
    builtAt: new Date().toISOString(),
    artifactType: "web-pwa",
    routes: [
      "/?screen=home",
      "/?screen=now",
      "/?screen=memory",
      "/?screen=memory-settings",
      "/?screen=research",
      "/?screen=cowork",
      "/?screen=voice",
      "/?screen=setup"
    ],
    nativeStatus: {
      ios: "SwiftUI source scaffold exists; full Xcode app/signing still required for IPA/TestFlight.",
      macos: "PWA artifact works today; native Tauri shell requires Rust/Tauri and full native adapter work.",
      linux: "PWA artifact works today; native package requires Tauri/Linux adapter work.",
      windows: "PWA artifact works today; native package requires Tauri/Windows adapter work."
    }
  };
}

function installGuide({ version, commit }) {
  return `# SlyOS BADSCIENTIST Web PWA

Version: ${version}
Commit: ${commit}

This artifact is the installable web/PWA build of the SlyOS shell. It is the current cross-device runnable release path for iPhone, macOS, Linux, and Windows while native wrappers are being built.

## What is inside

\`\`\`text
app/            Static built app
INSTALL.md      This file
RELEASE.json    Version and platform status
\`\`\`

## Run locally

From this folder:

\`\`\`bash
cd app
python3 -m http.server 4173
\`\`\`

Open:

\`\`\`text
http://127.0.0.1:4173/?screen=home
\`\`\`

Do not open \`index.html\` directly from Finder. Service workers and app routing need an HTTP server.

## Install on iPhone or iPad

1. Serve the app from a reachable HTTPS URL or local network URL.
2. Open it in Safari.
3. Tap Share.
4. Tap Add to Home Screen.
5. Launch SlyOS from the home screen.

iOS does not allow this PWA to replace the launcher, read all notifications, or operate arbitrary apps. Native iOS work lives under \`platforms/ios\`.

## Install on macOS, Linux, or Windows

1. Serve or deploy the \`app/\` folder.
2. Open it in Chrome, Edge, or another PWA-capable browser.
3. Use the browser Install App command.
4. Launch SlyOS like a desktop app.

## Useful routes

- \`/?screen=home\`
- \`/?screen=now\`
- \`/?screen=outbox\`
- \`/?screen=reconnect\`
- \`/?screen=memory\`
- \`/?screen=memory-settings\`
- \`/?screen=mission\`
- \`/?screen=network\`
- \`/?screen=research\`
- \`/?screen=cowork\`
- \`/?screen=voice\`
- \`/?screen=setup\`

## Database

Supabase is optional. To sync memory/settings across devices, create a Supabase project, run \`supabase/schema.sql\`, enable email/password auth, and paste the publishable key in Setup.
`;
}
