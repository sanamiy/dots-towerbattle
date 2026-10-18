import { POSE_PROMPT } from './pose-prompt';
import { z } from 'zod';
import type { Action, Profile, Room } from './types';
import type { RoomStore } from './store';
import { act, advance, assert, defaultProfile, GameError, join, leave, member, newRoom, publicRoom, rematch, start } from './engine';
import { preset } from './characters';
export type Identity={userId:string;displayName:string};
const roomId=z.string().trim().toUpperCase().regex(/^[A-Z2-9]{8}$/,'部屋IDは8文字の英数字です。');
const key=z.string().min(8).max(120);
const shape=z.enum(['mellow','pebble','sprout','puff']);
const common={room_id:roomId,command_id:key};
export const actionSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('move'),amount:z.number().min(-492).max(492)}).strict(),
 z.object({type:z.literal('rotate'),degrees:z.number().min(-360).max(360)}).strict(),
 z.object({type:z.literal('center')}).strict(),z.object({type:z.literal('reset_rotation')}).strict(),z.object({type:z.literal('drop')}).strict(),
]);
export const schemas={
 get_profile:z.object({}).strict(),
 get_pose_prompt:z.object({}).strict(),
 update_profile:z.object({name:z.string().trim().min(1).max(24),kind:shape.optional(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()}).strict(),
 create_room:z.object({command_id:key}).strict(),
 join_room:z.object({...common,passphrase:z.string().trim().min(1).max(64)}).strict(),
 get_room:z.object({room_id:roomId}).strict(),get_game_state:z.object({room_id:roomId}).strict(),
 set_ready:z.object({...common,ready:z.boolean()}).strict(),
 start_match:z.object(common).strict(),leave_room:z.object(common).strict(),rematch:z.object(common).strict(),rotate_invite:z.object(common).strict(),
 act:z.object({...common,turn_id:z.string().uuid(),expected_revision:z.number().int().min(0),actions:z.array(actionSchema).min(1).max(12)}).strict(),
};
export const toolDescriptions:Record<string,string>={
 get_pose_prompt:'同じdotの16ポーズを4×4画像で生成するための指示文を取得します。画像生成そのものはこのツールでは実行しません。対応する画像生成機能に本人の参照画像と一緒に渡し、完成したシートはゲーム画面から登録します。',
 get_profile:'自分の登録キャラクターと参加中の部屋を取得します。最初に呼んで既存の部屋を確認してください。',
 update_profile:'自分の表示名と仮キャラクターを設定します。画像登録はゲーム画面から行います。',
 create_room:'2〜4人用の招待部屋を作ります。明示的な部屋作成の指示がある場合だけ呼びます。同じcommand_idで再試行してください。',
 join_room:'招待文の部屋IDと合言葉で既存の部屋へ参加します。部屋が見つからなくても新規作成しません。',
 get_room:'参加中の部屋のメンバーと準備状態を取得します。',
 get_game_state:'盤面、全キャラクターの輪郭座標、手番、位置、角度、次の駒、残り時間を取得します。座標は画面右が+x、下が+y、角度はラジアンです。操作前に最新revisionとturnIdを確認します。',
 set_ready:'本人の準備完了状態を変更します。ユーザーが準備できたと言った時に呼びます。',
 start_match:'全員準備完了の2〜4人部屋をホストが開始します。',
 act:'自分の手番を操作します。右はmove amount:+24.6、左は-24.6、少しは±4.92、大きくは±73.8。回転はdegrees:+15、逆回転は-15。移動はピクセル、回転入力は度。dropは明示的な落下指示がある場合だけ、最後に追加します。相談だけでは操作しません。最新turn_idとexpected_revision、同じ再試行で変えないcommand_idが必要です。',
 leave_room:'部屋から退出します。試合中は本人の降参になります。',
 rematch:'終了した部屋をホストがロビーへ戻し、同じメンバーで再戦の準備をします。',
 rotate_invite:'ホストが入室用の合言葉を再発行します。以前の合言葉は使えなくなります。ロビー専用です。',
};
export async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
function code(length:number){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from(crypto.getRandomValues(new Uint8Array(length)),b=>chars[b%chars.length]).join('');}
export function invitation(origin:string,r:Room,pass:string){return `Dots Tower Battleで遊ぼう！\nゲーム：${origin}/?room=${r.id}\n\nDots Tower Battleプラグインを使って、次の既存の部屋に参加して。\n部屋ID：${r.id}\n合言葉：${pass}\n見つからない場合は新しい部屋を作らず教えて。\n未接続なら先にゲームのプラグインをインストール・接続する手順を案内して。\n登録済みキャラクターを使い、ゲーム画面のリンクを出して。私が「準備できた」と言ったら準備完了にして。\nポーズを増やしたい場合はget_pose_promptで4×4画像の生成指示を取得して。生成・登録は試合後でもよく、参加はそのまま進めて。\nこの試合中、私の「左」「右」「回転」「落として」を操作として実行して。相談だけでは動かさず、移動や回転だけの指示で落とさないで。\n手番と結果の通知をこの試合の間だけ購読して。終了したら解除して。`;}
export class GameService {
 constructor(public store:RoomStore,public origin:string,public now:()=>number=Date.now){}
 async getProfile(user:Identity){return await this.store.profile(user.userId)??defaultProfile(user.displayName.slice(0,24)||'プレイヤー');}
 async read(id:string,uid:string){
  for(let attempt=0;attempt<8;attempt++){
   const r=await this.store.read(id);assert(r,'ROOM_NOT_FOUND','部屋が見つかりません。IDを確認してください。',404);const me=member(r,uid);
   const old=r.revision;let changed=false;
   const now=this.now();
   if(now-me.connectedAt>=5000){me.connectedAt=now;changed=true;}
   if(r.phase==='aiming'){const active=r.players[r.active];
    if(active.userId===uid&&r.pauseUntil&&r.pauseUntil>now){r.deadline-=r.pauseUntil-now;r.pauseUntil=undefined;changed=true;}
    else if(active.userId!==uid&&now-active.connectedAt>8000&&!active.pauseUsed){active.pauseUsed=true;r.deadline=Math.max(r.deadline,now)+15000;r.pauseUntil=now+15000;changed=true;}
   }for(let n=0;n<2;n++)changed=advance(r,this.now())||changed;
   if(!changed)return r;r.revision++;r.updatedAt=this.now();if(await this.store.cas(r,old))return r;
  }throw new GameError('BUSY','更新が重なりました。もう一度お試しください。',409);
 }
 async mutate(id:string,uid:string,commandId:string,fingerprint:string,fn:(r:Room)=>void,expected?:number){
  for(let attempt=0;attempt<8;attempt++){
   const r=await this.store.read(id);assert(r,'ROOM_NOT_FOUND','部屋が見つかりません。',404);
   const previous=r.commands.find(c=>c.id===commandId&&c.userId===uid);
   if(previous){assert(previous.fingerprint===fingerprint,'COMMAND_REUSED','同じ操作IDを別の操作には使えません。',409);return r;}
   if(expected!==undefined)assert(r.revision===expected,'STALE_REVISION','盤面が更新されました。最新状態を確認して再操作してください。',409);
   const old=r.revision;fn(r);r.revision++;r.updatedAt=this.now();r.commands.push({id:commandId,userId:uid,fingerprint});r.commands=r.commands.slice(-256);
   if(await this.store.cas(r,old))return r;
  }throw new GameError('BUSY','更新が重なりました。もう一度お試しください。',409);
 }
 async call(name:string,raw:unknown,user:Identity):Promise<Record<string,unknown>>{
  const schema=schemas[name as keyof typeof schemas];assert(schema,'UNKNOWN_TOOL','不明な操作です。',404);
  const parsed=schema.safeParse(raw);assert(parsed.success,'INVALID_INPUT',parsed.success?'':parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(' / '));
  const a=parsed.data as Record<string,unknown>,now=this.now();
  if(name==='get_pose_prompt')return{prompt:POSE_PROMPT,upload_url:this.origin,message:'本人の参照画像とこのプロンプトで画像を生成し、ゲーム画面のキャラクター設定から4×4シートを登録してください。登録は次の試合から反映されます。'};
  if(name==='get_profile')return {profile:await this.getProfile(user),rooms:(await this.store.recent(user.userId)).filter(r=>r.players.some(p=>p.userId===user.userId)).map(r=>({id:r.id,phase:r.phase,url:`${this.origin}/?room=${r.id}`})),url:this.origin};
  if(name==='update_profile'){
   const old=await this.getProfile(user);const p:Profile={name:a.name as string,character:a.kind?preset(a.kind as string,a.color as string|undefined):{...old.character,...(a.color?{color:a.color as string}:{})}};
   await this.store.saveProfile(user.userId,p);return{profile:p};
  }
  if(name==='create_room'){
   const ck=await hash(`${user.userId}:${a.command_id}`),prior=await this.store.created(user.userId,ck);
   if(prior){const r=await this.read(prior,user.userId);return{room:publicRoom(r,user.userId,now),url:`${this.origin}/?room=${r.id}`,message:'既に作成済みです。合言葉を紛失した場合はホストが再発行してください。'};}
   const id=code(8),pass=code(12),r=newRoom(id,await hash(id+':'+pass),user.userId,await this.getProfile(user),now);
   try{await this.store.create(r,user.userId,ck);}catch(e){const prior=await this.store.created(user.userId,ck);if(prior)return{room:publicRoom(await this.read(prior,user.userId),user.userId,now),url:`${this.origin}/?room=${prior}`};throw e;}
   return{room:publicRoom(r,user.userId,now),passphrase:pass,invitation:invitation(this.origin,r,pass),url:`${this.origin}/?room=${id}`};
  }
  const id=a.room_id as string;
  if(name==='get_room'||name==='get_game_state'){const r=await this.read(id,user.userId);return{room:publicRoom(r,user.userId,this.now()),url:`${this.origin}/?room=${id}`,controls:{left:-24.6,right:24.6,small:4.92,large:73.8,rotationDegrees:15},message:r.phase==='aiming'?`${r.players[r.active].name}の番。残り${Math.max(0,Math.ceil((r.deadline-now)/1000))}秒。`:r.phase==='falling'?'着地判定中です。':r.phase==='finished'?'試合終了。':'ロビーで参加者を待っています。'};}
  const fingerprint=await hash(name+JSON.stringify(a));let pass:string|undefined;
  if(name==='join_room'){
   const existing=await this.store.read(id);assert(existing,'ROOM_NOT_FOUND','部屋が見つかりません。',404);
   if(!existing.players.some(p=>p.userId===user.userId))assert(await hash(id+':'+String(a.passphrase).toUpperCase())===existing.passwordHash,'WRONG_PASSPHRASE','合言葉が違います。',403);
   const profile=await this.getProfile(user);
   const passHash=await hash(id+':'+String(a.passphrase).toUpperCase());
   const r=await this.mutate(id,user.userId,a.command_id as string,fingerprint,r=>{if(!r.players.some(p=>p.userId===user.userId))assert(r.passwordHash===passHash,'WRONG_PASSPHRASE','合言葉が再発行されています。',403);join(r,user.userId,profile,now);});return{room:publicRoom(r,user.userId,now),url:`${this.origin}/?room=${id}`};
  }
  const startProfiles:Record<string,Profile>={};
  if(name==='start_match'){const snapshot=await this.store.read(id);for(const p of snapshot?.players??[]){const profile=await this.store.profile(p.userId);if(profile)startProfiles[p.userId]=profile;}}
  pass=name==='rotate_invite'?code(12):undefined;
  const nextHash=pass?await hash(id+':'+pass):undefined;
  const r=await this.mutate(id,user.userId,a.command_id as string,fingerprint,r=>{
   const p=member(r,user.userId);p.connectedAt=now;
   if(name==='act'&&r.players[r.active].userId===user.userId){if(r.pauseUntil&&r.pauseUntil>now)r.deadline-=r.pauseUntil-now;r.pauseUntil=undefined;p.idleTurns=0;}
   if(name==='set_ready'){assert(r.phase==='lobby','NOT_LOBBY','準備状態はロビーで変更できます。');assert(now-r.updatedAt<30*60_000,'ROOM_EXPIRED','この部屋は期限切れです。新しい部屋を作ってください。',410);p.ready=a.ready as boolean;}
   if(name==='start_match'){for(const p of r.players){const profile=startProfiles[p.userId];if(profile){p.name=profile.name;p.character=structuredClone(profile.character);}}start(r,user.userId,now);}
   if(name==='act')act(r,user.userId,a.turn_id as string,a.actions as Action[],now);
   if(name==='leave_room')leave(r,user.userId,now);
   if(name==='rematch')rematch(r,user.userId,now);
   if(name==='rotate_invite'){assert(r.phase==='lobby'&&r.hostId===user.userId,'HOST_ONLY','ロビーでホストが再発行できます。',403);assert(pass,'INTERNAL','合言葉を生成できませんでした。');r.passwordHash=nextHash!;}
  },name==='act'?a.expected_revision as number:undefined);
  if(name==='leave_room'&&r.phase==='lobby')return{left:true,url:this.origin};
  return{room:publicRoom(r,user.userId,now),url:`${this.origin}/?room=${id}`,applied:true,...(pass&&r.passwordHash===nextHash?{passphrase:pass,invitation:invitation(this.origin,r,pass)}:{})};
 }
}
