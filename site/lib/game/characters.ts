import type { Character, Point } from './types';
const circle = (n: number, radius: (a: number) => number): Point[] => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; const r = radius(a); return { x: Math.cos(a) * r, y: Math.sin(a) * r }; });
export function area(points: Point[]) { return Math.abs(points.reduce((s, p, i) => { const q = points[(i + 1) % points.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2; }
export function normalized(points: Point[]): Point[] {
  const signed = points.reduce((s, p, i) => { const q = points[(i + 1) % points.length]; return s + p.x*q.y-q.x*p.y; }, 0);
  let cx = 0, cy = 0;
  for (let i=0;i<points.length;i++) { const p=points[i],q=points[(i+1)%points.length],c=p.x*q.y-q.x*p.y; cx+=(p.x+q.x)*c;cy+=(p.y+q.y)*c; }
  cx /= 3*signed; cy /= 3*signed;
  const scale = 82 / Math.sqrt(area(points));
  return points.map(p => ({ x: (p.x-cx)*scale, y: (p.y-cy)*scale }));
}
export const CHARACTERS: Character[] = [
  { kind: 'mellow', name: 'まる', color: '#a7c8ef', points: normalized(circle(24, a => 48 * (1 + .06*Math.cos(a*3)))) },
  { kind: 'pebble', name: 'もち', color: '#f7bdce', points: normalized(circle(24, a => 48*(1+.1*Math.sin(a*2))).map(p=>({x:p.x*1.15,y:p.y*.85}))) },
  { kind: 'sprout', name: 'ふたば', color: '#bfce9f', points: normalized([{x:-45,y:35},{x:-50,y:0},{x:-35,y:-20},{x:-32,y:-45},{x:-15,y:-52},{x:0,y:-30},{x:19,y:-51},{x:34,y:-43},{x:32,y:-20},{x:49,y:0},{x:43,y:35},{x:0,y:45}]) },
  { kind: 'puff', name: 'ぽふ', color: '#d4bce9', points: normalized(circle(30,a=>46*(1+.17*Math.cos(3*a)))) },
];
export function preset(kind: string, color?: string): Character {
  const c=CHARACTERS.find(c=>c.kind===kind)??CHARACTERS[0];
  return structuredClone({ ...c, ...(color && /^#[0-9a-f]{6}$/i.test(color)?{color}:{} ) });
}
export function validateCharacter(c: Character) {
  if (!c || !Array.isArray(c.points) || c.points.length<8 || c.points.length>80 || !c.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<250&&Math.abs(p.y)<250)) throw new Error('キャラクターの輪郭が不正です。');
  const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const on=(a:Point,b:Point,p:Point)=>Math.abs(cross(a,b,p))<1e-7&&p.x>=Math.min(a.x,b.x)-1e-7&&p.x<=Math.max(a.x,b.x)+1e-7&&p.y>=Math.min(a.y,b.y)-1e-7&&p.y<=Math.max(a.y,b.y)+1e-7;
  for(let i=0;i<c.points.length;i++)for(let j=i+1;j<c.points.length;j++){
    if(j===i+1||(i===0&&j===c.points.length-1))continue;
    const a=c.points[i],b=c.points[(i+1)%c.points.length],p=c.points[j],q=c.points[(j+1)%c.points.length];
    const intersects=(cross(a,b,p)*cross(a,b,q)<0&&cross(p,q,a)*cross(p,q,b)<0)||on(a,b,p)||on(a,b,q)||on(p,q,a)||on(p,q,b);
    if(intersects)throw new Error('輪郭が交差しています。体の主な部分がつながった画像を使ってください。');
  }
  const width=Math.max(...c.points.map(p=>p.x))-Math.min(...c.points.map(p=>p.x)),height=Math.max(...c.points.map(p=>p.y))-Math.min(...c.points.map(p=>p.y));
  if(Math.max(width,height)/Math.min(width,height)>3)throw new Error('キャラクターの縦横比が大きすぎます。');
  const a=area(c.points); if(a<6000||a>7500)throw new Error('キャラクターの大きさが不正です。');
}
