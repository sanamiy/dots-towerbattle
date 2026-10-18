import { area, normalized } from './game/characters';
import type { Point, Character } from './game/types';
export async function processAvatar(file:File):Promise<{image:string;character:Character}>{
 if(file.size>5_000_000)throw new Error('画像は5MB以下にしてください。');
 if(!['image/png','image/webp','image/jpeg'].includes(file.type))throw new Error('PNG、WebP、JPEGを選んでください。');
 const bitmap=await createImageBitmap(file);if(bitmap.width>2048||bitmap.height>2048){bitmap.close();throw new Error('画像の縦横を2048px以内にしてください。');}
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d')!;
 const s=460/Math.max(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(512-bitmap.width*s)/2,(512-bitmap.height*s)/2,bitmap.width*s,bitmap.height*s);bitmap.close();
 // Flood-fill only the connected background; enclosed eyes and highlights stay intact.
 const pixels=ctx.getImageData(0,0,512,512),data=pixels.data;
 const seeds=[(26*512+26)*4,(26*512+485)*4,(485*512+26)*4,(485*512+485)*4];
 const candidates=seeds.filter(i=>data[i+3]>240);if(candidates.length>=3){const ref=candidates[0];const bg=[data[ref],data[ref+1],data[ref+2]];const visited=new Uint8Array(512*512),stack=[0];
  while(stack.length){const i=stack.pop()!;if(visited[i])continue;visited[i]=1;const k=i*4;const diff=Math.max(Math.abs(data[k]-bg[0]),Math.abs(data[k+1]-bg[1]),Math.abs(data[k+2]-bg[2]));if(data[k+3]>10&&diff>35)continue;data[k+3]=0;const x=i%512,y=Math.floor(i/512);if(x>0)stack.push(i-1);if(x<511)stack.push(i+1);if(y>0)stack.push(i-512);if(y<511)stack.push(i+512);}
  ctx.putImageData(pixels,0,0);
 }
 const small=document.createElement('canvas');small.width=small.height=64;const sc=small.getContext('2d')!;sc.drawImage(canvas,0,0,64,64);const alpha=sc.getImageData(0,0,64,64).data;
 const solid=(x:number,y:number)=>x>=0&&x<64&&y>=0&&y<64&&alpha[(y*64+x)*4+3]>110;
 const edges=new Map<string,Point[]>();const edge=(a:Point,b:Point)=>{const key=`${a.x},${a.y}`;edges.set(key,[...(edges.get(key)??[]),b]);};
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(solid(x,y)){if(!solid(x,y-1))edge({x,y},{x:x+1,y});if(!solid(x+1,y))edge({x:x+1,y},{x:x+1,y:y+1});if(!solid(x,y+1))edge({x:x+1,y:y+1},{x,y:y+1});if(!solid(x-1,y))edge({x,y:y+1},{x,y});}
 const loops:Point[][]=[];while(edges.size){const first=edges.keys().next().value!;let p={x:Number(first.split(',')[0]),y:Number(first.split(',')[1])};const loop:Point[]=[];for(let n=0;n<17000;n++){loop.push(p);const key=`${p.x},${p.y}`,opts=edges.get(key);if(!opts?.length)break;const next=opts.pop()!;if(!opts.length)edges.delete(key);p=next;if(`${p.x},${p.y}`===first)break;}if(loop.length>=8)loops.push(loop);}
 loops.sort((a,b)=>area(b)-area(a));if(!loops[0]||area(loops[0])<40)throw new Error('キャラクターの輪郭を検出できません。背景が透明な正面画像を使ってください。');
 const outline=loops[0],count=Math.min(64,outline.length),raw=Array.from({length:count},(_,i)=>outline[Math.floor(i*outline.length/count)]);const points=normalized(raw),scale=82/Math.sqrt(area(raw));
 const width=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));if(Math.max(width,height)/Math.min(width,height)>3)throw new Error('縦横比が大きすぎます。全身が収まる画像を選んでください。');
 return{image:canvas.toDataURL('image/png'),character:{kind:'custom',name:'マイdot',color:'#a7c8ef',points,imageBounds:{x:points[0].x-raw[0].x*scale,y:points[0].y-raw[0].y*scale,width:64*scale,height:64*scale}}};
}

export async function processPoseSheet(file:File){
 if(file.size>16_000_000)throw new Error('ポーズシートは16MB以下にしてください。');
 if(!['image/png','image/webp','image/jpeg'].includes(file.type))throw new Error('PNG、WebP、JPEGを選んでください。');
 const bitmap=await createImageBitmap(file);if(bitmap.width>4096||bitmap.height>4096||Math.abs(bitmap.width/bitmap.height-1)>.05){bitmap.close();throw new Error('正方形の4×4シートを選んでください。最大4096pxです。');}
 const cells:Awaited<ReturnType<typeof processAvatar>>[]=[];
 try{for(let i=0;i<16;i++){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,(i%4)*bitmap.width/4,Math.floor(i/4)*bitmap.height/4,bitmap.width/4,bitmap.height/4,0,0,512,512);const blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('画像を分割できません。')),'image/png'));try{cells.push(await processAvatar(new File([blob],`pose-${i+1}.png`,{type:'image/png'})));}catch(e){throw new Error(`${Math.floor(i/4)+1}行${i%4+1}列：${e instanceof Error?e.message:'輪郭を確認してください。'}`);}}}finally{bitmap.close();}
 return cells;
}
export { POSE_PROMPT as posePrompt } from './game/pose-prompt';
