import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { assert } from './game/engine';
import { validateCharacter } from './game/characters';
export const avatarInput=z.object({image:z.string().max(1_500_000).startsWith('data:image/png;base64,'),character:z.object({points:z.array(z.object({x:z.number(),y:z.number()})).min(8).max(80),imageBounds:z.object({x:z.number().min(-400).max(400),y:z.number().min(-400).max(400),width:z.number().positive().max(800),height:z.number().positive().max(800)})})});
export type AvatarInput=z.infer<typeof avatarInput>;
export async function saveAvatar(input:AvatarInput){
 const c={...input.character,kind:'custom',name:'マイdot',color:'#a7c8ef'};validateCharacter(c);assert(env.BUCKET,'STORAGE_UNAVAILABLE','画像ストレージへ接続できません。',503);
 const bytes=Uint8Array.from(atob(input.image.split(',')[1]),c=>c.charCodeAt(0));assert(bytes.length>32&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v),'INVALID_IMAGE','PNG画像を選んでください。');const view=new DataView(bytes.buffer);assert(view.getUint32(16)<=512&&view.getUint32(20)<=512,'INVALID_IMAGE','画像は512px以内にしてください。');
 const id=crypto.randomUUID();await env.BUCKET.put(`avatars/${id}.png`,bytes,{httpMetadata:{contentType:'image/png'}});return {...c,image:`/api/avatar/${id}`};
}
