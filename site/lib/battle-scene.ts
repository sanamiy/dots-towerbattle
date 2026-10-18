import { PLATFORM_PATH } from "./game/platform";
import { CHARACTERS } from "./game/characters";
import type { Character, Piece, PublicRoom } from "./game/types";

const n = (value: number) => Number(value.toFixed(3));
const xml = (value: string) => value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[c]!);
export function contour(c: Character) {
  const pts = c.points;
  return `M${n((pts[0].x + pts[pts.length - 1].x) / 2)},${n((pts[0].y + pts[pts.length - 1].y) / 2)} ` + pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return `Q${n(p.x)},${n(p.y)} ${n((p.x + q.x) / 2)},${n((p.y + q.y) / 2)}`;
  }).join(" ") + " Z";
}
export function visiblePieces(room: PublicRoom, now: number): Piece[] {
  const flight = room.flight;
  if (!flight) return room.pieces;
  const t = Math.max(0, now - flight.startedAt);
  let i = flight.frames.findIndex(f => f.t >= t);
  if (i < 0) i = flight.frames.length - 1;
  const b = flight.frames[i], a = flight.frames[Math.max(0, i - 1)];
  const f = b.t === a.t ? 1 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  return flight.pieces.map((p, j) => ({...p, x:a.poses[j][0]+(b.poses[j][0]-a.poses[j][0])*f, y:a.poses[j][1]+(b.poses[j][1]-a.poses[j][1])*f, angle:a.poses[j][2]+(b.poses[j][2]-a.poses[j][2])*f}));
}
function dot(c: Character, images: Record<string, string>) {
  const b = c.imageBounds;
  if (c.image && b && /^(?:\/api\/avatar\/[a-f0-9-]{36}|\/dots\/official-(?:felipe|iggy|todd|alfred)\.png|\/dots\/(?:felipe|iggy|todd|alfred)-poses\/pose-(?:0[1-9]|1[0-6])\.png)$/.test(c.image)) {
    const href = images[c.image] ?? c.image;
    return `<image href="${xml(href)}" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.width)}" height="${n(b.height)}"/>`;
  }
  const color = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#a7c8ef";
  const d = contour(c);
  return `<path d="${d}" fill="${color}" stroke="#394338" stroke-width="2" stroke-linejoin="round"/><path d="${d}" fill="url(#dot-shine)" opacity=".32"/><ellipse cx="-14" cy="-2" rx="3.8" ry="6" fill="#344336"/><ellipse cx="14" cy="-2" rx="3.8" ry="6" fill="#344336"/><ellipse cx="-24" cy="10" rx="6.5" ry="3.3" fill="#fff" opacity=".3"/><ellipse cx="24" cy="10" rx="6.5" ry="3.3" fill="#fff" opacity=".3"/><path d="M-4 12 Q0 16 4 12" fill="none" stroke="#344336" stroke-width="1.6" stroke-linecap="round"/>`;
}
/** One trusted SVG scene for both the player's board and the image sent to their dot. */
export function battleScene(room: PublicRoom, now: number, aspect = 4/3, images: Record<string,string> = {}) {
  const pieces = visiblePieces(room, now);
  const contentTop = Math.min(-410, ...pieces.map(p=>p.y-100), room.preview ? room.preview.y-120 : 0);
  const height = Math.max(190-contentTop, 740/aspect), width = height*aspect, top=190-height;
  const cloud = `<ellipse rx="64" ry="27"/><ellipse cx="-34" cy="-13" rx="35" ry="26"/><ellipse cx="20" cy="-20" rx="40" ry="28"/>`;
  const piece = (p: Piece) => `<g transform="translate(${n(p.x)} ${n(p.y)}) rotate(${n(p.angle*180/Math.PI)})">${dot(p.character,images)}</g>`;
  const ghost = room.phase === "aiming" ? room.preview : undefined;
  const markup = `<defs><linearGradient id="dot-shine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs>
    <rect x="${-width/2}" y="${top}" width="${width}" height="${height}" fill="#2ec8eb"/>
    <g transform="translate(${width/2-83} ${top+95})"><circle r="54" fill="#f5d877"/>${Array.from({length:12},(_,i)=>`<path d="M-5-68L-8-89 7-87 5-68Z" fill="#f6dc82" transform="rotate(${i*30})"/>`).join("")}</g>
    <g fill="#fffefa" opacity=".97"><g transform="translate(${-width*.29} ${top+190})">${cloud}</g><g transform="translate(${width*.29} ${top+124}) scale(.65)">${cloud}</g></g>
    <line x1="-500" x2="500" y1="164" y2="164" stroke="white" opacity=".2" stroke-width="1.3" stroke-dasharray="5 8"/>
    <path d="${PLATFORM_PATH}" fill="#159b3d"/><rect x="-246" y="0" width="492" height="6" rx="1" fill="#109c35"/>
    ${pieces.map(piece).join("")}
    ${ghost ? `<line x1="${ghost.x}" x2="${ghost.x}" y1="${ghost.y+65}" y2="0" stroke="white" stroke-width="1.5" stroke-dasharray="5 7" opacity=".65"/>${piece(ghost)}<path d="M${ghost.x-7} ${ghost.y-85}h14l-7 8Z" fill="white"/>` : ""}
    ${room.phase === "lobby" ? `<g transform="translate(0 -115)" opacity=".8">${dot(room.players[0]?.character ?? CHARACTERS[0],images)}</g>` : ""}`;
  return {markup,viewBox:`${-width/2} ${top} ${width} ${height}`,pieces};
}
export function battleSvg(room: PublicRoom, now: number, images: Record<string,string> = {}) {
  const scene=battleScene(room,now,4/3,images);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="${scene.viewBox}">${scene.markup}</svg>`;
}
