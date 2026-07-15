import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const distDir = join(repoRoot, "platforms/desktop-shell/dist");
const nativeWebAppDir = join(repoRoot, "platforms/apple/SlyOSNative/Resources/WebApp");

run("npm", ["run", "build", "-w", "@badscientist/agent-core"]);
run("npm", ["run", "build", "-w", "@badscientist/desktop-shell", "--", "--base", "./"], {
  SLYOS_NATIVE_BUNDLE: "1"
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
  if (!scriptMatch) {
    throw new Error("Native WebApp index does not contain the expected Vite module entry.");
  }

  const scriptSrc = scriptMatch[1];
  const scriptPath = join(webAppDir, scriptSrc.replace(/^\.\//, ""));
  let script = readFileSync(scriptPath, "utf8");
  script = script
    .replaceAll("import.meta.resolve", "undefined")
    .replaceAll("import.meta.url", "(document.currentScript && document.currentScript.src || location.href)");
  const inlineScript = script.replaceAll("</script", "<\\/script");

  indexHtml = indexHtml.replace(
    /<script type="module" crossorigin src="([^"]+)"><\/script>/,
    () => `<script type="module">${inlineScript}</script>`
  );
  indexHtml = indexHtml.replaceAll(" crossorigin", "");
  validateNativeIndex(indexHtml, scriptSrc);
  writeFileSync(indexPath, indexHtml);
  rmSync(scriptPath, { force: true });
}

function validateNativeIndex(indexHtml, originalScriptSrc) {
  const openingTag = '<script type="module">';
  const openingIndex = indexHtml.indexOf(openingTag);
  const closingIndex = indexHtml.indexOf("</script>", openingIndex + openingTag.length);
  const closingScripts = indexHtml.match(/<\/script>/g) ?? [];
  if (openingIndex < 0 || closingIndex < 0 || closingScripts.length !== 1) {
    throw new Error(`Native WebApp must contain exactly one complete module block; found ${closingScripts.length} closing tags.`);
  }
  const beforeModule = indexHtml.slice(0, openingIndex);
  const afterModule = indexHtml.slice(closingIndex + "</script>".length);
  if (/<script(?:\s|>)/.test(beforeModule) || /<script(?:\s|>)/.test(afterModule)) {
    throw new Error("Native WebApp contains an unexpected script element outside its module block.");
  }
  if (indexHtml.includes(`src=\"${originalScriptSrc}\"`)) {
    throw new Error("Native WebApp entry was not inlined as a single module.");
  }
  if (indexHtml.includes("<script type=\"module\" crossorigin src=")) {
    throw new Error("Native WebApp still contains an external Vite module entry.");
  }
  if (!indexHtml.includes('<div id="app"></div>')) {
    throw new Error("Native WebApp is missing the SlyOS application root.");
  }
}
