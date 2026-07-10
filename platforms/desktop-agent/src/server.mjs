#!/usr/bin/env node
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { homedir, platform, tmpdir } from "node:os";
import { delimiter, dirname, resolve, sep } from "node:path";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = Number(process.env.SLYOS_AGENT_PORT ?? 4317);
const token = process.env.SLYOS_AGENT_TOKEN || randomUUID();
const os = platform();
const shellEnabled = process.env.SLYOS_ENABLE_SHELL === "1";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const allowedRoots = parseAllowedRoots();

const server = createServer(async (request, response) => {
  try {
    setCors(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${host}:${port}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, name: "slyos-device-agent", os, shellEnabled });
      return;
    }

    if (!isAuthorized(request)) {
      sendJson(response, 401, { ok: false, error: "Missing or invalid bearer token." });
      return;
    }

    if (request.method === "GET" && url.pathname === "/capabilities") {
      sendJson(response, 200, { ok: true, capabilities: capabilities() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/actions") {
      const action = await readJson(request);
      const result = await handleAction(action);
      sendJson(response, 200, { ok: true, result });
      return;
    }

    sendJson(response, 404, { ok: false, error: "Not found." });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`SlyOS device agent listening on http://${host}:${port}`);
  console.log(`Token: ${token}`);
  console.log(`Allowed roots: ${allowedRoots.join(", ")}`);
  console.log(`Shell enabled: ${shellEnabled ? "yes" : "no"}`);
});

function capabilities() {
  return {
    openUrl: true,
    openApp: os === "darwin" || os === "win32" || os === "linux",
    screenshot: os === "darwin" || os === "linux",
    listDir: true,
    writeFile: true,
    runCommand: shellEnabled,
    allowedRoots
  };
}

async function handleAction(action) {
  if (!action || typeof action !== "object") throw new Error("Action body must be a JSON object.");

  switch (action.type) {
    case "open_url":
      assertString(action.url, "url");
      await openUrl(action.url);
      return { opened: action.url };
    case "open_app":
      assertString(action.app, "app");
      await openApp(action.app);
      return { opened: action.app };
    case "screenshot":
      return takeScreenshot();
    case "list_dir":
      assertString(action.path, "path");
      return listDirectory(action.path);
    case "write_file":
      assertString(action.path, "path");
      assertString(action.content, "content");
      return writeAllowedFile(action.path, action.content, Boolean(action.overwrite));
    case "run_command":
      if (!shellEnabled) throw new Error("run_command is disabled. Set SLYOS_ENABLE_SHELL=1 to enable it.");
      assertString(action.command, "command");
      if (action.args !== undefined && !Array.isArray(action.args)) throw new Error("args must be an array.");
      return runCommand(action.command, action.args ?? []);
    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}

async function openUrl(url) {
  const parsed = new URL(url);
  if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
    throw new Error("Only http, https, mailto, and tel URLs are allowed.");
  }
  await execPlatform(openCommand(), openArgs(url));
}

async function openApp(app) {
  if (os === "darwin") {
    await execPlatform("open", ["-a", app]);
    return;
  }
  if (os === "win32") {
    await execPlatform("powershell.exe", ["-NoProfile", "-Command", "Start-Process", app]);
    return;
  }
  await execPlatform("gtk-launch", [app]).catch(() => execPlatform("xdg-open", [app]));
}

async function takeScreenshot() {
  const path = resolve(tmpdir(), `slyos-screenshot-${Date.now()}.png`);
  if (os === "darwin") {
    await execPlatform("screencapture", ["-x", path]);
    return { path };
  }
  if (os === "linux") {
    await execPlatform("gnome-screenshot", ["-f", path]).catch(() => execPlatform("spectacle", ["-b", "-o", path]));
    return { path };
  }
  throw new Error("Screenshot is not implemented for this OS yet.");
}

async function listDirectory(inputPath) {
  const rootPath = requireAllowedPath(inputPath);
  const entries = await readdir(rootPath, { withFileTypes: true });
  return {
    path: rootPath,
    entries: entries.slice(0, 200).map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other"
    }))
  };
}

async function writeAllowedFile(inputPath, content, overwrite) {
  const targetPath = requireAllowedPath(inputPath);
  await mkdir(dirname(targetPath), { recursive: true });

  if (!overwrite) {
    try {
      await stat(targetPath);
      throw new Error("File already exists. Pass overwrite: true to replace it.");
    } catch (error) {
      if (error && error.code !== "ENOENT") throw error;
    }
  }

  await writeFile(targetPath, content, "utf8");
  return { path: targetPath, bytes: Buffer.byteLength(content, "utf8") };
}

async function runCommand(command, args) {
  const cleanArgs = args.map((arg) => String(arg));
  const output = await execPlatform(command, cleanArgs, { maxBuffer: 1024 * 1024 });
  return {
    stdout: output.stdout.slice(0, 20000),
    stderr: output.stderr.slice(0, 20000)
  };
}

function execPlatform(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { timeout: 30000, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${command} failed: ${error.message}${stderr ? `\n${stderr}` : ""}`;
        reject(error);
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

function openCommand() {
  if (os === "darwin") return "open";
  if (os === "win32") return "powershell.exe";
  return "xdg-open";
}

function openArgs(url) {
  if (os === "win32") return ["-NoProfile", "-Command", "Start-Process", url];
  return [url];
}

function requireAllowedPath(inputPath) {
  const targetPath = resolve(inputPath.replace(/^~/, homedir()));
  const allowed = allowedRoots.some((root) => targetPath === root || targetPath.startsWith(`${root}${sep}`));
  if (!allowed) {
    throw new Error(`Path is outside allowed roots: ${targetPath}`);
  }
  return targetPath;
}

function parseAllowedRoots() {
  const raw = process.env.SLYOS_ALLOWED_ROOTS;
  const roots = raw ? raw.split(delimiter) : [resolve(repoRoot, "private-data")];
  return roots.map((root) => resolve(root.replace(/^~/, homedir())));
}

function assertString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
}

function isAuthorized(request) {
  return request.headers.authorization === `Bearer ${token}`;
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolvePromise(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}
