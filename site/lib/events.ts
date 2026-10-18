import { database } from './server';
import { hash, GameService, type Identity } from './game/service';
import { D1Store } from './game/store';
import { assert } from './game/engine';
import type { GameEvent, Room } from './game/types';
const eventNames=['turn.started','turn.resolved','match.finished'] as const;
function destination(raw:unknown){assert(typeof raw==='string','INVALID_CALLBACK','コールバックURLが必要です。');const url=new URL(raw);assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(['chatgpt.com','openai.com'].some(d=>url.hostname===d||url.hostname.endsWith('.'+d))),'INVALID_CALLBACK','OpenAIのHTTPSコールバックURLだけ利用できます。');return url.href;}
function decode(raw:string){assert(typeof raw==='string'&&raw.startsWith('whsec_'),'INVALID_SECRET','署名キーの形式が不正です。');try{const bytes=Uint8Array.from(atob(raw.slice(6)),c=>c.charCodeAt(0));assert(bytes.length>=24&&bytes.length<=64,'INVALID_SECRET','署名キーの長さが不正です。');return bytes;}catch{throw new Error('署名キーを読み取れません。');}}
async function deliver(url:string,secret:string,id:string,subId:string,payload:unknown){const body=JSON.stringify(payload),stamp=String(Math.floor(Date.now()/1000));const key=await crypto.subtle.importKey('raw',decode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${id}.${stamp}.${body}`)));const sig=btoa(String.fromCharCode(...mac));return fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(2500),headers:{'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':stamp,'webhook-signature':`v1,${sig}`,'X-MCP-Subscription-Id':subId},body});}
export function listEvents(){return {events:eventNames.map(name=>({name,description:name==='turn.started'?'参加中の試合で本人の手番が始まりました。':name==='turn.resolved'?'参加中の試合の着地判定が確定しました。':'参加中の試合が終了しました。',delivery:['webhook'],inputSchema:{type:'object',properties:{room_id:{type:'string',description:'参加中の部屋ID'}},required:['room_id'],additionalProperties:false},payloadSchema:{type:'object',properties:{room_id:{type:'string'},turn_id:{type:'string'},message:{type:'string'}},required:['room_id','turn_id','message'],additionalProperties:false}}))};}
export async function eventMethod(method:string,params:Record<string,any>,user:Identity,origin:string){
 if(method==='events/list')return listEvents();
 assert(eventNames.includes(params.name),'UNKNOWN_EVENT','不明なイベントです。');const roomId=String(params.arguments?.room_id??'');const r=await new GameService(new D1Store(database()),origin).read(roomId,user.userId);
 const url=destination(params.delivery?.url),id=(await hash(JSON.stringify([user.userId,url,params.name,roomId]))).slice(0,40);
 if(method==='events/unsubscribe'){await database().prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').bind(id,user.userId).run();return{};}
 assert(method==='events/subscribe','METHOD_NOT_FOUND','不明なイベントメソッドです。');assert(r.phase!=='finished','MATCH_FINISHED','終了した試合は購読できません。');
 const secret=String(params.delivery?.secret??'');decode(secret);const challenge=crypto.randomUUID(),verification=await deliver(url,secret,crypto.randomUUID(),id,{type:'verification',challenge});
 assert(verification.ok,'CALLBACK_FAILED','コールバックの検証に失敗しました。');const result=await verification.json() as {challenge?:string};assert(result.challenge===challenge,'CALLBACK_FAILED','コールバックの応答が一致しません。');
 const ttl=typeof params.ttlMs==='number'?Math.max(1000,Math.min(30*60_000,params.ttlMs)):30*60_000,expiresAt=Date.now()+ttl;
 await database().prepare('INSERT INTO subscriptions (id, user_id, room_id, event, url, secret, expires_at, cursor) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET secret = excluded.secret, expires_at = excluded.expires_at').bind(id,user.userId,roomId,params.name,url,secret,expiresAt,r.eventSeq).run();
 return{id,refreshBefore:new Date(expiresAt).toISOString(),cursor:null,truncated:false};
}
export async function flushEvents(roomId:string){
 const db=database();const row=await db.prepare('SELECT data FROM rooms WHERE id = ?').bind(roomId).first<{data:string}>();if(!row)return;const room=JSON.parse(row.data) as Room;
 const subs=await db.prepare('SELECT * FROM subscriptions WHERE room_id = ? AND expires_at > ?').bind(roomId,Date.now()).all<{id:string;user_id:string;event:string;url:string;secret:string;cursor:number}>();
 await Promise.allSettled(subs.results.map(async sub=>{
  const player=room.players.find(p=>p.userId===sub.user_id);if(!player){await db.prepare('DELETE FROM subscriptions WHERE id = ?').bind(sub.id).run();return;}
  const pending=room.events.filter(e=>e.seq>sub.cursor&&e.name===sub.event&&(e.name!=='turn.started'||e.playerId===player.id));
  for(const e of pending){const response=await deliver(destination(sub.url),sub.secret,e.id,sub.id,{eventId:e.id,name:e.name,timestamp:new Date(e.at).toISOString(),data:{room_id:roomId,turn_id:e.turnId,message:e.text},cursor:null});if(!response.ok){if([410,413].includes(response.status))await db.prepare('DELETE FROM subscriptions WHERE id = ?').bind(sub.id).run();return;}await db.prepare('UPDATE subscriptions SET cursor = max(cursor, ?) WHERE id = ?').bind(e.seq,sub.id).run();}
  if(room.phase==='finished')await db.prepare('DELETE FROM subscriptions WHERE id = ?').bind(sub.id).run();
 }));
}
