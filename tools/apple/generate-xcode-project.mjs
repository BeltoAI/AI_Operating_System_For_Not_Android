import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const projectRoot = join(repoRoot, "platforms/apple/SlyOSNative");
const specPath = join(projectRoot, "project.yml");

run("npm", ["run", "apple:icons"]);
run("node", ["tools/apple/sync-web-assets.mjs"]);

if (!existsSync(specPath)) {
  throw new Error(`Missing ${specPath}`);
}

run("xcodegen", ["generate", "--spec", specPath], projectRoot);

console.log(`Generated ${join(projectRoot, "SlyOSNative.xcodeproj")}`);

function run(command, args, cwd = repoRoot) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}
