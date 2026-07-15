const EDGE_PALETTE = ["#e8642c", "#e39a3c", "#c85a7c", "#8a6dbe"];

interface PerimeterPoint {
  x: number;
  y: number;
  angle: number;
}

export function wireBusyPerimeterCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const startedAt = performance.now();

  const draw = (now: number): void => {
    if (!canvas.isConnected) return;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const elapsed = now - startedAt;
    const radius = Math.max(0, Math.min(width / 2, height / 2, Number.parseFloat(getComputedStyle(canvas).borderRadius) || 0));
    drawEdgeShimmer(context, width, height, radius, elapsed);
    drawBusyRunner(context, width, height, radius, elapsed);
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
}

function drawEdgeShimmer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
  elapsed: number
): void {
  const inset = 0.6;
  const gradient = context.createConicGradient((elapsed / 7000) * Math.PI * 2, width / 2, height / 2);
  EDGE_PALETTE.forEach((color, index) => gradient.addColorStop(index / EDGE_PALETTE.length, color));
  gradient.addColorStop(1, EDGE_PALETTE[0]!);

  roundedRectPath(context, inset, inset, width - inset * 2, height - inset * 2, radius);
  context.strokeStyle = gradient;
  context.globalAlpha = 0.26;
  context.lineWidth = 3.5;
  context.stroke();

  roundedRectPath(context, inset, inset, width - inset * 2, height - inset * 2, radius);
  context.globalAlpha = 0.9;
  context.lineWidth = 1.2;
  context.stroke();
  context.globalAlpha = 1;
}

function drawBusyRunner(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
  elapsed: number
): void {
  const travel = 1 - ((elapsed % 6000) / 6000);
  const point = pointOnRoundedPerimeter(width, height, radius, travel);
  const pixel = 3.4;
  const legPhase = (elapsed % 280) / 140;
  const legUp = (legPhase <= 1 ? legPhase : 2 - legPhase) > 0.5;

  context.save();
  context.translate(point.x, point.y);
  context.rotate(point.angle);
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#1a1714";
  const px = (column: number, row: number): void => {
    context.fillRect((3 - column) * pixel, (3.5 - row) * pixel, pixel, pixel);
  };
  for (let column = 0; column <= 4; column += 1) px(column, 1.5);
  for (let column = 0; column <= 4; column += 1) px(column, 2.5);
  px(5, 0.5);
  px(5, 1.5);
  px(6, 1.5);
  px(5, 2.5);
  px(4.5, 0.5);
  px(-0.5, 0.5);
  px(0.5, 3.5 + (legUp ? 0 : 0.6));
  px(4, 3.5 + (legUp ? 0.6 : 0));
  context.restore();
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.roundRect(x, y, width, height, r);
}

function pointOnRoundedPerimeter(width: number, height: number, radius: number, progress: number): PerimeterPoint {
  const inset = 0.6;
  const left = inset;
  const top = inset;
  const right = width - inset;
  const bottom = height - inset;
  const r = Math.max(0, Math.min(radius, (right - left) / 2, (bottom - top) / 2));
  const horizontal = Math.max(0, right - left - r * 2);
  const vertical = Math.max(0, bottom - top - r * 2);
  const arc = (Math.PI * r) / 2;
  const lengths = [horizontal, arc, vertical, arc, horizontal, arc, vertical, arc];
  const perimeter = lengths.reduce((sum, value) => sum + value, 0);
  let distance = ((progress % 1) + 1) % 1 * perimeter;

  const line = (length: number, fromX: number, fromY: number, dx: number, dy: number, angle: number): PerimeterPoint | null => {
    if (distance > length) {
      distance -= length;
      return null;
    }
    const amount = length ? distance / length : 0;
    return { x: fromX + dx * amount, y: fromY + dy * amount, angle };
  };
  const curve = (length: number, centerX: number, centerY: number, startAngle: number): PerimeterPoint | null => {
    if (distance > length) {
      distance -= length;
      return null;
    }
    const angle = startAngle + (length ? distance / length : 0) * (Math.PI / 2);
    return { x: centerX + Math.cos(angle) * r, y: centerY + Math.sin(angle) * r, angle: angle + Math.PI / 2 };
  };

  return line(lengths[0]!, left + r, top, horizontal, 0, 0)
    ?? curve(lengths[1]!, right - r, top + r, -Math.PI / 2)
    ?? line(lengths[2]!, right, top + r, 0, vertical, Math.PI / 2)
    ?? curve(lengths[3]!, right - r, bottom - r, 0)
    ?? line(lengths[4]!, right - r, bottom, -horizontal, 0, Math.PI)
    ?? curve(lengths[5]!, left + r, bottom - r, Math.PI / 2)
    ?? line(lengths[6]!, left, bottom - r, 0, -vertical, -Math.PI / 2)
    ?? curve(lengths[7]!, left + r, top + r, Math.PI)
    ?? { x: left + r, y: top, angle: 0 };
}
