// A recorded local demo played through the real turn/physics engine for the LP screenshot.
import {writeFile,readFile} from 'node:fs/promises';
import {newRoom,join,start,act,advance,publicRoom} from '../lib/game/engine';
import {CHARACTERS,validateCharacter} from '../lib/game/characters';
import {simulate} from '../lib/game/physics';
import {battleSvg} from '../lib/battle-scene';
import {initWasm,Resvg} from '@resvg/resvg-wasm';
for(const c of CHARACTERS)validateCharacter(c);
let now=Date.now();
const r=newRoom('DEMOTWR2','not-an-invite','local_seedy',{name:'Felipe',character:CHARACTERS[0],poseReadyAt:now},now);
for(let i=1;i<4;i++)join(r,`demo-${i}`,{name:CHARACTERS[i].name,character:CHARACTERS[i],poseReadyAt:now+i},now);
r.rng=Number(process.env.DEMO_SEED ?? 354871);
r.players.forEach(p=>p.ready=true);start(r,'local_seedy',now);now=r.startedAt!+1;
for(let i=0;i<10;i++){
 const preferred=[-125,0,125,0,0,0][i%6];let found:{x:number,degrees:number}|undefined;
 for(const x of [preferred,preferred-20,preferred+20,-130,-80,-40,0,40,80,130]){
  for(const degrees of [0,15,-15,90,-90,180,30,-30]){
   const preview={...r.preview!,x,angle:degrees*Math.PI/180};
   if(simulate(r.pieces,preview,now,r.players[r.active].id).safe){found={x,degrees};break;}
  }if(found)break;
 }
 if(!found)break;
 act(r,r.players[r.active].userId,r.turnId,[{type:'move',amount:found.x},{type:'rotate',degrees:found.degrees},{type:'drop'}],now);
 now+=r.flight!.duration+1000;advance(r,now);console.log(`Turn ${i+1}: ${r.pieces.length} settled pieces`);
}
// Keep the local screenshot fixture steady while its owner captures it.
const captureAt=Date.now();r.startedAt=captureAt;r.deadline=captureAt+12*60*60*1000;r.players.forEach(p=>p.connectedAt=captureAt);r.pauseUntil=undefined;
const images:Record<string,string>={};for(const name of ['felipe','iggy','todd','alfred'])images[`/dots/official-${name}.png`]=`data:image/png;base64,${(await readFile(`assets/references/openai-${name}.png`)).toString('base64')}`;
for(const name of ["felipe","iggy","todd","alfred"])for (let i=1;i<=16;i++) {const id=String(i).padStart(2,'0');images[`/dots/${name}-poses/pose-${id}.png`]=`data:image/png;base64,${(await readFile(`assets/${name}-poses/pose-${id}.png`)).toString('base64')}`;}
await initWasm(await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
const renderer=new Resvg(battleSvg(publicRoom(r,'local_seedy',captureAt),captureAt,images));const img=renderer.render();
await writeFile('outputs/demo-board-render.png',img.asPng());img.free();renderer.free();
await writeFile('outputs/demo-game-state.json',JSON.stringify(r,null,2));
const json=JSON.stringify(r).replaceAll("'","''");
await writeFile('outputs/demo-game.sql',`INSERT OR REPLACE INTO rooms(id,revision,data,updated_at) VALUES ('${r.id}',${r.revision},'${json}',${captureAt});`);
console.log(`Demo ${r.id}: ${r.pieces.length} settled pieces + current preview`);
