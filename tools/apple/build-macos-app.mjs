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

cpSync(webAppSource, join(resourcesPath, "WebApp"), { recursive: true });
run("iconutil", ["-c", "icns", macIconsetPath, "-o", macIconPath]);
writeFileSync(join(contentsPath, "Info.plist"), infoPlist());
run("codesign", ["--force", "--deep", "--sign", "-", appPath]);

console.log(`Built ${appPath}`);

function run(command, args) {
  execFileSync(command, args, { cwd: repoRoot, stdio: "inherit" });
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
</dict>
</plist>
`;
}
