// Analyze alpha silhouettes from the unmodified official PNGs; no artwork is edited.
import {readFile,writeFile} from 'node:fs/promises';
import {initWasm,Resvg} from '@resvg/resvg-wasm';
await initWasm(await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
const result={};
for(const name of ['felipe','iggy','todd','alfred']){
 const data=await readFile(`assets/references/openai-${name}.png`);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><image href="data:image/png;base64,${data.toString('base64')}" width="64" height="64" preserveAspectRatio="none"/></svg>`;
 const renderer=new Resvg(svg);const image=renderer.render();const pixels=image.pixels;
 const solid=(x,y)=>x>=0&&x<64&&y>=0&&y<64&&pixels[(y*64+x)*4+3]>110;
 const edges=new Map();const edge=(a,b)=>{const key=`${a.x},${a.y}`;edges.set(key,[...(edges.get(key)??[]),b]);};
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(solid(x,y)){
  if(!solid(x,y-1))edge({x,y},{x:x+1,y});
  if(!solid(x+1,y))edge({x:x+1,y},{x:x+1,y:y+1});
  if(!solid(x,y+1))edge({x:x+1,y:y+1},{x,y:y+1});
  if(!solid(x-1,y))edge({x,y:y+1},{x,y});
 }
 const area=(p)=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y;},0))/2;
 const loops=[];
 while(edges.size){const first=edges.keys().next().value;let p={x:+first.split(',')[0],y:+first.split(',')[1]};const loop=[];
 for(let n=0;n<17000;n++){loop.push(p);const key=`${p.x},${p.y}`,opts=edges.get(key);if(!opts?.length)break;const next=opts.pop();if(!opts.length)edges.delete(key);p=next;if(`${p.x},${p.y}`===first)break;}
 if(loop.length>=8)loops.push(loop);}
 loops.sort((a,b)=>area(b)-area(a));const raw=loops[0];if(!raw)throw Error(name);
 const lengths=raw.map((p,i)=>{const q=raw[(i+1)%raw.length];return Math.hypot(q.x-p.x,q.y-p.y);});const total=lengths.reduce((a,b)=>a+b,0);const points=[];
 for(let i=0;i<64;i++){let d=i*total/64,j=0;while(d>lengths[j]&&j<raw.length-1)d-=lengths[j++];const a=raw[j],b=raw[(j+1)%raw.length],t=d/lengths[j];points.push({x:+(a.x+(b.x-a.x)*t).toFixed(4),y:+(a.y+(b.y-a.y)*t).toFixed(4)});}
 result[name]={points};image.free();renderer.free();
}
await writeFile('lib/game/official-outlines.json',JSON.stringify(result,null,2)+'\n');
console.log('Traced four official PNG silhouettes into collision data.');
