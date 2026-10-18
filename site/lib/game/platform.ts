import type { Point } from "./types";
// The renderer and physics engine share this exact outline.
export const PLATFORM_POINTS: Point[] = [
  { x: -246, y: 0 },
  { x: 246, y: 0 },
  { x: 225, y: 44 },
  { x: 195, y: 10 },
  { x: 164, y: 44 },
  { x: 134, y: 10 },
  { x: 103, y: 44 },
  { x: 73, y: 10 },
  { x: 42, y: 44 },
  { x: 12, y: 10 },
  { x: -19, y: 44 },
  { x: -49, y: 10 },
  { x: -80, y: 44 },
  { x: -110, y: 10 },
  { x: -141, y: 44 },
  { x: -171, y: 10 },
  { x: -202, y: 44 },
];
export const PLATFORM_PATH =
  "M" + PLATFORM_POINTS.map((p) => `${p.x} ${p.y}`).join("L") + "Z";

// Clip the serrated part below the six-pixel solid top plate. Keeping the
// contact surface as one convex face avoids internal decomposition seams.
export const PLATFORM_BOTTOM_POINTS: Point[] = [];
for (let i = 0; i < PLATFORM_POINTS.length; i++) {
  const a = PLATFORM_POINTS[i],
    b = PLATFORM_POINTS[(i + 1) % PLATFORM_POINTS.length];
  if (a.y >= 6) PLATFORM_BOTTOM_POINTS.push({ ...a });
  if (a.y >= 6 !== b.y >= 6) {
    const t = (6 - a.y) / (b.y - a.y);
    PLATFORM_BOTTOM_POINTS.push({ x: a.x + (b.x - a.x) * t, y: 6 });
  }
}
