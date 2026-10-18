import earcut, {deviation} from 'earcut';
import type {Point} from './types';
const EPS=1e-8;
const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const same=(a:Point,b:Point)=>Math.abs(a.x-b.x)<EPS&&Math.abs(a.y-b.y)<EPS;
const signedArea=(p:Point[])=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y;},0)/2;
function hull(points:Point[]) {
 const p=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y).filter((a,i,s)=>!i||!same(a,s[i-1]));
 const lower:Point[]=[],upper:Point[]=[];
 for(const a of p){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],a)<=EPS)lower.pop();lower.push(a);}
 for(const a of p.slice().reverse()){while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],a)<=EPS)upper.pop();upper.push(a);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}
const cache=new Map<string,Point[][]>();
/** Ear clipping followed by area-preserving convex merges. Never drops part of a silhouette. */
export function convexParts(input:Point[]):Point[][] {
 const key=JSON.stringify(input);const cached=cache.get(key);if(cached)return structuredClone(cached);
 const points=input.map(p=>({...p}));
 // Only remove mathematically redundant points, not corners that merely have a small angle.
 let changed=true;
 while(changed&&points.length>3){changed=false;for(let i=0;i<points.length;i++){
  const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];
  if(same(a,b)||(Math.abs(cross(a,b,c))<EPS&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)>=0)) {points.splice(i,1);changed=true;break;}
 }}
 if(signedArea(points)<0)points.reverse();
 const vertices=points.flatMap(p=>[p.x,p.y]);
 const triangles=earcut(vertices);
 if(deviation(vertices,[],2,triangles)>1e-8)throw new Error('キャラクターの輪郭を欠けずに分割できません。');
 const parts:Point[][]=[];
 for(let i=0;i<triangles.length;i+=3){const tri=[points[triangles[i]],points[triangles[i+1]],points[triangles[i+2]]];if(signedArea(tri)<0)tri.reverse();parts.push(tri);}
 let merged=true;
 while(merged){merged=false;outer:for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
  if(parts[i].filter(a=>parts[j].some(b=>same(a,b))).length<2)continue;
  const combined=hull([...parts[i],...parts[j]]);
  const expected=signedArea(parts[i])+signedArea(parts[j]);
  if(Math.abs(signedArea(combined)-expected)>1e-5)continue;
  parts[i]=combined;parts.splice(j,1);merged=true;break outer;
 }}
 const expected=Math.abs(signedArea(input)),actual=parts.reduce((s,p)=>s+Math.abs(signedArea(p)),0);
 if(Math.abs(expected-actual)>Math.max(1e-5,expected*1e-8))throw new Error('キャラクターの輪郭の面積が一致しません。');
 if(cache.size>=128)cache.delete(cache.keys().next().value!);
 cache.set(key,structuredClone(parts));return parts;
}
