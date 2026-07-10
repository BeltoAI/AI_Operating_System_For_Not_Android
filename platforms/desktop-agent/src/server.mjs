#!/usr/bin/env node
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { execFile, execFileSync, spawn } from "node:child_process";
import { homedir, platform, tmpdir } from "node:os";
import { delimiter, dirname, resolve, sep } from "node:path";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = Number(process.env.SLYOS_AGENT_PORT ?? 4317);
const token = process.env.SLYOS_AGENT_TOKEN || randomUUID();
const os = platform();
const shellEnabled = process.env.SLYOS_ENABLE_SHELL === "1";
const deviceControlEnabled = process.env.SLYOS_ENABLE_DEVICE_CONTROL === "1";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const allowedRoots = parseAllowedRoots();
const macKeyCodes = {
  return: 36,
  tab: 48,
  space: 49,
  delete: 51,
  escape: 53,
  command: 55,
  shift: 56,
  caps_lock: 57,
  alt: 58,
  control: 59,
  right_shift: 60,
  right_alt: 61,
  right_control: 62,
  forward_delete: 117,
  home: 115,
  end: 119,
  page_up: 116,
  page_down: 121,
  left: 123,
  right: 124,
  down: 125,
  up: 126
};

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
  console.log(`Device control enabled: ${deviceControlEnabled ? "yes" : "no"}`);
});

function capabilities() {
  return {
    openUrl: true,
    openApp: os === "darwin" || os === "win32" || os === "linux",
    screenshot: os === "darwin" || os === "linux",
    observeScreen: deviceControlEnabled && (supportsScreenshot() || supportsFrontmostApp()),
    frontmostApp: supportsFrontmostApp(),
    clipboard: supportsClipboard(),
    deviceControl: automationCapabilities(),
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
    case "observe_screen":
      assertDeviceControl();
      return observeScreen();
    case "get_frontmost_app":
      assertDeviceControl();
      return getFrontmostApp();
    case "get_clipboard":
      assertDeviceControl();
      return getClipboard();
    case "set_clipboard":
      assertDeviceControl();
      assertString(action.text, "text");
      return setClipboard(action.text);
    case "type_text":
      assertDeviceControl();
      assertString(action.text, "text");
      return typeText(action.text);
    case "key_press":
      assertDeviceControl();
      assertString(action.key, "key");
      return keyPress(action.key, normalizeModifiers(action.modifiers));
    case "hotkey":
      assertDeviceControl();
      if (!Array.isArray(action.keys) || action.keys.length < 2) {
        throw new Error("keys must be an array like ['cmd', 'l'] or ['ctrl', 'shift', 'p'].");
      }
      return hotkey(action.keys.map((key) => String(key)));
    case "pointer_move":
      assertDeviceControl();
      assertNumber(action.x, "x");
      assertNumber(action.y, "y");
      return pointerMove(action.x, action.y);
    case "pointer_click":
      assertDeviceControl();
      assertNumber(action.x, "x");
      assertNumber(action.y, "y");
      return pointerClick(action.x, action.y, action.button ?? "left", action.clicks ?? 1);
    case "scroll":
      assertDeviceControl();
      return scrollBy(Number(action.deltaX ?? 0), Number(action.deltaY ?? 0));
    case "wait":
      return waitFor(action.ms ?? 500);
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

async function observeScreen() {
  const result = {
    observedAt: new Date().toISOString(),
    capabilities: automationCapabilities()
  };

  if (supportsScreenshot()) {
    result.screenshot = await takeScreenshot().catch((error) => ({ error: error.message }));
  }

  if (supportsFrontmostApp()) {
    result.frontmostApp = await getFrontmostApp().catch((error) => ({ error: error.message }));
  }

  return result;
}

async function getFrontmostApp() {
  if (os === "darwin") {
    const output = await runAppleScript([
      'tell application "System Events" to get name of first application process whose frontmost is true'
    ]);
    return { app: output.stdout.trim() };
  }

  if (os === "linux" && commandExists("xdotool")) {
    const output = await execPlatform("xdotool", ["getactivewindow", "getwindowname"]);
    return { app: output.stdout.trim() };
  }

  if (os === "win32") {
    const output = await runPowerShell(`
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class SlyOSWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$handle = [SlyOSWin32]::GetForegroundWindow()
$title = New-Object System.Text.StringBuilder 1024
[void][SlyOSWin32]::GetWindowText($handle, $title, $title.Capacity)
$title.ToString()
`);
    return { app: output.stdout.trim() };
  }

  throw new Error("Frontmost app detection is not available on this host.");
}

async function getClipboard() {
  if (os === "darwin") {
    const output = await execPlatform("pbpaste", []);
    return { text: output.stdout };
  }

  if (os === "linux") {
    if (commandExists("wl-paste")) return { text: (await execPlatform("wl-paste", ["--no-newline"])).stdout };
    if (commandExists("xclip")) return { text: (await execPlatform("xclip", ["-selection", "clipboard", "-out"])).stdout };
    if (commandExists("xsel")) return { text: (await execPlatform("xsel", ["--clipboard", "--output"])).stdout };
  }

  if (os === "win32") {
    const output = await runPowerShell("Get-Clipboard -Raw");
    return { text: output.stdout };
  }

  throw new Error("Clipboard read is not available on this host.");
}

async function setClipboard(text) {
  if (os === "darwin") {
    await runAppleScript(["on run argv", "set the clipboard to (item 1 of argv)", "end run"], [text]);
    return { bytes: Buffer.byteLength(text, "utf8") };
  }

  if (os === "linux") {
    if (commandExists("wl-copy")) {
      await execPlatformInput("wl-copy", [], text);
      return { bytes: Buffer.byteLength(text, "utf8") };
    }
    if (commandExists("xclip")) {
      await execPlatformInput("xclip", ["-selection", "clipboard"], text);
      return { bytes: Buffer.byteLength(text, "utf8") };
    }
    if (commandExists("xsel")) {
      await execPlatformInput("xsel", ["--clipboard", "--input"], text);
      return { bytes: Buffer.byteLength(text, "utf8") };
    }
  }

  if (os === "win32") {
    await runPowerShell("Set-Clipboard -Value $args[0]", [text]);
    return { bytes: Buffer.byteLength(text, "utf8") };
  }

  throw new Error("Clipboard write is not available on this host.");
}

async function typeText(text) {
  if (os === "darwin") {
    await runAppleScript(
      ["on run argv", 'tell application "System Events" to keystroke (item 1 of argv)', "end run"],
      [text]
    );
    return { typed: text.length };
  }

  if (os === "linux") {
    if (commandExists("xdotool")) {
      await execPlatform("xdotool", ["type", "--delay", "0", text]);
      return { typed: text.length };
    }
    if (commandExists("wtype")) {
      await execPlatform("wtype", [text]);
      return { typed: text.length };
    }
  }

  if (os === "win32") {
    await runPowerShell("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait($args[0])", [
      text
    ]);
    return { typed: text.length };
  }

  throw new Error("Typing is not available on this host.");
}

async function keyPress(key, modifiers = []) {
  const normalizedKey = normalizeKey(key);

  if (os === "darwin") {
    const suffix = macModifierSuffix(modifiers);
    const keyCode = macKeyCodes[normalizedKey];
    if (keyCode !== undefined) {
      await runAppleScript([`tell application "System Events" to key code ${keyCode}${suffix}`]);
      return { key: normalizedKey, modifiers };
    }
    if (normalizedKey.length === 1) {
      await runAppleScript(
        ["on run argv", `tell application "System Events" to keystroke (item 1 of argv)${suffix}`, "end run"],
        [normalizedKey]
      );
      return { key: normalizedKey, modifiers };
    }
  }

  if (os === "linux" && commandExists("xdotool")) {
    await execPlatform("xdotool", ["key", xdotoolKey(normalizedKey, modifiers)]);
    return { key: normalizedKey, modifiers };
  }

  if (os === "win32") {
    await runPowerShell("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait($args[0])", [
      windowsSendKey(normalizedKey, modifiers)
    ]);
    return { key: normalizedKey, modifiers };
  }

  throw new Error(`Key press is not available for '${key}' on this host.`);
}

async function hotkey(keys) {
  const normalized = keys.map((key) => normalizeKey(key));
  const key = normalized.at(-1);
  const modifiers = normalizeModifiers(normalized.slice(0, -1));
  return keyPress(key, modifiers);
}

async function pointerMove(x, y) {
  if (os === "darwin" && commandExists("cliclick")) {
    await execPlatform("cliclick", [`m:${Math.round(x)},${Math.round(y)}`]);
    return { x, y };
  }

  if (os === "linux" && commandExists("xdotool")) {
    await execPlatform("xdotool", ["mousemove", String(Math.round(x)), String(Math.round(y))]);
    return { x, y };
  }

  if (os === "win32") {
    await runPowerShell(
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point([int]$args[0], [int]$args[1])",
      [String(Math.round(x)), String(Math.round(y))]
    );
    return { x, y };
  }

  throw new Error("Pointer move needs cliclick on macOS or xdotool on Linux.");
}

async function pointerClick(x, y, button = "left", clicks = 1) {
  const normalizedButton = normalizeButton(button);
  const normalizedClicks = Math.max(1, Math.min(3, Number(clicks) || 1));
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);

  if (os === "darwin") {
    if (commandExists("cliclick")) {
      const prefix = normalizedButton === "right" ? "rc" : normalizedClicks > 1 ? "dc" : "c";
      await execPlatform("cliclick", [`${prefix}:${roundedX},${roundedY}`]);
      return { x: roundedX, y: roundedY, button: normalizedButton, clicks: normalizedClicks };
    }
    if (normalizedButton !== "left" || normalizedClicks !== 1) {
      throw new Error("macOS right/double click requires cliclick.");
    }
    await runAppleScript([`tell application "System Events" to click at {${roundedX}, ${roundedY}}`]);
    return { x: roundedX, y: roundedY, button: normalizedButton, clicks: normalizedClicks };
  }

  if (os === "linux" && commandExists("xdotool")) {
    await execPlatform("xdotool", [
      "mousemove",
      String(roundedX),
      String(roundedY),
      "click",
      "--repeat",
      String(normalizedClicks),
      linuxButton(normalizedButton)
    ]);
    return { x: roundedX, y: roundedY, button: normalizedButton, clicks: normalizedClicks };
  }

  if (os === "win32") {
    await runPowerShell(
      `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SlyOSMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
"@
$x = [int]$args[0]
$y = [int]$args[1]
$down = [uint32]$args[2]
$up = [uint32]$args[3]
$clicks = [int]$args[4]
[void][SlyOSMouse]::SetCursorPos($x, $y)
for ($i = 0; $i -lt $clicks; $i++) {
  [SlyOSMouse]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
  [SlyOSMouse]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
}
`,
      [
        String(roundedX),
        String(roundedY),
        String(normalizedButton === "right" ? 0x0008 : normalizedButton === "middle" ? 0x0020 : 0x0002),
        String(normalizedButton === "right" ? 0x0010 : normalizedButton === "middle" ? 0x0040 : 0x0004),
        String(normalizedClicks)
      ]
    );
    return { x: roundedX, y: roundedY, button: normalizedButton, clicks: normalizedClicks };
  }

  throw new Error("Pointer click is not available on this host.");
}

async function scrollBy(deltaX, deltaY) {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) throw new Error("deltaX and deltaY must be numbers.");

  if (os === "darwin" && commandExists("cliclick")) {
    await execPlatform("cliclick", [`w:${Math.round(deltaX)},${Math.round(deltaY)}`]);
    return { deltaX, deltaY };
  }

  if (os === "linux" && commandExists("xdotool")) {
    const button = deltaY > 0 ? "5" : "4";
    const repeats = Math.max(1, Math.min(30, Math.ceil(Math.abs(deltaY) / 120)));
    await execPlatform("xdotool", ["click", "--repeat", String(repeats), button]);
    return { deltaX, deltaY };
  }

  if (os === "win32") {
    await runPowerShell(
      `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SlyOSScroll {
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
"@
[SlyOSScroll]::mouse_event(0x0800, 0, 0, [uint32]([int]$args[0]), [UIntPtr]::Zero)
`,
      [String(Math.round(deltaY))]
    );
    return { deltaX, deltaY };
  }

  throw new Error("Scroll is not available on this host.");
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

function supportsScreenshot() {
  return os === "darwin" || os === "linux";
}

function supportsFrontmostApp() {
  return os === "darwin" || os === "win32" || (os === "linux" && commandExists("xdotool"));
}

function supportsClipboard() {
  return (
    os === "darwin" ||
    os === "win32" ||
    (os === "linux" &&
      (commandExists("wl-copy") || commandExists("wl-paste") || commandExists("xclip") || commandExists("xsel")))
  );
}

function automationCapabilities() {
  const hasCliclick = os === "darwin" && commandExists("cliclick");
  const hasXdotool = os === "linux" && commandExists("xdotool");
  const hasWtype = os === "linux" && commandExists("wtype");

  return {
    enabled: deviceControlEnabled,
    observeScreen: deviceControlEnabled && (supportsScreenshot() || supportsFrontmostApp()),
    frontmostApp: supportsFrontmostApp(),
    clipboard: supportsClipboard(),
    typeText: os === "darwin" || os === "win32" || hasXdotool || hasWtype,
    keyPress: os === "darwin" || os === "win32" || hasXdotool,
    pointerMove: os === "win32" || hasCliclick || hasXdotool,
    pointerClick: os === "darwin" || os === "win32" || hasXdotool,
    scroll: os === "win32" || hasCliclick || hasXdotool,
    wait: true,
    notes: deviceControlNotes({ hasCliclick, hasXdotool, hasWtype })
  };
}

function deviceControlNotes({ hasCliclick, hasXdotool, hasWtype }) {
  const notes = [
    "Pointer/keyboard actions require SLYOS_ENABLE_DEVICE_CONTROL=1.",
    "The agent should pause before external sends, destructive actions, payments, credentials, and account changes."
  ];

  if (os === "darwin") {
    notes.push("macOS requires Accessibility and Screen Recording permissions for reliable click-through automation.");
    if (!hasCliclick) notes.push("Install cliclick for pointer move, right click, double click, and scroll precision.");
  }

  if (os === "linux") {
    if (!hasXdotool) notes.push("Install xdotool on X11 for pointer, hotkey, and click automation.");
    if (!hasWtype) notes.push("Install wtype for Wayland text injection where supported.");
  }

  if (os === "win32") {
    notes.push("Windows automation uses PowerShell, SendKeys, and User32 APIs from the active user session.");
  }

  return notes;
}

function assertDeviceControl() {
  if (!deviceControlEnabled) {
    throw new Error("Device control is disabled. Set SLYOS_ENABLE_DEVICE_CONTROL=1 after granting OS permissions.");
  }
}

function runAppleScript(lines, args = []) {
  const osaArgs = [];
  for (const line of lines) {
    osaArgs.push("-e", line);
  }
  if (args.length) osaArgs.push("--", ...args.map((arg) => String(arg)));
  return execPlatform("osascript", osaArgs);
}

function runPowerShell(script, args = []) {
  return execPlatform("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
    ...args.map((arg) => String(arg))
  ]);
}

function execPlatform(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { timeout: 30000, encoding: "utf8", ...options }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${command} failed: ${error.message}${stderr ? `\n${stderr}` : ""}`;
        reject(error);
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

function execPlatformInput(command, args, input, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out.`));
    }, 30000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`${command} failed with exit code ${code}${stderr ? `\n${stderr}` : ""}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function commandExists(command) {
  try {
    if (os === "win32") {
      execFileSync("where.exe", [command], { stdio: "ignore" });
      return true;
    }
    execFileSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
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

function normalizeButton(button) {
  const value = String(button).toLowerCase();
  if (["left", "middle", "right"].includes(value)) return value;
  throw new Error("button must be left, middle, or right.");
}

function normalizeKey(key) {
  const value = String(key).trim().toLowerCase();
  const aliases = {
    cmd: "command",
    commandorcontrol: os === "darwin" ? "command" : "control",
    ctrl: "control",
    esc: "escape",
    enter: "return",
    del: "delete",
    backspace: "delete",
    option: "alt",
    opt: "alt",
    win: "meta",
    super: "meta"
  };
  return aliases[value] ?? value;
}

function normalizeModifiers(modifiers) {
  if (modifiers === undefined) return [];
  if (!Array.isArray(modifiers)) throw new Error("modifiers must be an array.");
  return modifiers.map((modifier) => normalizeKey(modifier));
}

function macModifierSuffix(modifiers) {
  if (!modifiers.length) return "";
  const mapped = modifiers.map((modifier) => {
    if (modifier === "command" || modifier === "meta") return "command down";
    if (modifier === "control") return "control down";
    if (modifier === "alt") return "option down";
    if (modifier === "shift") return "shift down";
    throw new Error(`Unsupported macOS modifier: ${modifier}`);
  });
  return ` using {${mapped.join(", ")}}`;
}

function xdotoolKey(key, modifiers) {
  const mappedModifiers = modifiers.map((modifier) => {
    if (modifier === "control") return "ctrl";
    if (modifier === "command" || modifier === "meta") return "super";
    if (modifier === "alt") return "alt";
    if (modifier === "shift") return "shift";
    throw new Error(`Unsupported Linux modifier: ${modifier}`);
  });
  return [...mappedModifiers, linuxKeyName(key)].join("+");
}

function linuxKeyName(key) {
  const map = {
    return: "Return",
    tab: "Tab",
    escape: "Escape",
    delete: "BackSpace",
    forward_delete: "Delete",
    space: "space",
    left: "Left",
    right: "Right",
    up: "Up",
    down: "Down"
  };
  return map[key] ?? key;
}

function windowsSendKey(key, modifiers) {
  const prefix = modifiers
    .map((modifier) => {
      if (modifier === "control") return "^";
      if (modifier === "alt") return "%";
      if (modifier === "shift") return "+";
      if (modifier === "command" || modifier === "meta") return "^";
      throw new Error(`Unsupported Windows modifier: ${modifier}`);
    })
    .join("");
  const map = {
    return: "{ENTER}",
    tab: "{TAB}",
    escape: "{ESC}",
    delete: "{BACKSPACE}",
    forward_delete: "{DELETE}",
    space: " ",
    left: "{LEFT}",
    right: "{RIGHT}",
    up: "{UP}",
    down: "{DOWN}"
  };
  return `${prefix}${map[key] ?? key}`;
}

function linuxButton(button) {
  if (button === "left") return "1";
  if (button === "middle") return "2";
  return "3";
}

function waitFor(ms) {
  const duration = Math.max(0, Math.min(30000, Number(ms) || 0));
  return new Promise((resolvePromise) => {
    setTimeout(() => resolvePromise({ waitedMs: duration }), duration);
  });
}

function assertString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
}

function assertNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
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
