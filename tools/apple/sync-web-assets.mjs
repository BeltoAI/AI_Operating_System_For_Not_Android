import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const distDir = join(repoRoot, "platforms/desktop-shell/dist");
const nativeWebAppDir = join(repoRoot, "platforms/apple/SlyOSNative/Resources/WebApp");

run("npm", ["run", "build", "-w", "@badscientist/agent-core"]);
run("npm", ["run", "build", "-w", "@badscientist/desktop-shell", "--", "--base", "./"], {
  VITE_SUPABASE_URL: "",
  VITE_SUPABASE_PUBLISHABLE_KEY: ""
});

if (!existsSync(join(distDir, "index.html"))) {
  throw new Error("Desktop shell build did not produce dist/index.html.");
}

rmSync(nativeWebAppDir, { recursive: true, force: true });
mkdirSync(nativeWebAppDir, { recursive: true });
cpSync(distDir, nativeWebAppDir, { recursive: true });
makeWebKitFileBundleCompatible(nativeWebAppDir);

console.log(`Synced WebApp resources to ${nativeWebAppDir}`);

function run(command, args, envOverrides = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...envOverrides },
    stdio: "inherit"
  });
}

function makeWebKitFileBundleCompatible(webAppDir) {
  const indexPath = join(webAppDir, "index.html");
  let indexHtml = readFileSync(indexPath, "utf8");
  const scriptMatch = indexHtml.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
  if (!scriptMatch) return;

  const scriptSrc = scriptMatch[1];
  const scriptPath = join(webAppDir, scriptSrc.replace(/^\.\//, ""));
  let script = readFileSync(scriptPath, "utf8");
  script = script
    .replaceAll("import.meta.resolve", "undefined")
    .replaceAll("import.meta.url", "(document.currentScript && document.currentScript.src || location.href)");
  writeFileSync(scriptPath, script);

  indexHtml = indexHtml.replace(
    /<script type="module" crossorigin src="([^"]+)"><\/script>/,
    '<script defer src="$1"></script>'
  );
  indexHtml = indexHtml.replaceAll(" crossorigin", "");
  writeFileSync(indexPath, indexHtml);
}
