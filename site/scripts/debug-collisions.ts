import {readFile,writeFile} from 'node:fs/promises';
import Matter from 'matter-js';
import {characterBody,maxPenetration} from '../lib/game/physics';
import {battleSvg} from '../lib/battle-scene';import {publicRoom} from '../lib/game/engine';
import {initWasm,Resvg} from '@resvg/resvg-wasm';

const r: import('../lib/game/types').Room=JSON.parse(await readFile('outputs/demo-game-state.json','utf8'));
const bodies=r.pieces.map(characterBody);
for(let i=0;i<bodies.length;i++){
 const b=bodies[i];const p=r.pieces[i];const depths=bodies.filter((_,j)=>j!==i).map(other=>maxPenetration([b,other]));
 const s=p.character.points;const c=Matter.Vertices.centre(s);console.log(i,p.character.kind,{depths,center:c,parts:b.parts.length,area:b.area,shapeArea:Matter.Vertices.area(s,false)});
}
const images:Record<string,string>={};for(const name of ['felipe','iggy','todd','alfred'])for(let i=1;i<=16;i++){const id=String(i).padStart(2,'0');images[`/dots/${name}-poses/pose-${id}.png`]=`data:image/png;base64,${(await readFile(`assets/${name}-poses/pose-${id}.png`)).toString('base64')}`;}
let svg=battleSvg(publicRoom(r,'local_seedy',Date.now()),Date.now(),images);
const colors=['red','yellow','lime','purple','orange','white'];
const overlay=bodies.map((b,i)=>b.parts.filter((_,j)=>b.parts.length===1||j>0).map(part=>`<polygon points="${part.vertices.map(v=>`${v.x},${v.y}`).join(' ')}" stroke="${colors[i]}" stroke-width="1.1" fill="none"/>`).join('')).join('');
svg=svg.replace('</svg>',overlay+'</svg>');await initWasm(await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'));const rr=new Resvg(svg);const img=rr.render();await writeFile('outputs/collision-overlay.png',img.asPng());img.free();rr.free();
