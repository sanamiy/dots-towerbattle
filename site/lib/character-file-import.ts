import {serialWork} from './serial-work';
import {POSE_PROMPT} from "./game/pose-prompt";
import {env} from 'cloudflare:workers';
import {characterFileSchema} from './character-file-contract';
import {downloadCharacterFile} from './character-file-download';
import {geometryFromPixels} from './avatar-geometry';
import {svgRenderer} from './svg-runtime';
import {assert,GameError} from './game/engine';
import {validateCharacter} from './game/characters';
import {D1Store} from './game/store';
import {database} from './server';
import type {Identity} from './game/service';
import type {Character} from './game/types';

async function digest(value:BufferSource) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');}
function uuid(hex:string) {return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;}
// Resvg shares one WASM heap per isolate. Concurrent 2048px sheets can exceed Worker memory.
const registerSerially = serialWork();
export async function importCharacterFile(raw:unknown,user:Identity) {
 return registerSerially(() => importOneCharacterFile(raw,user));
}
async function importOneCharacterFile(raw:unknown,user:Identity) {
 const parsed=characterFileSchema.safeParse(raw);
 assert(parsed.success,'INVALID_INPUT','名前、実ファイル、singleまたはsheet_4x4を確認してください。');
 const {file,name,layout}=parsed.data;
 assert(env.BUCKET,'STORAGE_UNAVAILABLE','画像ストレージへ接続できません。',503);
 const bytes=await downloadCharacterFile(file.download_url);
 assert(bytes.length>32&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v),'INVALID_IMAGE','透明背景のPNGを渡してください。');
 const view=new DataView(bytes.buffer),width=view.getUint32(16),height=view.getUint32(20);
 assert(width>0&&height>0&&width<=2048&&height<=2048,'INVALID_IMAGE','画像の縦横は2048px以内にしてください。');
 assert(layout!=='sheet_4x4'||width===height,'INVALID_POSE_SHEET','4×4シートは正方形にしてください。');
 const hash=await digest(bytes.buffer),data=`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
 const prepared:{id:string,png:Uint8Array,character:Character}[]=[];
 for(let i=0;i<(layout==='sheet_4x4'?16:1);i++) {
  const cell=width/4,box=layout==='sheet_4x4'?`${i%4*cell} ${Math.floor(i/4)*cell} ${cell} ${cell}`:`0 0 ${width} ${height}`;
  const renderer=await svgRenderer(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${box}"><image href="${data}" width="${width}" height="${height}"/></svg>`);
  try {
   const result=renderer.render();
   try {
    const pixels=result.pixels;let transparent=0;for(let p=3;p<pixels.length;p+=4)if(pixels[p]<82)transparent++;
    assert(transparent>512*512*.05,'OPAQUE_BACKGROUND',`${i+1}番目の画像に透明背景がありません。背景を透明にして生成し直してください。`);
    const character:Character={kind:'custom',name:'マイdot',color:'#a7c8ef',...geometryFromPixels(pixels,512,512)};
    validateCharacter(character);
    const id=uuid(await digest(new TextEncoder().encode(`${user.userId}:${hash}:${layout}:${i}`)));
    prepared.push({id,png:Uint8Array.from(result.asPng()),character:{...character,image:`/api/avatar/${id}`}});
   }finally{result.free();}
  }catch(error){if(error instanceof GameError)throw error;throw new GameError('INVALID_POSE_IMAGE',`${i+1}番目の輪郭を作れません。体がつながった透明PNGを使ってください。`);}
  finally{renderer.free();}
 }
 // Validate every cell before uploading or changing the profile. Deterministic keys make retries stable.
 for(const p of prepared)await env.BUCKET.put(`avatars/${p.id}.png`,p.png,{httpMetadata:{contentType:'image/png'}});
 const character:Character={...prepared[0].character,...(prepared.length===16?{poses:prepared.map((p,i)=>{const {kind,color,...pose}=p.character;void kind;void color;return {...pose,name:`ポーズ ${i+1}`,image:p.character.image!};})}:{})};
 const store = new D1Store(database()), old = await store.profile(user.userId);
 const poseReadyAt = prepared.length === 16 ? (old && old.character.image === character.image && old.poseReadyAt !== undefined ? old.poseReadyAt : Date.now()) : undefined;
 await store.saveProfile(user.userId,{name,character,poseReadyAt});
 return {registered:true,pose_ready_at:poseReadyAt,pose_count:prepared.length,pose_preparation:{required_count:16,registered_count:prepared.length,status:prepared.length===16?'complete':'required'},applies_from:'next_turn',preview_image:character.image,...(prepared.length===1?{next_action:'start_pose_generation_now',generation_prompt:POSE_PROMPT,generation_policy:{start:'immediately_after_single_registration',required_count:16,play_while_generating:true}}:{}),message:prepared.length===1?'最初の1枚を登録しました。この返答の直後に16ポーズの背景生成を開始してください。ゲーム開始や相手の手番を待たず、生成タスクを先に起動してから入室・準備を続けます。背景生成が使えない場合は理由を伝え、開始済みと偽りません。':'16ポーズを登録しました。初回の手番は登録完了順です。get_game_stateで部屋を確認してください。次の手番から使い、既に置かれた駒は変更しません。'};
}
