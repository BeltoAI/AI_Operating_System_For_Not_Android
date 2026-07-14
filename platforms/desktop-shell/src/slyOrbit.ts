const RAMP = ["#6e5aa8", "#b0468c", "#d65a6e", "#e8642c", "#e0a24e"];

interface Geometry {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  quads: Array<[number, number, number, number]>;
  hues: Float32Array;
}

let geometry: Geometry | null = null;

export function wireSlyOrbitCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const startedAt = performance.now();
  const geo = geometry ?? (geometry = buildGeometry());

  const draw = (now: number): void => {
    if (!canvas.isConnected) return;
    const cssSize = Number(canvas.dataset.slyOrbit) || 30;
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const pixels = Math.round(cssSize * ratio);
    if (canvas.width !== pixels || canvas.height !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssSize, cssSize);
    render(context, geo, cssSize, now - startedAt);
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
}

function buildGeometry(): Geometry {
  const nu = 4;
  const nv = 3;
  const verticesPerPatch = (nu + 1) * (nv + 1);
  const x = new Float32Array(25 * verticesPerPatch);
  const y = new Float32Array(25 * verticesPerPatch);
  const z = new Float32Array(25 * verticesPerPatch);
  const quads: Array<[number, number, number, number]> = [];
  const hues: number[] = [];
  let vertex = 0;

  for (let k1 = 0; k1 < 5; k1 += 1) {
    for (let k2 = 0; k2 < 5; k2 += 1) {
      const base = vertex;
      for (let iu = 0; iu <= nu; iu += 1) {
        for (let iv = 0; iv <= nv; iv += 1) {
          const point = calabiYauPoint(k1, k2, (iu / nu) * (Math.PI / 2), (iv / nv - 0.5) * 1.9);
          x[vertex] = point[0];
          y[vertex] = point[1];
          z[vertex] = point[2];
          vertex += 1;
        }
      }
      for (let iu = 0; iu < nu; iu += 1) {
        for (let iv = 0; iv < nv; iv += 1) {
          const a = base + iu * (nv + 1) + iv;
          quads.push([a, a + nv + 1, a + nv + 2, a + 1]);
          hues.push(((k1 + k2) % 5) / 4);
        }
      }
    }
  }

  return { x, y, z, quads, hues: Float32Array.from(hues) };
}

function calabiYauPoint(k1: number, k2: number, u: number, v: number): [number, number, number] {
  const degree = 5;
  const power = 2 / degree;

  let real = Math.cos(u) * Math.cosh(v);
  let imaginary = -Math.sin(u) * Math.sinh(v);
  let magnitude = Math.pow(real * real + imaginary * imaginary, power / 2);
  let angle = Math.atan2(imaginary, real) * power;
  let z1Real = magnitude * Math.cos(angle);
  let z1Imaginary = magnitude * Math.sin(angle);
  const phase1 = (2 * Math.PI * k1) / degree;
  [z1Real, z1Imaginary] = rotateComplex(z1Real, z1Imaginary, phase1);

  real = Math.sin(u) * Math.cosh(v);
  imaginary = Math.cos(u) * Math.sinh(v);
  magnitude = Math.pow(real * real + imaginary * imaginary, power / 2);
  angle = Math.atan2(imaginary, real) * power;
  let z2Real = magnitude * Math.cos(angle);
  let z2Imaginary = magnitude * Math.sin(angle);
  const phase2 = (2 * Math.PI * k2) / degree;
  [z2Real, z2Imaginary] = rotateComplex(z2Real, z2Imaginary, phase2);

  const alpha = Math.PI / 4;
  return [z1Real, z2Real, Math.cos(alpha) * z1Imaginary + Math.sin(alpha) * z2Imaginary];
}

function rotateComplex(real: number, imaginary: number, phase: number): [number, number] {
  return [real * Math.cos(phase) - imaginary * Math.sin(phase), real * Math.sin(phase) + imaginary * Math.cos(phase)];
}

function render(context: CanvasRenderingContext2D, geo: Geometry, size: number, elapsed: number): void {
  const center = size / 2;
  const scale = size * 0.33;
  const ry = (elapsed / 7000) * Math.PI * 2;
  const rx = (elapsed / 11000) * Math.PI * 2;
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const sx = new Float32Array(geo.x.length);
  const sy = new Float32Array(geo.x.length);
  const sz = new Float32Array(geo.x.length);

  for (let index = 0; index < geo.x.length; index += 1) {
    const x = geo.x[index] ?? 0;
    const y = geo.y[index] ?? 0;
    const z = geo.z[index] ?? 0;
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    sx[index] = center + x1 * scale;
    sy[index] = center - y2 * scale;
    sz[index] = z2;
  }

  const order = geo.quads
    .map((quad, index) => ({ index, depth: quad.reduce((sum, vertex) => sum + (sz[vertex] ?? 0), 0) }))
    .sort((a, b) => a.depth - b.depth);

  for (const entry of order) {
    const quad = geo.quads[entry.index];
    if (!quad) continue;
    const shade = clamp((entry.depth / 4 + 1.4) / 2.8, 0, 1);
    context.fillStyle = mix("#1a1714", ramp(geo.hues[entry.index] ?? 0), 0.32 + 0.68 * shade);
    context.strokeStyle = "rgba(21,18,14,0.16)";
    context.lineWidth = 0.7;
    context.beginPath();
    context.moveTo(sx[quad[0]] ?? 0, sy[quad[0]] ?? 0);
    context.lineTo(sx[quad[1]] ?? 0, sy[quad[1]] ?? 0);
    context.lineTo(sx[quad[2]] ?? 0, sy[quad[2]] ?? 0);
    context.lineTo(sx[quad[3]] ?? 0, sy[quad[3]] ?? 0);
    context.closePath();
    context.fill();
    context.stroke();
  }
}

function ramp(value: number): string {
  const scaled = clamp(value, 0, 0.999) * (RAMP.length - 1);
  const index = Math.floor(scaled);
  return mix(RAMP[index] ?? RAMP[0]!, RAMP[index + 1] ?? RAMP.at(-1)!, scaled - index);
}

function mix(from: string, to: string, amount: number): string {
  const a = rgb(from);
  const b = rgb(to);
  const channel = (index: number) => Math.round((a[index] ?? 0) + ((b[index] ?? 0) - (a[index] ?? 0)) * amount);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function rgb(color: string): [number, number, number] {
  const value = color.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
