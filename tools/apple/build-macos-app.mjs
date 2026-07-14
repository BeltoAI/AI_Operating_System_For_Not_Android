import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const hostSource = join(repoRoot, "platforms/apple/SlyOSNative/MacHost/SlyOSMacHost.swift");
const webAppSource = join(repoRoot, "platforms/apple/SlyOSNative/Resources/WebApp");
const appPath = join(repoRoot, "platforms/macos/build/SlyOS.app");
const contentsPath = join(appPath, "Contents");
const macosPath = join(contentsPath, "MacOS");
const resourcesPath = join(contentsPath, "Resources");
const executablePath = join(macosPath, "SlyOS");
const agentSource = join(repoRoot, "platforms/desktop-agent/src/server.mjs");
const agentExecutablePath = join(macosPath, "SlyOSDeviceAgent");
const macIconsetPath = join(repoRoot, "platforms/apple/SlyOSNative/Resources/SlyOS.iconset");
const macIconPath = join(resourcesPath, "SlyOSIcon.icns");

run("npm", ["run", "apple:icons"]);
run("node", ["tools/apple/sync-web-assets.mjs"]);

if (!existsSync(hostSource)) throw new Error(`Missing ${hostSource}`);
if (!existsSync(join(webAppSource, "index.html"))) throw new Error("Missing synced WebApp/index.html");

rmSync(appPath, { recursive: true, force: true });
mkdirSync(macosPath, { recursive: true });
mkdirSync(resourcesPath, { recursive: true });

run("swiftc", [
  "-O",
  "-framework",
  "Cocoa",
  "-framework",
  "WebKit",
  hostSource,
  "-o",
  executablePath
]);
run("npx", [
  "pkg",
  agentSource,
  "--targets",
  "node22-macos-arm64",
  "--output",
  agentExecutablePath
]);

cpSync(webAppSource, join(resourcesPath, "WebApp"), { recursive: true });
run("iconutil", ["-c", "icns", macIconsetPath, "-o", macIconPath]);
writeFileSync(join(contentsPath, "Info.plist"), infoPlist());
const signingIdentity = findSigningIdentity();
run("codesign", [
  "--force",
  "--timestamp=none",
  "--identifier",
  "com.belto.slyos.macos.local",
  "--sign",
  signingIdentity,
  agentExecutablePath
]);
run("codesign", [
  "--force",
  "--options",
  "runtime",
  "--timestamp=none",
  "--sign",
  signingIdentity,
  appPath
]);
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

console.log(`Built ${appPath}`);
console.log(`Signed with ${signingIdentity === "-" ? "an ad-hoc identity" : signingIdentity}`);

function run(command, args) {
  execFileSync(command, args, { cwd: repoRoot, stdio: "inherit" });
}

function findSigningIdentity() {
  if (process.env.SLYOS_CODESIGN_IDENTITY?.trim()) return process.env.SLYOS_CODESIGN_IDENTITY.trim();
  try {
    const output = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    const match = output.match(/\"(Apple Development:[^\"]+)\"/);
    return match?.[1] ?? "-";
  } catch {
    return "-";
  }
}

function infoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>SlyOS</string>
  <key>CFBundleIdentifier</key>
  <string>com.belto.slyos.macos.local</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>SlyOS</string>
  <key>CFBundleDisplayName</key>
  <string>SlyOS</string>
  <key>CFBundleIconFile</key>
  <string>SlyOSIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.productivity</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSAppleEventsUsageDescription</key>
  <string>SlyOS uses automation only for device actions you explicitly request.</string>
  <key>NSScreenCaptureUsageDescription</key>
  <string>SlyOS observes the screen only while running a device-control task you request.</string>
</dict>
</plist>
`;
}
