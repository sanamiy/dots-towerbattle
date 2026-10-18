/** PNG -> alpha contour -> simplified polygon -> convex fixtures. No AI or manual tracing. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {initWasm,Resvg} from '@resvg/resvg-wasm';
import {geometryFromPixels} from '../lib/avatar-geometry';
await initWasm(await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
function prepare(bytes:Buffer,viewBox?:string) {
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 const source=`<image href="data:image/png;base64,${bytes.toString('base64')}" width="${width}" height="${height}"/>`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${viewBox??`0 0 ${width} ${height}`}">${source}</svg>`;
 const renderer=new Resvg(svg),image=renderer.render();
 try {return {geometry:geometryFromPixels(image.pixels,512,512),png:Buffer.from(image.asPng())};}finally{image.free();renderer.free();}
}
if(process.argv.includes('--refresh-samples')) {
 const official:Record<string,unknown>={};
 for(const name of ['felipe','iggy','todd','alfred']) {
  official[name]=prepare(await readFile(`assets/references/openai-${name}.png`)).geometry;
  const poses=[];
  for(let i=1;i<=16;i++) {
   const id=String(i).padStart(2,'0');
   const {geometry}=prepare(await readFile(`assets/${name}-poses/pose-${id}.png`));
   poses.push({name:`ポーズ ${i}`,image:`/dots/${name}-poses/pose-${id}.png`,...geometry});
  }
  await writeFile(`lib/game/${name}-poses.json`,JSON.stringify(poses,null,2)+'\n');
 }
 await writeFile('lib/game/official-outlines.json',JSON.stringify(official,null,2)+'\n');
 console.log('Prepared 64 independent pose colliders and four official colliders from PNG alpha.');
}else{
 const inputIndex=process.argv.indexOf('--input'),outputIndex=process.argv.indexOf('--output');
 if(inputIndex<0)throw Error('Usage: npx tsx scripts/prepare-colliders.ts --input character.png [--sheet] --output outputs/character');
 const input=process.argv[inputIndex+1],output=outputIndex<0?'outputs/prepared-character':process.argv[outputIndex+1];
 const bytes=await readFile(input);if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Use a transparent PNG.');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(width>4096||height>4096)throw Error('Maximum image dimensions are 4096px.');
 const sheet=process.argv.includes('--sheet');if(sheet&&width!==height)throw Error('A 4x4 sheet must be square.');
 await mkdir(output,{recursive:true});const poses=[];
 for(let i=0;i<(sheet?16:1);i++){
  const cell=width/4,view=sheet?`${(i%4)*cell} ${Math.floor(i/4)*cell} ${cell} ${cell}`:undefined;
  const {geometry,png}=prepare(bytes,view);const image=`pose-${String(i+1).padStart(2,'0')}.png`;
  await writeFile(path.join(output,image),png);poses.push({name:`ポーズ ${i+1}`,image,...geometry});
 }
 await writeFile(path.join(output,'colliders.json'),JSON.stringify({version:'alpha-v1',poses},null,2)+'\n');
 console.log(`Prepared ${poses.length} image(s), collision shapes and centers of mass in ${output}.`);
}
