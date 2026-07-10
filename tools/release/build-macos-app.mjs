import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const version = rootPackage.version ?? "0.0.0";
const commit = git(["rev-parse", "--short", "HEAD"]) || "unknown";
const artifactRoot = join(repoRoot, "release-artifacts");
const archiveBase = `slyos-macos-app-${version}-${commit}`;
const stagingDir = join(artifactRoot, archiveBase);
const archivePath = join(artifactRoot, `${archiveBase}.zip`);
const appPath = join(repoRoot, "platforms/macos/build/SlyOS.app");

rmSync(stagingDir, { recursive: true, force: true });
rmSync(archivePath, { force: true });
mkdirSync(stagingDir, { recursive: true });

run("npm", ["run", "macos:app"], repoRoot);

if (!existsSync(appPath)) {
  throw new Error("macOS build did not produce platforms/macos/build/SlyOS.app.");
}

run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], repoRoot);

cpSync(appPath, join(stagingDir, "SlyOS.app"), { recursive: true });
writeFileSync(join(stagingDir, "INSTALL.md"), installGuide({ version, commit }));
writeFileSync(join(stagingDir, "RELEASE.json"), JSON.stringify(releaseMeta({ version, commit }), null, 2) + "\n");

if (commandExists("ditto")) {
  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", archiveBase, `${archiveBase}.zip`], artifactRoot);
} else if (commandExists("zip")) {
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
    name: "SlyOS Native macOS App",
    version,
    commit,
    builtAt: new Date().toISOString(),
    artifactType: "native-macos-app",
    bundleIdentifier: "com.belto.slyos.macos.local",
    minimumMacOS: "14.0",
    notarized: false,
    signed: "ad-hoc",
    containsProjectDefaults: false,
    behavior: [
      "Borderless native macOS app.",
      "Covers the full active screen.",
      "Uses a high overlay window level so the SlyOS bottom nav sits over the macOS Dock area.",
      "Runs the shared SlyOS shell inside WebKit.",
      "Includes generated SlyOS app icons."
    ]
  };
}

function installGuide({ version, commit }) {
  return `# SlyOS Native macOS App

Version: ${version}
Commit: ${commit}

This artifact contains the native macOS SlyOS app wrapper.

## Install

1. Unzip the artifact.
2. Move \`SlyOS.app\` to \`/Applications\` if you want it outside the repo.
3. Open \`SlyOS.app\`.

Because this local build is ad-hoc signed and not notarized, macOS may block the first open. If that happens:

1. Open System Settings.
2. Go to Privacy & Security.
3. Allow SlyOS to open.
4. Open the app again.

## Behavior

- SlyOS opens as a borderless full-screen launcher-style surface.
- The app hides the Dock/menu bar and uses a high overlay level so the SlyOS bottom nav occupies the bottom frame.
- The UI comes from \`platforms/desktop-shell/src\`.
- Rebuild with \`npm run macos:app\` after UI edits.

## Native Device Control

Run the local desktop bridge separately when you want prompt-to-device actions:

\`\`\`bash
SLYOS_AGENT_TOKEN=choose-a-local-secret SLYOS_ENABLE_DEVICE_CONTROL=1 npm run agent
\`\`\`

Then open SlyOS Setup and save:

\`\`\`text
http://127.0.0.1:4317
\`\`\`

Use the same token you set in \`SLYOS_AGENT_TOKEN\`.
`;
}
