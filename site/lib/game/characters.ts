import type { Character, Point } from "./types";
import felipePoses from "./felipe-poses.json";
import iggyPoses from "./iggy-poses.json";
import toddPoses from "./todd-poses.json";
import alfredPoses from "./alfred-poses.json";
import outlines from "./official-outlines.json";
// Fixed by pose index, shared by every player's set. Registration geometry remains in unit size.
export const POSE_SCALES = [1,.3,1.5,.6,1.2,.45,1.35,.9,.75,1.05,.6,1.2,.3,1.5,.75,.9] as const;
export function sizeCharacter(c: Character, scale: number): Character {
  const point = (p: Point) => ({x:p.x*scale,y:p.y*scale});
  return {...c,sizeScale:scale,points:c.points.map(point),
    collisionParts:c.collisionParts?.map(part=>part.map(point)),
    imageBounds:c.imageBounds ? {x:c.imageBounds.x*scale,y:c.imageBounds.y*scale,width:c.imageBounds.width*scale,height:c.imageBounds.height*scale} : undefined};
}
export function area(points: Point[]) {
  return (
    Math.abs(
      points.reduce((s, p, i) => {
        const q = points[(i + 1) % points.length];
        return s + p.x * q.y - q.x * p.y;
      }, 0),
    ) / 2
  );
}
export function normalized(points: Point[]): Point[] {
  const signed = points.reduce((s, p, i) => {
    const q = points[(i + 1) % points.length];
    return s + p.x * q.y - q.x * p.y;
  }, 0);
  let cx = 0,
    cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length],
      c = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  cx /= 3 * signed;
  cy /= 3 * signed;
  const scale = 82 / Math.sqrt(area(points));
  return points.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
}
function official(kind: string, name: keyof typeof outlines, color: string): Character {
  return {kind,name:name[0].toUpperCase()+name.slice(1),color,image:`/dots/official-${name}.png`,...outlines[name]};
}
export const CHARACTERS: Character[] = [
  {...official("mellow","felipe","#23b8ed"),poses:felipePoses},
  {...official("pebble","iggy","#df31d5"),poses:iggyPoses},
  {...official("sprout","todd","#c4ed42"),poses:toddPoses},
  {...official("puff","alfred","#ffe035"),poses:alfredPoses},
];
export function preset(kind: string, color?: string): Character {
  const c = CHARACTERS.find((c) => c.kind === kind) ?? CHARACTERS[0];
  return structuredClone({
    ...c,
    ...(color && /^#[0-9a-f]{6}$/i.test(color) ? { color } : {}),
  });
}
export function validateCharacter(c: Character) {
  if (
    !c ||
    !Array.isArray(c.points) ||
    c.points.length < 8 ||
    c.points.length > 80 ||
    !c.points.every(
      (p) =>
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        Math.abs(p.x) < 250 &&
        Math.abs(p.y) < 250,
    )
  )
    throw new Error("キャラクターの輪郭が不正です。");
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const on = (a: Point, b: Point, p: Point) =>
    Math.abs(cross(a, b, p)) < 1e-7 &&
    p.x >= Math.min(a.x, b.x) - 1e-7 &&
    p.x <= Math.max(a.x, b.x) + 1e-7 &&
    p.y >= Math.min(a.y, b.y) - 1e-7 &&
    p.y <= Math.max(a.y, b.y) + 1e-7;
  for (let i = 0; i < c.points.length; i++)
    for (let j = i + 1; j < c.points.length; j++) {
      if (j === i + 1 || (i === 0 && j === c.points.length - 1)) continue;
      const a = c.points[i],
        b = c.points[(i + 1) % c.points.length],
        p = c.points[j],
        q = c.points[(j + 1) % c.points.length];
      const intersects =
        (cross(a, b, p) * cross(a, b, q) < 0 &&
          cross(p, q, a) * cross(p, q, b) < 0) ||
        on(a, b, p) ||
        on(a, b, q) ||
        on(p, q, a) ||
        on(p, q, b);
      if (intersects)
        throw new Error(
          "輪郭が交差しています。体の主な部分がつながった画像を使ってください。",
        );
    }
  const width =
      Math.max(...c.points.map((p) => p.x)) -
      Math.min(...c.points.map((p) => p.x)),
    height =
      Math.max(...c.points.map((p) => p.y)) -
      Math.min(...c.points.map((p) => p.y));
  if (Math.max(width, height) / Math.min(width, height) > 3)
    throw new Error("キャラクターの縦横比が大きすぎます。");
  const a = area(c.points);
  if (a < 6000 || a > 7500) throw new Error("キャラクターの大きさが不正です。");
}
