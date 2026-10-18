import { z } from 'zod';
import { database, errorResponse, readJson, requireIdentity, sameOrigin } from '@/lib/server';
import { D1Store } from '@/lib/game/store';
import { assert } from '@/lib/game/engine';
import { avatarInput, saveAvatar } from '@/lib/avatar-server';
import { validateCharacter } from '@/lib/game/characters';
const input=z.object({name:z.string().trim().min(1).max(24),poses:z.array(avatarInput).length(16)});
export async function POST(request:Request){try{sameOrigin(request);const user=await requireIdentity(),parsed=input.safeParse(await readJson(request,12_000_000));assert(parsed.success,'INVALID_POSE_SHEET','16枚のポーズと名前を確認してください。');const {name,poses}=parsed.data;
 // Validate every silhouette before uploading any frame.
 for(const p of poses)validateCharacter({...p.character,kind:'custom',name:'マイdot',color:'#a7c8ef'});
 const saved=[];for(let i=0;i<poses.length;i++)saved.push({...await saveAvatar(poses[i]),name:`ポーズ ${i+1}`});
 const profile={name,character:{...saved[0],name:'マイdot',poses:saved.map(({name,image,points,imageBounds})=>({name,image,points,imageBounds}))}};
 await new D1Store(database()).saveProfile(user.userId,profile);return Response.json({profile});
 }catch(e){return errorResponse(e);}}
