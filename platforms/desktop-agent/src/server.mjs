#!/usr/bin/env node
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { execFile, execFileSync, spawn } from "node:child_process";
import { homedir, platform, tmpdir } from "node:os";
import { delimiter, dirname, resolve, sep } from "node:path";
import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";

const host = "127.0.0.1";
const port = Number(process.env.SLYOS_AGENT_PORT ?? 4317);
const token = process.env.SLYOS_AGENT_TOKEN || randomUUID();
const os = platform();
const shellEnabled = process.env.SLYOS_ENABLE_SHELL === "1";
const deviceControlEnabled = process.env.SLYOS_ENABLE_DEVICE_CONTROL === "1";
const repoRoot = resolve(process.env.SLYOS_REPO_ROOT || process.cwd());
const allowedRoots = parseAllowedRoots();
const agentVersion = "0.4.0";
const diagnosticsDir = os === "darwin"
  ? resolve(homedir(), "Library/Logs/SlyOS")
  : os === "win32"
    ? resolve(process.env.LOCALAPPDATA || homedir(), "SlyOS/Logs")
    : resolve(process.env.XDG_STATE_HOME || resolve(homedir(), ".local/state"), "slyos");
const diagnosticsLogPath = resolve(diagnosticsDir, "device-agent.log");
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

process.on("uncaughtException", (error) => {
  void logDiagnostic("agent.uncaught", {
    error: error instanceof Error ? error.stack || error.message : String(error)
  }).finally(() => process.exit(1));
});

process.on("unhandledRejection", (reason) => {
  void logDiagnostic("agent.unhandled_rejection", {
    error: reason instanceof Error ? reason.stack || reason.message : String(reason)
  });
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    void logDiagnostic("agent.stop", { signal }).finally(() => process.exit(0));
  });
}

const server = createServer(async (request, response) => {
  const requestId = randomUUID().slice(0, 8);
  let actionType = "";
  try {
    setCors(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${host}:${port}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, name: "slyos-device-agent", version: agentVersion, pid: process.pid, os, shellEnabled, diagnosticsLogPath });
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
      actionType = String(action?.type ?? "unknown");
      await logDiagnostic("action.start", { requestId, ...summarizeAction(action) });
      const result = await handleAction(action);
      await logDiagnostic("action.ok", { requestId, type: actionType, summary: summarizeResult(result) });
      sendJson(response, 200, { ok: true, result });
      return;
    }

    sendJson(response, 404, { ok: false, error: "Not found." });
  } catch (error) {
    await logDiagnostic("action.error", {
      requestId,
      type: actionType || `${request.method ?? "?"} ${request.url ?? "?"}`,
      error: error instanceof Error ? error.message : String(error)
    });
    sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`SlyOS device agent listening on http://${host}:${port}`);
  console.log(`Token: ${token}`);
  console.log(`Allowed roots: ${allowedRoots.join(", ")}`);
  console.log(`Shell enabled: ${shellEnabled ? "yes" : "no"}`);
  console.log(`Device control enabled: ${deviceControlEnabled ? "yes" : "no"}`);
  console.log(`Diagnostics: ${diagnosticsLogPath}`);
  void logDiagnostic("agent.start", { version: agentVersion, pid: process.pid, os, port, shellEnabled, deviceControlEnabled });
});

function capabilities() {
  return {
    openUrl: true,
    openApp: os === "darwin" || os === "win32" || os === "linux",
    listApps: true,
    screenshot: os === "darwin" || os === "linux",
    observeScreen: deviceControlEnabled && (supportsScreenshot() || supportsFrontmostApp()),
    accessibilityTree: deviceControlEnabled && os === "darwin",
    nativeData: {
      calendar: os === "darwin",
      contacts: os === "darwin",
      reminders: os === "darwin",
      fileSearch: os === "darwin" || os === "linux"
    },
    localModel: { runtime: "ollama", endpoint: "http://127.0.0.1:11434" },
    frontmostApp: supportsFrontmostApp(),
    clipboard: supportsClipboard(),
    deviceControl: automationCapabilities(),
    listDir: true,
    readFile: true,
    writeFile: true,
    appendFile: true,
    makeDir: true,
    moveFile: true,
    runCommand: shellEnabled,
    diagnostics: { enabled: true, logPath: diagnosticsLogPath },
    permissions: { query: os === "darwin", openSettings: os === "darwin" },
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
    case "list_apps":
      return listApps();
    case "app_icon":
      assertString(action.path, "path");
      return appIcon(action.path);
    case "get_diagnostics":
      return getDiagnostics(action.limit);
    case "open_diagnostics":
      await openDiagnostics();
      return { opened: diagnosticsDir };
    case "get_permissions":
      return getPermissionStatus();
    case "open_permission_settings":
      assertString(action.permission, "permission");
      return openPermissionSettings(action.permission);
    case "log_event":
      assertString(action.area, "area");
      assertString(action.message, "message");
      await logDiagnostic("web.event", { area: action.area.slice(0, 80), message: action.message.slice(0, 500) });
      return { logged: true };
    case "screenshot":
      return takeScreenshot(Boolean(action.includeImage));
    case "observe_screen":
      assertDeviceControl();
      return observeScreen(Boolean(action.includeImage));
    case "inspect_ui":
      assertDeviceControl();
      return inspectUi(action.maxElements);
    case "calendar_events":
      return calendarEvents(action.start, action.end, action.limit);
    case "create_calendar_event":
      assertDeviceControl();
      return createCalendarEvent(action);
    case "reminder_items":
      return reminderItems(action.start, action.end, action.limit);
    case "create_reminder":
      assertDeviceControl();
      return createReminder(action);
    case "local_model_status":
      return localModelStatus();
    case "local_model_generate":
      assertString(action.prompt, "prompt");
      return localModelGenerate(action);
    case "search_contacts":
      assertString(action.query, "query");
      return searchContacts(action.query, action.limit);
    case "send_message":
      assertDeviceControl();
      assertString(action.to, "to");
      assertString(action.body, "body");
      return sendMessage(action);
    case "send_email":
      assertDeviceControl();
      assertString(action.to, "to");
      assertString(action.subject, "subject");
      assertString(action.body, "body");
      return sendEmail(action);
    case "search_files":
      assertString(action.query, "query");
      return searchFiles(action.query, action.root, action.limit);
    case "get_frontmost_app":
      assertDeviceControl();
      return getFrontmostApp();
    case "get_display_bounds":
      assertDeviceControl();
      return getDisplayBounds();
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
    case "pointer_click_ratio":
      assertDeviceControl();
      assertNumber(action.x, "x");
      assertNumber(action.y, "y");
      return pointerClickRatio(action.x, action.y, action.button ?? "left", action.clicks ?? 1);
    case "scroll":
      assertDeviceControl();
      return scrollBy(Number(action.deltaX ?? 0), Number(action.deltaY ?? 0));
    case "wait":
      return waitFor(action.ms ?? 500);
    case "list_dir":
      assertString(action.path, "path");
      return listDirectory(action.path);
    case "read_file":
      assertString(action.path, "path");
      return readAllowedFile(action.path);
    case "write_file":
      assertString(action.path, "path");
      assertString(action.content, "content");
      return writeAllowedFile(action.path, action.content, Boolean(action.overwrite));
    case "append_file":
      assertString(action.path, "path");
      assertString(action.content, "content");
      return appendAllowedFile(action.path, action.content);
    case "make_dir":
      assertString(action.path, "path");
      return makeAllowedDirectory(action.path);
    case "move_file":
      assertString(action.from, "from");
      assertString(action.to, "to");
      return moveAllowedFile(action.from, action.to, Boolean(action.overwrite));
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
  if (!["http:", "https:", "mailto:", "tel:", "sms:", "facetime:"].includes(parsed.protocol)) {
    throw new Error("Only http, https, mailto, tel, sms, and FaceTime URLs are allowed.");
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

async function listApps() {
  if (os === "darwin") {
    const roots = [
      "/Applications",
      "/System/Applications",
      "/System/Applications/Utilities",
      resolve(homedir(), "Applications")
    ];
    const rows = [];
    for (const root of roots) {
      const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.name.toLowerCase().endsWith(".app")) continue;
        rows.push({
          label: entry.name.replace(/\.app$/i, ""),
          app: entry.name.replace(/\.app$/i, ""),
          path: resolve(root, entry.name)
        });
      }
    }
    return { apps: uniqueApps(rows) };
  }

  if (os === "win32") {
    const output = await runPowerShell(`
$roots = @(
  "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
  "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs"
)
$rows = foreach ($root in $roots) {
  if (Test-Path $root) {
    Get-ChildItem -Path $root -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      [PSCustomObject]@{ label = $_.BaseName; app = $_.FullName }
    }
  }
}
$rows | ConvertTo-Json -Compress
`);
    const parsed = output.stdout.trim() ? JSON.parse(output.stdout.trim()) : [];
    return { apps: uniqueApps(Array.isArray(parsed) ? parsed : [parsed]) };
  }

  const roots = ["/usr/share/applications", resolve(homedir(), ".local/share/applications")];
  const rows = [];
  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.name.endsWith(".desktop")) continue;
      const body = await readFile(resolve(root, entry.name), "utf8").catch(() => "");
      const label = body.match(/^Name=(.+)$/m)?.[1]?.trim();
      if (label) rows.push({ label, app: entry.name.replace(/\.desktop$/, "") });
    }
  }
  return { apps: uniqueApps(rows) };
}

function uniqueApps(rows) {
  const found = new Map();
  for (const row of rows) {
    const label = String(row?.label ?? "").trim();
    const app = String(row?.app ?? label).trim();
    if (!label || !app) continue;
    const key = label.toLowerCase();
    if (!found.has(key)) found.set(key, { label, app, ...(row.path ? { path: String(row.path) } : {}) });
  }
  return [...found.values()].sort((a, b) => a.label.localeCompare(b.label)).slice(0, 500);
}

async function appIcon(appPath) {
  if (os !== "darwin") return { dataUrl: "" };
  const resolvedPath = resolve(appPath);
  const appRoots = ["/Applications", "/System/Applications", resolve(homedir(), "Applications")];
  if (!resolvedPath.toLowerCase().endsWith(".app") || !appRoots.some((root) => isInside(root, resolvedPath))) {
    throw new Error("Application icon path is outside an application folder.");
  }

  const resources = resolve(resolvedPath, "Contents/Resources");
  const plist = resolve(resolvedPath, "Contents/Info.plist");
  const printed = await execPlatform("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIconFile", plist]).catch(() => ({ stdout: "" }));
  const declared = String(printed.stdout ?? "").trim();
  const candidates = [declared, declared && !declared.toLowerCase().endsWith(".icns") ? `${declared}.icns` : ""]
    .filter(Boolean)
    .map((name) => resolve(resources, name));
  const resourceEntries = await readdir(resources, { withFileTypes: true }).catch(() => []);
  candidates.push(...resourceEntries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".icns")).map((entry) => resolve(resources, entry.name)));
  const iconPath = await firstExisting(candidates);
  if (!iconPath) return { dataUrl: "" };

  const pngPath = resolve(tmpdir(), `slyos-app-icon-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  try {
    await execPlatform("/usr/bin/sips", ["-s", "format", "png", "-Z", "128", iconPath, "--out", pngPath]);
    const bytes = await readFile(pngPath);
    return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
  } finally {
    await unlink(pngPath).catch(() => undefined);
  }
}

async function firstExisting(paths) {
  for (const path of paths) {
    const info = await stat(path).catch(() => null);
    if (info?.isFile()) return path;
  }
  return "";
}

function isInside(root, target) {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${sep}`);
}

async function getDiagnostics(limitValue) {
  const limit = Math.max(20, Math.min(500, Number(limitValue) || 160));
  const body = await readFile(diagnosticsLogPath, "utf8").catch(() => "");
  return { path: diagnosticsLogPath, lines: body.split(/\r?\n/).filter(Boolean).slice(-limit) };
}

async function openDiagnostics() {
  await mkdir(diagnosticsDir, { recursive: true });
  if (os === "darwin") return execPlatform("open", [diagnosticsDir]);
  if (os === "win32") return execPlatform("explorer.exe", [diagnosticsDir]);
  return execPlatform("xdg-open", [diagnosticsDir]);
}

async function getPermissionStatus() {
  if (os !== "darwin") return { checked: true, screenRecording: null, accessibility: null, automation: null };
  const sessionLocked = await isMacSessionLocked();
  if (sessionLocked) {
    return {
      checked: true,
      sessionLocked: true,
      screenRecording: null,
      accessibility: null,
      automation: null,
      errors: { session: "Unlock the Mac to test Screen Recording and Accessibility." }
    };
  }
  let screenRecording = false;
  let screenError = "";
  try {
    const screenshot = await takeScreenshot(false);
    screenRecording = true;
    if (typeof screenshot.path === "string") await unlink(screenshot.path).catch(() => undefined);
  } catch (error) {
    screenError = error instanceof Error ? error.message : String(error);
  }

  let accessibility = false;
  let accessibilityError = "";
  try {
    const output = await runAppleScript(['tell application "System Events" to get UI elements enabled']);
    accessibility = output.stdout.trim().toLowerCase() === "true";
  } catch (error) {
    accessibilityError = error instanceof Error ? error.message : String(error);
  }

  let automation = false;
  let automationError = "";
  try {
    await getFrontmostApp();
    automation = true;
  } catch (error) {
    automationError = error instanceof Error ? error.message : String(error);
  }

  return {
    checked: true,
    sessionLocked: false,
    screenRecording,
    accessibility,
    automation,
    errors: {
      ...(screenError ? { screenRecording: screenError } : {}),
      ...(accessibilityError ? { accessibility: accessibilityError } : {}),
      ...(automationError ? { automation: automationError } : {})
    }
  };
}

async function isMacSessionLocked() {
  try {
    const output = await execPlatform("/usr/sbin/ioreg", ["-n", "Root", "-d1"], { timeout: 2000 });
    return /"CGSSessionScreenIsLocked"=Yes/.test(output.stdout);
  } catch {
    return false;
  }
}

async function openPermissionSettings(permission) {
  if (os !== "darwin") throw new Error("Permission settings are only implemented for macOS.");
  const panes = {
    screen: "Privacy_ScreenCapture",
    accessibility: "Privacy_Accessibility",
    automation: "Privacy_Automation",
    microphone: "Privacy_Microphone",
    camera: "Privacy_Camera"
  };
  const pane = panes[permission];
  if (!pane) throw new Error("Unknown macOS permission pane.");
  await execPlatform("open", [`x-apple.systempreferences:com.apple.preference.security?${pane}`]);
  return { opened: permission };
}

async function logDiagnostic(event, details = {}) {
  try {
    await mkdir(diagnosticsDir, { recursive: true });
    await appendFile(diagnosticsLogPath, `${JSON.stringify({ at: new Date().toISOString(), event, ...details })}\n`, "utf8");
  } catch {
    // Diagnostics must never prevent the device bridge from operating.
  }
}

function summarizeAction(action) {
  const type = String(action?.type ?? "unknown");
  const summary = { type };
  if (typeof action?.app === "string") summary.app = action.app.slice(0, 120);
  if (typeof action?.url === "string") {
    try { summary.urlHost = new URL(action.url).host; } catch { summary.urlHost = "invalid"; }
  }
  if (typeof action?.path === "string") summary.path = action.path.slice(-180);
  if (typeof action?.text === "string") summary.textLength = action.text.length;
  if (typeof action?.command === "string") summary.command = action.command.slice(0, 80);
  if (Array.isArray(action?.keys)) summary.keys = action.keys.map(String).slice(0, 6);
  if (typeof action?.x === "number") summary.x = action.x;
  if (typeof action?.y === "number") summary.y = action.y;
  return summary;
}

function summarizeResult(result) {
  if (!result || typeof result !== "object") return String(result ?? "").slice(0, 200);
  if (typeof result.opened === "string") return `opened ${result.opened.slice(0, 120)}`;
  if (typeof result.path === "string") return `path ${result.path.slice(-160)}`;
  if (Array.isArray(result.apps)) return `${result.apps.length} apps`;
  if (typeof result.frontmostApp === "string") return `frontmost ${result.frontmostApp}`;
  return Object.keys(result).slice(0, 12).join(",");
}

async function takeScreenshot(includeImage = false) {
  const path = resolve(tmpdir(), `slyos-screenshot-${Date.now()}.png`);
  if (os === "darwin") {
    await execPlatform("screencapture", ["-x", path], { timeout: 4000 });
    return includeImage ? screenshotWithData(path) : { path };
  }
  if (os === "linux") {
    await execPlatform("gnome-screenshot", ["-f", path], { timeout: 5000 }).catch(() => execPlatform("spectacle", ["-b", "-o", path], { timeout: 5000 }));
    return includeImage ? screenshotWithData(path) : { path };
  }
  throw new Error("Screenshot is not implemented for this OS yet.");
}

async function screenshotWithData(path) {
  const data = await readFile(path);
  if (data.byteLength > 12 * 1024 * 1024) throw new Error("Screenshot is too large to return to the local brain.");
  return { path, dataUrl: `data:image/png;base64,${data.toString("base64")}` };
}

async function observeScreen(includeImage = false) {
  const result = {
    observedAt: new Date().toISOString(),
    capabilities: automationCapabilities()
  };

  if (supportsScreenshot()) {
    result.screenshot = await takeScreenshot(includeImage).catch((error) => ({ error: error.message }));
  }

  if (supportsFrontmostApp()) {
    result.frontmostApp = await getFrontmostApp().catch((error) => ({ error: error.message }));
  }

  result.displayBounds = await getDisplayBounds().catch((error) => ({ error: error.message }));

  return result;
}

async function inspectUi(maxElementsValue) {
  if (os !== "darwin") throw new Error("Accessibility-tree inspection is currently available on macOS only.");
  const maxElements = Math.min(240, Math.max(20, Number(maxElementsValue) || 140));
  const script = String.raw`
const se = Application("System Events");
const safe = (read, fallback = null) => { try { const value = read(); return value === undefined ? fallback : value; } catch (_) { return fallback; } };
const clean = (value) => String(value == null ? "" : value).replace(/[\t\r\n]+/g, " ").trim().slice(0, 240);
const processes = se.applicationProcesses.whose({ frontmost: true })();
if (!processes.length) JSON.stringify({ app: "", window: "", elements: [] });
else {
  const process = processes[0];
  const windows = safe(() => process.windows(), []);
  let root = null;
  let rootArea = -1;
  for (const candidate of windows) {
    const size = safe(() => candidate.size(), null);
    const width = Array.isArray(size) ? Number(size[0]) : 0;
    const height = Array.isArray(size) ? Number(size[1]) : 0;
    const area = Math.max(0, width) * Math.max(0, height);
    if (area > rootArea) {
      root = candidate;
      rootArea = area;
    }
  }
  if (!root) root = process;
  const elements = [];
  const seen = {};
  function walk(element, depth) {
    if (elements.length >= ${maxElements} || depth > 9) return;
    const role = clean(safe(() => element.role(), ""));
    const subrole = clean(safe(() => element.subrole(), ""));
    const name = clean(safe(() => element.name(), ""));
    const description = clean(safe(() => element.description(), ""));
    const value = clean(safe(() => element.value(), ""));
    const position = safe(() => element.position(), null);
    const size = safe(() => element.size(), null);
    const enabled = safe(() => element.enabled(), null);
    const focused = safe(() => element.focused(), null);
    const key = [role, subrole, name, description, value, position, size].join("|");
    const usefulRole = /Button|TextField|TextArea|Link|MenuItem|CheckBox|RadioButton|PopUpButton|Tab|Slider|StaticText|OutlineRow|Cell|Row|Toolbar|Group|Window/.test(role);
    if (!seen[key] && (usefulRole || name || description || value)) {
      seen[key] = true;
      elements.push({
        index: elements.length,
        depth,
        role,
        subrole,
        name,
        description,
        value: value.slice(0, 160),
        position: Array.isArray(position) ? position.map(Number) : null,
        size: Array.isArray(size) ? size.map(Number) : null,
        enabled,
        focused
      });
    }
    const children = safe(() => element.uiElements(), []);
    for (let index = 0; index < children.length && elements.length < ${maxElements}; index += 1) walk(children[index], depth + 1);
  }
  walk(root, 0);
  JSON.stringify({
    app: clean(safe(() => process.name(), "")),
    window: clean(safe(() => root.name(), "")),
    windowArea: rootArea,
    windowCount: windows.length,
    elements
  });
}`;
  const { stdout } = await execPlatform("osascript", ["-l", "JavaScript", "-e", script], { timeout: 9000 });
  const output = stdout.trim();
  if (!output) throw new Error("macOS returned an empty accessibility snapshot. Grant Accessibility permission to SlyOS.");
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Could not parse the macOS accessibility snapshot: ${output.slice(0, 240)}`);
  }
}

async function calendarEvents(startValue, endValue, limitValue) {
  if (os !== "darwin") throw new Error("Native calendar lookup is currently available on macOS only.");
  const start = new Date(typeof startValue === "string" ? startValue : Date.now());
  const end = new Date(typeof endValue === "string" ? endValue : start.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error("calendar_events requires a valid start and end time.");
  }
  const limit = Math.min(100, Math.max(1, Number(limitValue) || 30));
  const script = String.raw`
const calendar = Application("Calendar");
const safe = (read, fallback = null) => { try { const value = read(); return value === undefined ? fallback : value; } catch (_) { return fallback; } };
const start = new Date(${JSON.stringify(start.toISOString())});
const end = new Date(${JSON.stringify(end.toISOString())});
const rows = [];
for (const source of safe(() => calendar.calendars(), [])) {
  const events = safe(() => source.events.whose({ _and: [
    { startDate: { _greaterThanEquals: start } },
    { startDate: { _lessThan: end } }
  ] })(), []);
  for (const event of events) {
    if (rows.length >= ${limit}) break;
    const eventStart = safe(() => event.startDate(), null);
    const eventEnd = safe(() => event.endDate(), null);
    rows.push({
      title: String(safe(() => event.summary(), "Untitled event")),
      start: eventStart && eventStart.toISOString ? eventStart.toISOString() : "",
      end: eventEnd && eventEnd.toISOString ? eventEnd.toISOString() : "",
      allDay: Boolean(safe(() => event.alldayEvent(), false)),
      location: String(safe(() => event.location(), "")),
      calendar: String(safe(() => source.name(), ""))
    });
  }
  if (rows.length >= ${limit}) break;
}

rows.sort((a, b) => String(a.start).localeCompare(String(b.start)));
JSON.stringify({ start: start.toISOString(), end: end.toISOString(), events: rows.slice(0, ${limit}) });`;
  const { stdout } = await execPlatform("osascript", ["-l", "JavaScript", "-e", script], { timeout: 15000 });
  return parseNativeJson(stdout, "Calendar did not return data. Unlock the Mac and allow Calendar access for SlyOS.");
}

async function createCalendarEvent(action) {
  if (os !== "darwin") throw new Error("Native calendar writes are currently available on macOS only.");
  const title = String(action.title || "").trim().slice(0, 160);
  const start = new Date(action.start);
  const end = new Date(action.end);
  if (!title || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error("create_calendar_event requires a title and valid start/end times.");
  }
  const messagePrefix = `Added ${title} to `;
  const script = String.raw`
const calendar = Application("Calendar");
const calendars = calendar.calendars();
if (!calendars.length) throw new Error("No writable calendar is available.");
const target = calendars[0];
const event = calendar.Event({
  summary: ${JSON.stringify(title)},
  startDate: new Date(${JSON.stringify(start.toISOString())}),
  endDate: new Date(${JSON.stringify(end.toISOString())}),
  location: ${JSON.stringify(String(action.location || "").slice(0, 300))},
  description: ${JSON.stringify(String(action.notes || "").slice(0, 2000))}
});
target.events.push(event);
JSON.stringify({ message: ${JSON.stringify(messagePrefix)} + String(target.name()) + ".", calendar: String(target.name()) });`;
  const { stdout } = await execPlatform("osascript", ["-l", "JavaScript", "-e", script], { timeout: 15000 });
  return parseNativeJson(stdout, "Calendar did not confirm the new event. Unlock the Mac and allow Calendar automation for SlyOS.");
}

async function reminderItems(startValue, endValue, limitValue) {
  if (os !== "darwin") throw new Error("Native reminder lookup is currently available on macOS only.");
  const start = typeof startValue === "string" ? new Date(startValue) : null;
  const end = typeof endValue === "string" ? new Date(endValue) : null;
  const startIso = start && Number.isFinite(start.getTime()) ? start.toISOString() : "";
  const endIso = end && Number.isFinite(end.getTime()) ? end.toISOString() : "";
  const limit = Math.min(100, Math.max(1, Number(limitValue) || 40));
  const script = String.raw`
const reminders = Application("Reminders");
const safe = (read, fallback = null) => { try { const value = read(); return value === undefined ? fallback : value; } catch (_) { return fallback; } };
const start = ${startIso ? `new Date(${JSON.stringify(startIso)})` : "null"};
const end = ${endIso ? `new Date(${JSON.stringify(endIso)})` : "null"};
const rows = [];
for (const list of safe(() => reminders.lists(), [])) {
  for (const reminder of safe(() => list.reminders(), [])) {
    if (rows.length >= ${limit}) break;
    if (Boolean(safe(() => reminder.completed(), false))) continue;
    const due = safe(() => reminder.dueDate(), null);
    if (start && due && due < start) continue;
    if (end && due && due >= end) continue;
    rows.push({
      title: String(safe(() => reminder.name(), "Untitled reminder")),
      notes: String(safe(() => reminder.body(), "")),
      due: due && due.toISOString ? due.toISOString() : "",
      calendar: String(safe(() => list.name(), "")),
      priority: Number(safe(() => reminder.priority(), 0))
    });
  }
  if (rows.length >= ${limit}) break;
}
rows.sort((a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")));
JSON.stringify({ reminders: rows.slice(0, ${limit}) });`;
  const { stdout } = await execPlatform("osascript", ["-l", "JavaScript", "-e", script], { timeout: 15000 });
  return parseNativeJson(stdout, "Reminders did not return data. Unlock the Mac and allow Reminders automation for SlyOS.");
}

async function createReminder(action) {
  if (os !== "darwin") throw new Error("Native reminder writes are currently available on macOS only.");
  const title = String(action.title || "").trim().slice(0, 240);
  if (!title) throw new Error("create_reminder requires a title.");
  const due = typeof action.due === "string" ? new Date(action.due) : null;
  const dueIso = due && Number.isFinite(due.getTime()) ? due.toISOString() : "";
  const script = String.raw`
const reminders = Application("Reminders");
const lists = reminders.lists();
if (!lists.length) throw new Error("No writable reminders list is available.");
const target = lists[0];
const properties = {
  name: ${JSON.stringify(title)},
  body: ${JSON.stringify(String(action.notes || "").slice(0, 2000))}
};
${dueIso ? `properties.dueDate = new Date(${JSON.stringify(dueIso)});` : ""}
const reminder = reminders.Reminder(properties);
target.reminders.push(reminder);
JSON.stringify({ message: ${JSON.stringify(`Added ${title} to `)} + String(target.name()) + ".", calendar: String(target.name()) });`;
  const { stdout } = await execPlatform("osascript", ["-l", "JavaScript", "-e", script], { timeout: 15000 });
  return parseNativeJson(stdout, "Reminders did not confirm the new item. Unlock the Mac and allow Reminders automation for SlyOS.");
}

async function localModelStatus() {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(1800)
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    const payload = await response.json();
    const models = Array.isArray(payload.models)
      ? payload.models.map((model) => ({
          id: String(model.name || model.model || "").trim(),
          name: String(model.name || model.model || "Local model").trim(),
          bytes: Number(model.size || 0),
          modifiedAt: String(model.modified_at || "")
        })).filter((model) => model.id && !/(?:^|[-_:])(embed|embedding)(?:[-_:]|$)/i.test(model.id))
      : [];
    return { available: models.length > 0, runtime: "Ollama", models };
  } catch (error) {
    return {
      available: false,
      runtime: "Ollama",
      models: [],
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function localModelGenerate(action) {
  const model = String(action.model || "").trim().slice(0, 160);
  const prompt = String(action.prompt || "").trim().slice(0, 120_000);
  if (!model || !prompt) throw new Error("local_model_generate requires an installed model and prompt.");
  const response = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { num_predict: Math.min(4096, Math.max(64, Number(action.maxOutputTokens) || 900)) }
    }),
    signal: AbortSignal.timeout(Math.min(300_000, Math.max(10_000, Number(action.timeoutMs) || 120_000)))
  });
  if (!response.ok) throw new Error(`Ollama generation failed with HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json();
  const content = String(payload.response || "").trim();
  if (!content) throw new Error("The local Ollama model returned an empty response.");
  return { content, model, runtime: "Ollama", done: payload.done === true };
}

async function searchContacts(queryValue, limitValue) {
  if (os !== "darwin") throw new Error("Native contact lookup is currently available on macOS only.");
  const query = String(queryValue).trim().slice(0, 120);
  if (!query) throw new Error("Contact query cannot be empty.");
  const limit = Math.min(30, Math.max(1, Number(limitValue) || 12));
  const script = String.raw`
const contacts = Application("Contacts");
const safe = (read, fallback = null) => { try { const value = read(); return value === undefined ? fallback : value; } catch (_) { return fallback; } };
const query = ${JSON.stringify(query.toLowerCase())};
const rows = [];
for (const person of safe(() => contacts.people(), [])) {
  if (rows.length >= ${limit}) break;
  const name = String(safe(() => person.name(), ""));
  const organization = String(safe(() => person.organization(), ""));
  if (!name.toLowerCase().includes(query) && !organization.toLowerCase().includes(query)) continue;
  const phones = safe(() => person.phones(), []).map((entry) => String(safe(() => entry.value(), ""))).filter(Boolean).slice(0, 4);
  const emails = safe(() => person.emails(), []).map((entry) => String(safe(() => entry.value(), ""))).filter(Boolean).slice(0, 4);
  rows.push({ name, organization, phones, emails });
}
JSON.stringify({ query, contacts: rows });`;
  const { stdout } = await execPlatform("osascript", ["-l", "JavaScript", "-e", script], { timeout: 15000 });
  return parseNativeJson(stdout, "Contacts did not return data. Unlock the Mac and allow Contacts access for SlyOS.");
}

async function sendMessage(action) {
  if (os !== "darwin") throw new Error("Native Messages sending is currently available on macOS only.");
  const to = String(action.to).trim().slice(0, 240);
  const body = String(action.body).trim().slice(0, 20_000);
  if (!to || !body) throw new Error("send_message requires a recipient and message body.");
const script = String.raw`
const messages = Application("Messages");
const safe = (read, fallback = null) => { try { const value = read(); return value === undefined ? fallback : value; } catch (_) { return fallback; } };
const normalized = value => String(value || "").toLowerCase().replace(/[^a-z0-9@+]/g, "");
const target = normalized(${JSON.stringify(to)});
const services = safe(() => messages.services(), []).filter(service => {
  const type = String(safe(() => service.serviceType(), ""));
  return /iMessage|SMS/i.test(type);
});
if (!services.length) throw new Error("No Messages service is signed in on this Mac.");
let recipient = null;
for (const service of services) {
  const participants = safe(() => service.participants(), safe(() => service.buddies(), []));
  const exact = participants.find(participant => [
    safe(() => participant.name(), ""),
    safe(() => participant.fullName(), ""),
    safe(() => participant.handle(), ""),
    safe(() => participant.id(), "")
  ].some(value => normalized(value) === target));
  if (exact) { recipient = exact; break; }
}
if (!recipient && target.length >= 4) {
  const partials = [];
  for (const service of services) {
    const participants = safe(() => service.participants(), safe(() => service.buddies(), []));
    for (const participant of participants) {
      const values = [safe(() => participant.name(), ""), safe(() => participant.fullName(), "")];
      if (values.some(value => normalized(value).includes(target))) partials.push(participant);
    }
  }
  if (partials.length === 1) recipient = partials[0];
}
if (!recipient) throw new Error(${JSON.stringify(`Messages could not resolve ${to}.`)});
messages.send(${JSON.stringify(body)}, { to: recipient });
JSON.stringify({ message: ${JSON.stringify(`Sent a message to ${to}.`)}, recipient: ${JSON.stringify(to)} });`;
  const { stdout } = await execPlatform("osascript", ["-l", "JavaScript", "-e", script], { timeout: 20000 });
  return parseNativeJson(stdout, "Messages did not confirm the send. Check that iMessage is signed in and allow Automation for SlyOS.");
}

async function sendEmail(action) {
  if (os !== "darwin") throw new Error("Native Mail sending is currently available on macOS only.");
  const to = String(action.to).trim().slice(0, 320);
  const subject = String(action.subject).trim().slice(0, 320);
  const body = String(action.body).trim().slice(0, 100_000);
  if (!to || !subject || !body) throw new Error("send_email requires a recipient, subject, and body.");
  const script = String.raw`
const mail = Application("Mail");
const message = mail.OutgoingMessage({
  subject: ${JSON.stringify(subject)},
  content: ${JSON.stringify(`${body}\n`)},
  visible: false
});
mail.outgoingMessages.push(message);
message.toRecipients.push(mail.ToRecipient({ address: ${JSON.stringify(to)} }));
message.send();
JSON.stringify({ message: ${JSON.stringify(`Sent email to ${to}.`)}, recipient: ${JSON.stringify(to)}, subject: ${JSON.stringify(subject)} });`;
  const { stdout } = await execPlatform("osascript", ["-l", "JavaScript", "-e", script], { timeout: 20000 });
  return parseNativeJson(stdout, "Mail did not confirm the send. Check that Mail has an account and allow Automation for SlyOS.");
}

async function searchFiles(queryValue, rootValue, limitValue) {
  const query = String(queryValue).trim().slice(0, 240);
  if (!query) throw new Error("File query cannot be empty.");
  const limit = Math.min(100, Math.max(1, Number(limitValue) || 30));
  const roots = typeof rootValue === "string" && rootValue.trim()
    ? [requireAllowedPath(rootValue)]
    : allowedRoots;
  const rows = [];
  for (const root of roots) {
    let matches = [];
    if (os === "darwin" && commandExists("mdfind")) {
      const expression = `kMDItemFSName == '*${query.replace(/[\\'\"]/g, " ")}*'cd`;
      const { stdout } = await execPlatform("mdfind", ["-onlyin", root, expression], { timeout: 12000 });
      matches = stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    } else if (os === "linux" && commandExists("find")) {
      const { stdout } = await execPlatform("find", [root, "-iname", `*${query}*`, "-print"], { timeout: 12000 });
      matches = stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    } else {
      throw new Error("Indexed file search is not available on this device.");
    }
    for (const path of matches) {
      if (rows.length >= limit) break;
      const details = await stat(path).catch(() => null);
      rows.push({ path, name: path.split(sep).pop() || path, directory: Boolean(details?.isDirectory()), modifiedAt: details?.mtime?.toISOString?.() || "" });
    }
    if (rows.length >= limit) break;
  }
  return { query, roots, files: rows.slice(0, limit) };
}

function parseNativeJson(stdout, emptyMessage) {
  const output = String(stdout || "").trim();
  if (!output) throw new Error(emptyMessage);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Could not parse native data: ${output.slice(0, 240)}`);
  }
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

async function pointerClickRatio(x, y, button = "left", clicks = 1) {
  const ratioX = Math.max(0, Math.min(1, Number(x)));
  const ratioY = Math.max(0, Math.min(1, Number(y)));
  const bounds = await getDisplayBounds();
  return pointerClick(
    bounds.x + bounds.width * ratioX,
    bounds.y + bounds.height * ratioY,
    button,
    clicks
  );
}

async function getDisplayBounds() {
  if (os === "darwin") {
    const output = await execPlatform("osascript", [
      "-l",
      "JavaScript",
      "-e",
      'ObjC.import("AppKit"); const f=$.NSScreen.mainScreen.frame; JSON.stringify({x:Number(f.origin.x),y:Number(f.origin.y),width:Number(f.size.width),height:Number(f.size.height)})'
    ]);
    const bounds = JSON.parse(output.stdout.trim());
    return {
      x: Number(bounds.x) || 0,
      y: Number(bounds.y) || 0,
      width: Math.max(1, Number(bounds.width) || 1440),
      height: Math.max(1, Number(bounds.height) || 900)
    };
  }

  if (os === "win32") {
    const output = await runPowerShell(
      'Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Output "$($b.X),$($b.Y),$($b.Width),$($b.Height)"'
    );
    const values = output.stdout.trim().split(",").map(Number);
    return {
      x: values[0] ?? 0,
      y: values[1] ?? 0,
      width: Math.max(1, values[2] ?? 1920),
      height: Math.max(1, values[3] ?? 1080)
    };
  }

  throw new Error("Display bounds are currently available on macOS and Windows.");
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

async function readAllowedFile(inputPath) {
  const targetPath = requireAllowedPath(inputPath);
  const metadata = await stat(targetPath);
  if (!metadata.isFile()) throw new Error("Path is not a file.");
  if (metadata.size > 2 * 1024 * 1024) throw new Error("File is larger than the 2 MB agent read limit.");
  const content = await readFile(targetPath, "utf8");
  return { path: targetPath, bytes: metadata.size, content };
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

async function appendAllowedFile(inputPath, content) {
  const targetPath = requireAllowedPath(inputPath);
  await mkdir(dirname(targetPath), { recursive: true });
  await appendFile(targetPath, content, "utf8");
  return { path: targetPath, bytesAppended: Buffer.byteLength(content, "utf8") };
}

async function makeAllowedDirectory(inputPath) {
  const targetPath = requireAllowedPath(inputPath);
  await mkdir(targetPath, { recursive: true });
  return { path: targetPath, created: true };
}

async function moveAllowedFile(fromInput, toInput, overwrite) {
  const fromPath = requireAllowedPath(fromInput);
  const toPath = requireAllowedPath(toInput);
  await mkdir(dirname(toPath), { recursive: true });
  if (!overwrite) {
    try {
      await stat(toPath);
      throw new Error("Destination already exists. Pass overwrite: true to replace it.");
    } catch (error) {
      if (error && error.code !== "ENOENT") throw error;
    }
  } else {
    await unlink(toPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  await rename(fromPath, toPath);
  return { from: fromPath, path: toPath, moved: true };
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
    hotkey: os === "darwin" || os === "win32" || hasXdotool,
    pointerMove: os === "win32" || hasCliclick || hasXdotool,
    pointerClick: os === "darwin" || os === "win32" || hasXdotool,
    pointerClickRatio: os === "darwin" || os === "win32",
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
