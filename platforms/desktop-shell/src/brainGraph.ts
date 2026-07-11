import type { MemoryItem } from "@badscientist/agent-core";

export type BrainNodeType = "hub" | "person" | "idea" | "task" | "paper" | "recall" | "network" | "message" | "vault";

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
  query?: string;
  onSelect?: (key: string | null) => void;
}

const TYPE_COLORS: Record<BrainNodeType, string> = {
  hub: "#e8642c",
  person: "#9a8b77",
  idea: "#c39a5e",
  task: "#bc6242",
  paper: "#837c70",
  recall: "#6e8fa6",
  network: "#2e6f9e",
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

  const ordered = [...items]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 320);

  for (const item of ordered) {
    const type = nodeTypeFor(item);
    const key = item.id;
    const ageHours = Math.max(0, (Date.now() - Date.parse(item.updatedAt || item.createdAt)) / 36e5);
    const recency = Math.max(0.18, Math.min(1, 1 - ageHours / (24 * 30)));
    const strength = Math.max(0.42, Math.min(0.95, 0.48 + item.body.length / 900 + item.tags.length * 0.03));
    const node: BrainNode = {
      id: nodes.length,
      key,
      type,
      label: trimLabel(item.title || item.kind, 42),
      content: item.body,
      source: item.source || sourceFor(item),
      strength,
      recency,
      x: 0,
      y: 0
    };
    nodes.push(node);
    edges.push({ a: 0, b: node.id });
  }

  layout(nodes, edges);
  addSynapses(nodes, edges);
  return { nodes, edges };
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

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = () => {
    if (!canvas.isConnected) return;
    resize();
    const elapsed = performance.now() - startedAt;
    const spinDuration = options.mode === "voice" ? 46000 : 90000;
    const yaw = userYaw + (elapsed / spinDuration) * Math.PI * 2;
    render(ctx, canvas, graph, {
      ...options,
      yaw,
      tilt,
      zoom,
      elapsed
    });
    window.requestAnimationFrame(draw);
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
    },
    { passive: false }
  );

  draw();
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
  ctx.clearRect(0, 0, width, height);

  const dark = options.mode === "voice";
  if (dark) {
    const glow = ctx.createRadialGradient(width * 0.5, height * 0.58, 0, width * 0.5, height * 0.58, width * 0.52);
    glow.addColorStop(0, "rgba(232,100,44,0.18)");
    glow.addColorStop(0.38, "rgba(232,100,44,0.05)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = "#030302";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  if (!graph.nodes.length) return;

  const projected = projectAll(graph, width, height, options.yaw, options.tilt, options.zoom, options.mode);
  const selected = options.selectedKey ? graph.nodes.find((node) => node.key === options.selectedKey) : null;
  const related = selected ? new Set(graph.edges.filter((edge) => edge.a === selected.id || edge.b === selected.id).flatMap((edge) => [edge.a, edge.b])) : null;
  const terms = (options.query ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2);
  const sparseMemoryGraph = options.mode === "memory" && graph.nodes.length < 8;

  for (const edge of graph.edges) {
    const a = projected[edge.a];
    const b = projected[edge.b];
    if (!a || !b) continue;
    const hot = selected ? edge.a === selected.id || edge.b === selected.id : false;
    const alpha = hot ? 0.28 : sparseMemoryGraph ? 0.022 : selected || options.filterType ? 0.035 : dark ? 0.04 : 0.052;
    ctx.strokeStyle = dark ? `rgba(232,100,44,${hot ? 0.26 : alpha})` : `rgba(26,23,20,${alpha})`;
    ctx.lineWidth = hot ? 1 : 0.55;
    line(ctx, a.x, a.y, b.x, b.y);
  }

  const sparkCount = sparseMemoryGraph ? 0 : Math.min(12, graph.edges.length);
  const edgeSeed = Math.floor(options.elapsed / (options.mode === "voice" ? 1150 : 1400));
  const flow = ((options.elapsed % (options.mode === "voice" ? 2200 : 1400)) / (options.mode === "voice" ? 2200 : 1400) + 1) % 1;
  for (let index = 0; index < sparkCount; index += 1) {
    const edge = graph.edges[(edgeSeed * 31 + index * 977) % graph.edges.length];
    if (!edge) continue;
    const a = projected[edge.a];
    const b = projected[edge.b];
    if (!a || !b) continue;
    const phase = (flow + index * 0.083) % 1;
    ctx.strokeStyle = dark ? "rgba(232,100,44,0.16)" : "rgba(232,100,44,0.13)";
    ctx.lineWidth = dark ? 0.95 : 0.7;
    line(ctx, a.x, a.y, b.x, b.y);
    circle(ctx, a.x + (b.x - a.x) * phase, a.y + (b.y - a.y) * phase, dark ? 1.7 : 1.25, "#e8642c", 0.9);
  }

  const ordered = graph.nodes.map((node) => ({ node, pos: projected[node.id] })).filter((entry) => entry.pos).sort((a, b) => (a.pos?.depth ?? 0) - (b.pos?.depth ?? 0));
  for (const { node, pos } of ordered) {
    if (!pos) continue;
    const matchesQuery =
      !terms.length || terms.some((term) => `${node.label} ${node.content} ${node.source}`.toLowerCase().includes(term));
    const dim =
      (options.filterType && node.type !== "hub" && node.type !== options.filterType) ||
      (related && !related.has(node.id)) ||
      (!matchesQuery && node.type !== "hub");
    const selectedNode = node.key === options.selectedKey;
    const radius = (options.mode === "voice" ? 1.7 : 1.45) + node.strength * (options.mode === "voice" ? 4.15 : 3.45);
    const r = radius * pos.depth;
    const color = selectedNode || node.type === "hub" ? "#e8642c" : nodeColor(node);
    const alpha = dim ? 0.14 : clamp(0.45 + pos.depth * 0.55, 0.3, 1);
    circle(ctx, pos.x, pos.y, r, color, alpha);
    ctx.strokeStyle = dark ? `rgba(244,239,230,${0.08 * alpha})` : `rgba(26,23,20,${0.12 * alpha})`;
    ctx.lineWidth = selectedNode ? 1.5 : 0.65;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, selectedNode ? r + 4 : r, 0, Math.PI * 2);
    ctx.stroke();
    if ((selectedNode || node.type === "hub" || options.zoom > 1.65) && options.mode !== "voice") {
      ctx.fillStyle = "rgba(92,84,75,0.82)";
      ctx.font = "12px -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(trimLabel(node.label, 24), pos.x, pos.y + r + 14);
    }
  }

  if (options.mode === "memory") {
    ctx.fillStyle = "rgba(26,23,20,0.28)";
    ctx.font = "22px Caveat, 'Segoe Script', cursive";
    ctx.textAlign = "center";
    ctx.fillText("SlyOS", width / 2, height / 2 + 8);
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
    const radius = (8 + node.strength * 13) * pos.depth;
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
): Array<{ x: number; y: number; depth: number } | undefined> {
  const rawExt = percentile(graph.nodes.map((node) => Math.max(Math.abs(node.x), Math.abs(node.y))), mode === "voice" ? 0.84 : 0.72);
  const minExt = mode === "voice" ? 260 : graph.nodes.length < 12 ? 300 : 1;
  const ext = Math.max(minExt, rawExt);
  const scale = ((Math.min(width, height) * (mode === "voice" ? 0.5 : 0.36)) / Math.max(1, ext)) * zoom;
  const cx = width / 2;
  const cy = height * (mode === "voice" ? 0.54 : 0.52);
  return graph.nodes.map((node) => project(node, cx, cy, scale, yaw, tilt));
}

function project(node: BrainNode, cx: number, cy: number, scale: number, yaw: number, tilt: number): { x: number; y: number; depth: number } {
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
  return { x: cx + x2 * scale * depth, y: cy + y2 * scale * depth, depth };
}

function layout(nodes: BrainNode[], edges: BrainEdge[]): void {
  for (const node of nodes) {
    const rnd = seededRandom(hashString(`layout:${node.key}`));
    node.x = (rnd() - 0.5) * 700;
    node.y = (rnd() - 0.5) * 700;
  }
  nodes[0]!.x = 0;
  nodes[0]!.y = 0;
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
  const seen = new Set<string>(edges.map((edge) => `${Math.min(edge.a, edge.b)}:${Math.max(edge.a, edge.b)}`));
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
  if (item.tags.includes("task")) return "task";
  if (item.kind === "paper" || item.tags.includes("paper")) return "paper";
  if (item.tags.includes("agent-response") || item.kind === "screen") return "recall";
  if (item.tags.includes("network")) return "network";
  if (item.kind === "message" || item.kind === "chat") return "message";
  if (item.kind === "vault") return "vault";
  return "idea";
}

function nodeColor(node: BrainNode): string {
  if (node.type === "person") {
    return PLATFORM_COLORS.find(([pattern]) => pattern.test(node.source))?.[1] ?? TYPE_COLORS.person;
  }
  return TYPE_COLORS[node.type] ?? TYPE_COLORS.idea;
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

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function trimLabel(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 1))}...` : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
