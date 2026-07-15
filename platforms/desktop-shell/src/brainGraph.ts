import type { MemoryItem } from "@badscientist/agent-core";

export type BrainNodeType =
  | "hub"
  | "project"
  | "person"
  | "summary"
  | "idea"
  | "task"
  | "paper"
  | "recall"
  | "network"
  | "prompt"
  | "response"
  | "transcript"
  | "message"
  | "vault";

export interface BrainNode {
  id: number;
  key: string;
  type: BrainNodeType;
  label: string;
  content: string;
  source: string;
  strength: number;
  recency: number;
  x: number;
  y: number;
}

export interface BrainEdge {
  a: number;
  b: number;
}

export interface BrainGraph {
  nodes: BrainNode[];
  edges: BrainEdge[];
}

export interface BrainCanvasOptions {
  mode: "memory" | "voice";
  selectedKey?: string | null;
  filterType?: BrainNodeType | null;
  highlightKeys?: string[];
  query?: string;
  onSelect?: (key: string | null) => void;
}

const TYPE_COLORS: Record<BrainNodeType, string> = {
  hub: "#2e2a24",
  project: "#46403a",
  person: "#9a8b77",
  summary: "#b09356",
  idea: "#c39a5e",
  task: "#bc6242",
  paper: "#8c8475",
  recall: "#6e8fa6",
  network: "#2e6f9e",
  prompt: "#8c8475",
  response: "#b3ab9c",
  transcript: "#86907a",
  message: "#b3ab9c",
  vault: "#b23a2e"
};

const PLATFORM_COLORS: Array<[RegExp, string]> = [
  [/whatsapp/i, "#1fa855"],
  [/instagram/i, "#c13584"],
  [/linkedin/i, "#2e6f9e"],
  [/telegram/i, "#2aabee"],
  [/(messenger|orca)/i, "#7b3ff2"],
  [/signal/i, "#3a76f0"]
];

export function typeColor(type: string): string {
  return TYPE_COLORS[(type as BrainNodeType) in TYPE_COLORS ? (type as BrainNodeType) : "idea"];
}

export function buildBrainGraph(items: MemoryItem[]): BrainGraph {
  const nodes: BrainNode[] = [
    {
      id: 0,
      key: "hub",
      type: "hub",
      label: "SlyOS",
      content: "Your second brain.",
      source: "Core",
      strength: 1,
      recency: 1,
      x: 0,
      y: 0
    }
  ];
  const edges: BrainEdge[] = [];

  const ordered = [...items].sort((a, b) => itemTime(a) - itemTime(b));
  const consumed = new Set<string>();
  const append = (input: Omit<BrainNode, "id" | "x" | "y">, parent = 0): number => {
    const id = nodes.length;
    nodes.push({ ...input, id, x: 0, y: 0 });
    edges.push({ a: parent, b: id });
    return id;
  };

  // Android renders one node per conversation, not one dot per imported message.
  const people = new Map<string, MemoryItem>();
  for (const item of ordered) {
    if (!isPersonMemory(item) || item.tags.includes("profile")) continue;
    const key = item.title.trim().toLowerCase();
    if (!key) continue;
    const current = people.get(key);
    if (!current || messageCount(item) > messageCount(current) || itemTime(item) > itemTime(current)) people.set(key, item);
  }
  [...people.values()]
    .sort((a, b) => messageCount(b) - messageCount(a) || itemTime(b) - itemTime(a))
    .slice(0, 300)
    .forEach((item) => {
      consumed.add(item.id);
      const count = messageCount(item);
      append({
        key: item.id,
        type: "person",
        label: trimLabel(item.title, 42),
        content: count ? `${count} message${count === 1 ? "" : "s"}` : item.body,
        source: item.source || "Chats",
        strength: Math.min(0.95, 0.5 + 0.02 * Math.max(1, count)),
        recency: 0.9
      });
    });
  ordered.filter((item) => isPersonMemory(item)).forEach((item) => consumed.add(item.id));

  const facts = ordered.filter((item) => item.kind === "fact" && !consumed.has(item.id));
  facts.forEach((item) => {
    consumed.add(item.id);
    append({
      key: item.id,
      type: "idea",
      label: trimLabel(item.title || item.body, 34),
      content: item.body,
      source: item.source || (item.tags.includes("learned") ? "Learned" : "About you"),
      strength: item.tags.includes("learned") ? 0.55 : 0.6,
      recency: item.tags.includes("learned") ? 0.7 : 0.5
    });
  });

  // A profile without separate fact rows still becomes calm fact nodes, as it does on Android.
  if (!facts.length) {
    ordered.filter((item) => item.tags.includes("profile")).flatMap((item) => item.body.split(/\r?\n/).map((line) => ({ item, line: line.trim() })))
      .filter(({ line }) => line.length > 0)
      .forEach(({ item, line }, index) => {
        consumed.add(item.id);
        append({ key: `${item.id}:fact:${index}`, type: "idea", label: trimLabel(line, 34), content: line, source: "About you", strength: 0.6, recency: 0.5 });
      });
  }

  ordered.filter((item) => isTaskMemory(item)).forEach((item) => {
    consumed.add(item.id);
    append({ key: item.id, type: "task", label: trimLabel(item.title, 42), content: item.body, source: item.source || "Checklist", strength: 0.55, recency: 0.6 });
  });
  ordered.filter((item) => isPaperMemory(item)).forEach((item) => {
    consumed.add(item.id);
    append({ key: item.id, type: "paper", label: trimLabel(item.title, 42), content: item.body || "Research paper", source: item.source || "Research", strength: 0.7, recency: 0.6 });
  });

  const recallGroups = new Map<string, MemoryItem[]>();
  ordered.filter((item) => isRecallMemory(item)).forEach((item) => {
    consumed.add(item.id);
    const app = (item.source || item.title || "Screen").trim();
    recallGroups.set(app, [...(recallGroups.get(app) ?? []), item]);
  });
  [...recallGroups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 16).forEach(([app, group]) => {
    append({
      key: `recall:${app}`,
      type: "recall",
      label: trimLabel(app, 42),
      content: `${group.length} on-screen capture${group.length === 1 ? "" : "s"}`,
      source: "Total recall",
      strength: Math.min(0.9, 0.5 + 0.03 * group.length),
      recency: 0.8
    });
  });

  const network = ordered.filter((item) => isNetworkMemory(item));
  network.forEach((item) => consumed.add(item.id));
  if (network.length) {
    const latest = network.at(-1)!;
    append({ key: latest.id, type: "network", label: "LinkedIn network", content: latest.body, source: "Network", strength: 0.95, recency: 0.75 });
  }

  // Raw imported chat rows stay searchable but out of the graph. Android only adds MemoryLog moments.
  const logs = ordered.filter((item) => !consumed.has(item.id) && !isRawImportedMessage(item)).slice(-300);
  let lastPromptNode = 0;
  for (const item of logs) {
    const type = nodeTypeFor(item);
    const parent = type === "response" && lastPromptNode ? lastPromptNode : 0;
    const id = append({
      key: item.id,
      type,
      label: trimLabel(item.title || item.kind, 42),
      content: item.body,
      source: item.source || sourceFor(item),
      strength: 0.5,
      recency: 0.7
    }, parent);
    if (type === "prompt") lastPromptNode = id;
  }

  layout(nodes, edges);
  addSynapses(nodes, edges);
  return { nodes, edges };
}

function itemTime(item: MemoryItem): number {
  const value = Date.parse(item.updatedAt || item.createdAt);
  return Number.isFinite(value) ? value : 0;
}

function messageCount(item: MemoryItem): number {
  const match = item.body.match(/\b(\d[\d,]*)\s+messages?\b/i);
  return match ? Number(match[1]!.replace(/,/g, "")) || 0 : 0;
}

function isPersonMemory(item: MemoryItem): boolean {
  return item.kind === "profile" || item.tags.includes("person");
}

function isTaskMemory(item: MemoryItem): boolean {
  return item.tags.includes("task") || item.tags.includes("checklist");
}

function isPaperMemory(item: MemoryItem): boolean {
  return item.kind === "paper" || item.tags.includes("paper");
}

function isRecallMemory(item: MemoryItem): boolean {
  return item.kind === "screen" || item.tags.includes("recall") || item.tags.includes("screen");
}

function isNetworkMemory(item: MemoryItem): boolean {
  return item.tags.includes("network");
}

function isRawImportedMessage(item: MemoryItem): boolean {
  return item.id.startsWith("android:message:") || (item.tags.includes("android-import") && item.tags.includes("chat") && !item.id.startsWith("android:log:"));
}

export function findBrainNode(graph: BrainGraph, key: string | null | undefined): BrainNode | null {
  if (!key) return null;
  return graph.nodes.find((node) => node.key === key) ?? null;
}

export function wireBrainCanvas(canvas: HTMLCanvasElement, graph: BrainGraph, options: BrainCanvasOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let userYaw = 0;
  let tilt = options.mode === "voice" ? 0.42 : 0.35;
  let zoom = options.mode === "voice" ? 1.08 : 1;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = false;
  const startedAt = performance.now();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frameInterval = options.mode === "voice" ? 1000 / 30 : 1000 / 15;
  let lastFrameAt = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return dpr;
  };

  const draw = (now = performance.now()) => {
    if (!canvas.isConnected) return;
    const dpr = resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const elapsed = now - startedAt;
    const spinDuration = options.mode === "voice" ? 46000 : 90000;
    const yaw = userYaw + (elapsed / spinDuration) * Math.PI * 2;
    render(ctx, canvas, graph, {
      ...options,
      yaw,
      tilt,
      zoom,
      elapsed
    });
  };

  const animate = (now: number) => {
    if (!canvas.isConnected) return;
    if (now - lastFrameAt >= frameInterval) {
      lastFrameAt = now;
      draw(now);
    }
    window.requestAnimationFrame(animate);
  };

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    moved = moved || Math.abs(dx) + Math.abs(dy) > 4;
    userYaw += dx * 0.006;
    tilt = clamp(tilt - dy * 0.006, -1.25, 1.25);
    lastX = event.clientX;
    lastY = event.clientY;
    if (reducedMotion) draw();
  });

  canvas.addEventListener("pointerup", (event) => {
    dragging = false;
    if (!moved && options.onSelect) {
      const elapsed = performance.now() - startedAt;
      const spinDuration = options.mode === "voice" ? 46000 : 90000;
      const yaw = userYaw + (elapsed / spinDuration) * Math.PI * 2;
      const hit = hitTest(canvas, graph, event.clientX, event.clientY, yaw, tilt, zoom, options);
      options.onSelect(hit?.key ?? null);
    }
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom = clamp(zoom * (event.deltaY > 0 ? 0.92 : 1.08), 0.52, 3.2);
      if (reducedMotion) draw();
    },
    { passive: false }
  );

  draw();
  if (!reducedMotion) window.requestAnimationFrame(animate);
}

function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  graph: BrainGraph,
  options: BrainCanvasOptions & { yaw: number; tilt: number; zoom: number; elapsed: number }
): void {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const dark = options.mode === "voice";
  const memoryDark = options.mode === "memory" && document.documentElement.dataset.theme === "dark";
  if (dark) {
    ctx.fillStyle = "#030302";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = memoryDark ? "#171411" : "#f6f1e7";
    ctx.fillRect(0, 0, width, height);
  }

  if (!graph.nodes.length) return;

  const projected = projectAll(graph, width, height, options.yaw, options.tilt, options.zoom, options.mode);
  const selected = options.selectedKey ? graph.nodes.find((node) => node.key === options.selectedKey) : null;
  const related = selected ? new Set(graph.edges.filter((edge) => edge.a === selected.id || edge.b === selected.id).flatMap((edge) => [edge.a, edge.b])) : null;
  const pathIds = (options.highlightKeys ?? [])
    .map((key) => graph.nodes.find((node) => node.key === key)?.id)
    .filter((id): id is number => typeof id === "number");
  const pathSet = new Set(pathIds);
  const terms = (options.query ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2);
  for (const edge of graph.edges) {
    const a = projected[edge.a];
    const b = projected[edge.b];
    if (!a || !b) continue;
    const hot = selected ? edge.a === selected.id || edge.b === selected.id : false;
    const alpha = hot ? 0.35 : selected || options.filterType ? 0.05 : dark ? 0.06 : 0.1;
    ctx.strokeStyle = dark ? `rgba(232,100,44,${hot ? 0.3 : alpha})` : memoryDark ? `rgba(184,174,158,${alpha})` : `rgba(26,23,20,${alpha})`;
    ctx.lineWidth = hot ? 1.4 : dark ? 0.7 : 0.8;
    line(ctx, a.x, a.y, b.x, b.y);
  }

  if (options.mode === "memory" && options.filterType) {
    const filtered = graph.nodes.filter((node) => node.type === options.filterType);
    const drawn = new Set<string>();
    for (const node of filtered) {
      const nearest = filtered
        .filter((candidate) => candidate.id !== node.id)
        .map((candidate) => ({ candidate, distance: Math.hypot(candidate.x - node.x, candidate.y - node.y) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 2);
      for (const { candidate } of nearest) {
        const key = node.id < candidate.id ? `${node.id}:${candidate.id}` : `${candidate.id}:${node.id}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const a = projected[node.id];
        const b = projected[candidate.id];
        if (!a || !b) continue;
        ctx.strokeStyle = rgba(typeColor(options.filterType), 0.28);
        ctx.lineWidth = 1.1;
        line(ctx, a.x, a.y, b.x, b.y);
      }
    }
  }

  if (options.mode === "memory" && pathIds.length > 1) {
    for (let index = 0; index < pathIds.length - 1; index += 1) {
      const a = projected[pathIds[index]!];
      const b = projected[pathIds[index + 1]!];
      if (!a || !b) continue;
      ctx.strokeStyle = "rgba(232,100,44,0.72)";
      ctx.lineWidth = 2.5;
      line(ctx, a.x, a.y, b.x, b.y);
    }
    const phase = (options.elapsed % 1400) / 1400;
    const segmentFloat = phase * (pathIds.length - 1);
    const segment = Math.min(pathIds.length - 2, Math.floor(segmentFloat));
    const segmentPhase = segmentFloat - segment;
    const a = projected[pathIds[segment]!];
    const b = projected[pathIds[segment + 1]!];
    if (a && b) {
      circle(ctx, a.x + (b.x - a.x) * segmentPhase, a.y + (b.y - a.y) * segmentPhase, 3, "#e8642c", 1);
    }
  }

  const sparkCount = options.mode === "voice" ? Math.min(12, graph.edges.length) : 0;
  const flow = ((options.elapsed % (options.mode === "voice" ? 2200 : 1400)) / (options.mode === "voice" ? 2200 : 1400) + 1) % 1;
  for (let index = 0; index < sparkCount; index += 1) {
    const edge = graph.edges[positiveMod(Math.floor(options.yaw * 9) * 31 + index * 977, graph.edges.length)];
    if (!edge) continue;
    const a = projected[edge.a];
    const b = projected[edge.b];
    if (!a || !b) continue;
    const phase = (flow + index * 0.083) % 1;
    ctx.strokeStyle = "rgba(232,100,44,0.30)";
    ctx.lineWidth = 1.3;
    line(ctx, a.x, a.y, b.x, b.y);
    circle(ctx, a.x + (b.x - a.x) * phase, a.y + (b.y - a.y) * phase, 2.6, "#e8642c", 1);
  }

  const ordered = graph.nodes.map((node) => ({ node, pos: projected[node.id] })).filter((entry) => entry.pos).sort((a, b) => (b.pos?.depth ?? 0) - (a.pos?.depth ?? 0));
  for (const { node, pos } of ordered) {
    if (!pos) continue;
    const matchesQuery =
      !terms.length || terms.some((term) => `${node.label} ${node.content} ${node.source}`.toLowerCase().includes(term));
    const inPath = pathSet.has(node.id);
    const dim =
      (options.filterType && node.type !== "hub" && node.type !== options.filterType) ||
      (related && !related.has(node.id) && !inPath) ||
      (!matchesQuery && node.type !== "hub" && !inPath);
    const selectedNode = node.key === options.selectedKey;
    const radius = (options.mode === "voice" ? 2.5 : 4) + node.strength * (options.mode === "voice" ? 6 : 7);
    const r = radius * pos.depth * (options.mode === "memory" ? pos.scale : 1);
    const color = selectedNode || inPath || node.type === "hub"
      ? "#e8642c"
      : options.mode === "voice"
        ? platformColor(node.source)
        : nodeColor(node);
    const alpha = dim ? 0.16 : options.mode === "voice" ? clamp(0.45 + pos.depth * 0.55, 0.3, 1) : 1;
    circle(ctx, pos.x, pos.y, r, color, alpha);
    if (options.mode === "memory") {
      ctx.strokeStyle = memoryDark ? `rgba(184,174,158,${0.12 * alpha})` : `rgba(26,23,20,${0.12 * alpha})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (selectedNode || inPath) {
        ctx.strokeStyle = "#e8642c";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (options.mode !== "voice" && (node.type === "hub" || selectedNode || inPath || options.zoom > 1.4)) {
      ctx.fillStyle = memoryDark ? "rgba(244,239,230,0.72)" : "rgba(92,84,75,0.82)";
      ctx.font = "10.5px -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(trimLabel(node.label, 22), pos.x, pos.y + r + 13);
    }
  }
}

function hitTest(
  canvas: HTMLCanvasElement,
  graph: BrainGraph,
  clientX: number,
  clientY: number,
  yaw: number,
  tilt: number,
  zoom: number,
  options: BrainCanvasOptions
): BrainNode | null {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const projected = projectAll(graph, rect.width, rect.height, yaw, tilt, zoom, options.mode);
  let best: { node: BrainNode; depth: number } | null = null;
  for (const node of graph.nodes) {
    if (options.filterType && node.type !== "hub" && node.type !== options.filterType) continue;
    const pos = projected[node.id];
    if (!pos) continue;
    const radius = (13 + node.strength * 13) * pos.depth;
    if (Math.hypot(x - pos.x, y - pos.y) <= radius && (!best || pos.depth > best.depth)) {
      best = { node, depth: pos.depth };
    }
  }
  return best?.node ?? null;
}

function projectAll(
  graph: BrainGraph,
  width: number,
  height: number,
  yaw: number,
  tilt: number,
  zoom: number,
  mode: "memory" | "voice"
): Array<{ x: number; y: number; depth: number; scale: number } | undefined> {
  const minDimension = Math.min(width, height);
  const ext = mode === "voice"
    ? percentile(graph.nodes.map((node) => Math.max(Math.abs(node.x), Math.abs(node.y))), 0.72)
    : Math.max(1, ...graph.nodes.map((node) => Math.max(Math.abs(node.x), Math.abs(node.y))));
  // Android targets 440 physical pixels in a roughly 760px graph box. Expressing that same
  // 0.58 ratio against this responsive canvas preserves the phone composition on Mac and iOS.
  const scale = (mode === "voice"
    ? minDimension * 0.6 / Math.max(1, ext)
    : clamp(minDimension * 0.58 / (ext + 60), 0.2, 1)) * zoom;
  const cx = width / 2;
  const cy = height / 2;
  return graph.nodes.map((node) => project(node, cx, cy, scale, yaw, tilt));
}

function project(
  node: BrainNode,
  cx: number,
  cy: number,
  scale: number,
  yaw: number,
  tilt: number
): { x: number; y: number; depth: number; scale: number } {
  const z = depthZ(node.id);
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  const x2 = node.x * ca - z * sa;
  const z2 = node.x * sa + z * ca;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const y2 = node.y * ct - z2 * st;
  const z3 = node.y * st + z2 * ct;
  const focal = 1100;
  const depth = clamp(focal / (focal - z3), 0.45, 1.9);
  return { x: cx + x2 * scale * depth, y: cy + y2 * scale * depth, depth, scale };
}

function layout(nodes: BrainNode[], edges: BrainEdge[]): void {
  const rnd = javaRandom(7);
  for (const node of nodes) {
    node.x = (rnd() - 0.5) * 700;
    node.y = (rnd() - 0.5) * 700;
  }
  const minGap = 46;
  const iterations = nodes.length > 120 ? 70 : 600;
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]!;
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(distSq);
        const force = 5200 / distSq;
        const ux = dx / dist;
        const uy = dy / dist;
        a.x += ux * force * 0.5;
        a.y += uy * force * 0.5;
        b.x -= ux * force * 0.5;
        b.y -= uy * force * 0.5;
        if (dist < minGap) {
          const push = (minGap - dist) * 0.5;
          a.x += ux * push;
          a.y += uy * push;
          b.x -= ux * push;
          b.y -= uy * push;
        }
      }
    }
    for (const edge of edges) {
      const a = nodes[edge.a];
      const b = nodes[edge.b];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = (dist - 150) * 0.015;
      const ux = dx / dist;
      const uy = dy / dist;
      a.x += ux * force;
      a.y += uy * force;
      b.x -= ux * force;
      b.y -= uy * force;
    }
  }
  const cx = average(nodes.map((node) => node.x));
  const cy = average(nodes.map((node) => node.y));
  for (const node of nodes) {
    node.x -= cx;
    node.y -= cy;
  }
}

function addSynapses(nodes: BrainNode[], edges: BrainEdge[]): void {
  const ids = nodes.filter((node) => node.type !== "hub").map((node) => node.id);
  if (ids.length < 3) return;
  const seen = new Set<string>();
  for (const id of ids) {
    const a = nodes[id];
    if (!a) continue;
    const near = ids
      .filter((candidate) => candidate !== id)
      .sort((left, right) => distanceSq(a, nodes[left]!) - distanceSq(a, nodes[right]!))
      .slice(0, 2);
    for (const other of near) {
      const key = `${Math.min(id, other)}:${Math.max(id, other)}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ a: id, b: other });
      }
    }
  }
}

function nodeTypeFor(item: MemoryItem): BrainNodeType {
  if (item.kind === "profile" || item.tags.includes("person")) return "person";
  if (item.tags.includes("project")) return "project";
  if (item.tags.includes("summary")) return "summary";
  if (item.tags.includes("task")) return "task";
  if (item.kind === "paper" || item.tags.includes("paper")) return "paper";
  if (item.kind === "screen") return "recall";
  if (item.tags.includes("network")) return "network";
  if (item.tags.includes("agent-response") || item.tags.includes("response")) return "response";
  if (item.tags.includes("prompt") || item.tags.includes("home-prompt")) return "prompt";
  if (item.kind === "message" || item.kind === "chat") return "transcript";
  if (item.kind === "vault") return "vault";
  return "idea";
}

function nodeColor(node: BrainNode): string {
  if (node.type === "person") {
    return platformColor(node.source);
  }
  return TYPE_COLORS[node.type] ?? TYPE_COLORS.idea;
}

function platformColor(source: string): string {
  return PLATFORM_COLORS.find(([pattern]) => pattern.test(source))?.[1] ?? TYPE_COLORS.person;
}

function sourceFor(item: MemoryItem): string {
  if (item.tags.includes("paper")) return "Research";
  if (item.tags.includes("network")) return "Network";
  if (item.tags.includes("agent-response")) return "Agent";
  return item.source || "Brain";
}

function depthZ(id: number): number {
  const hash = (id * 374761393 + 668265263) | 0;
  return ((hash & 0x7fffffff) % 640) - 320;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function distanceSq(a: BrainNode, b: BrainNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return Math.max(1, sorted[index] ?? 1);
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function javaRandom(seed: number): () => number {
  let state = (BigInt(seed) ^ 0x5deece66dn) & ((1n << 48n) - 1n);
  return () => {
    state = (state * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
    return Number(state >> 24n) / 0x1000000;
  };
}

function rgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const value = Number.parseInt(raw, 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function trimLabel(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 1))}...` : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
