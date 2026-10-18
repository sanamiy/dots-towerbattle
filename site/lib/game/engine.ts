import { preset } from './characters';
import { simulate } from './physics';
import { TURN_MS, MATCH_MS, type Room, type Player, type Profile, type Action, type PublicRoom, type GameEvent } from './types';
export class GameError extends Error { constructor(public code: string, message: string, public status=400){super(message);} }
export function assert(condition: unknown, code: string, text: string, status=400): asserts condition { if(!condition) throw new GameError(code,text,status); }
export function emit(r:Room,name:GameEvent['name'],text:string,now:number,playerId?:string){r.eventSeq++;r.events.push({seq:r.eventSeq,id:crypto.randomUUID(),name,text,at:now,turnId:r.turnId,playerId});r.events=r.events.slice(-64);}
export function newRoom(id:string,passwordHash:string,userId:string,profile:Profile,now:number):Room {
  return {id,passwordHash,revision:0,hostId:userId,phase:'lobby',players:[newPlayer(userId,profile,now)],createdAt:now,updatedAt:now,turnId:'',turnNumber:0,active:0,deadline:0,pieces:[],queue:[],poseQueues:{},rng:crypto.getRandomValues(new Uint32Array(1))[0]||1,commands:[],events:[],eventSeq:0,maxHeight:0};
}
export function newPlayer(userId:string,profile:Profile,now:number):Player{return{id:crypto.randomUUID(),userId,name:profile.name,character:structuredClone(profile.character),ready:false,alive:true,successes:0,connectedAt:now,pauseUsed:false,idleTurns:0};}
export function member(r:Room,userId:string){const p=r.players.find(p=>p.userId===userId);assert(p,'NOT_MEMBER','この部屋に参加してから操作してください。',403);return p;}
export function join(r:Room,userId:string,profile:Profile,now:number){if(r.players.some(p=>p.userId===userId))return;assert(r.phase==='lobby','ALREADY_STARTED','試合開始後は新しく参加できません。');assert(now-r.updatedAt<30*60_000,'ROOM_EXPIRED','この部屋の入室期限が切れました。',410);assert(r.players.length<4,'ROOM_FULL','この部屋は4人で満員です。',409);r.players.push(newPlayer(userId,profile,now));}
function random(r:Room){let s=r.rng;s^=s<<13;s^=s>>>17;s^=s<<5;r.rng=s>>>0;return r.rng/4294967296;}
function refill(r:Room){if(r.queue.length)return;r.queue=r.players.map((_,i)=>i);for(let i=r.queue.length-1;i>0;i--){const j=Math.floor(random(r)*(i+1));[r.queue[i],r.queue[j]]=[r.queue[j],r.queue[i]];}}
export function drawPose(r:Room,index:number){
 const c=structuredClone(r.players[index].character),poses=c.poses;delete c.poses;
 if(!poses?.length)return c;
 const key=r.players[index].id;const q=r.poseQueues[key]??[];
 if(!q.length){for(let i=0;i<poses.length;i++)q.push(i);for(let i=q.length-1;i>0;i--){const j=Math.floor(random(r)*(i+1));[q[i],q[j]]=[q[j],q[i]];}}
 const i=q.shift()!;r.poseQueues[key]=q;return{...c,...poses[i],kind:c.kind+':pose-'+i};
}
export function nextTurn(r:Room,now:number){
  if(r.players.filter(p=>p.alive).length<=1||now-(r.startedAt??now)>=MATCH_MS||r.pieces.length>=48){finish(r,now);return;}
  refill(r);const ci=r.queue.shift()!;refill(r);
  const top=Math.min(0,...r.pieces.flatMap(p=>p.character.points.map(v=>p.y+v.x*Math.sin(p.angle)+v.y*Math.cos(p.angle))));
  const character=drawPose(r,ci);const bottom=Math.max(...character.points.map(p=>p.y));
  r.preview={id:crypto.randomUUID(),character,x:0,y:top-123-bottom,angle:0};
  r.phase='aiming';r.pauseUntil=undefined;r.turnId=crypto.randomUUID();r.turnNumber++;r.deadline=now+TURN_MS;r.flight=undefined;
  emit(r,'turn.started',`${r.players[r.active].name}の番です。`,now,r.players[r.active].id);
}
export function start(r:Room,userId:string,now:number){assert(r.hostId===userId,'HOST_ONLY','ホストだけが開始できます。',403);assert(r.phase==='lobby','ALREADY_STARTED','試合は既に開始されています。');assert(r.players.length>=2,'NEED_PLAYERS','2〜4人が集まると開始できます。');assert(r.players.every(p=>p.ready),'NOT_READY','全員を準備完了にしてください。');for(let i=r.players.length-1;i>0;i--){const j=Math.floor(random(r)*(i+1));[r.players[i],r.players[j]]=[r.players[j],r.players[i]];}r.startedAt=now+3000;r.active=0;nextTurn(r,now+3000);}
export function finish(r:Room,now:number){r.phase='finished';r.completedAt=now;r.preview=undefined;r.flight=undefined;for(const p of r.players.filter(p=>p.alive))p.rank=1;emit(r,'match.finished','試合が終了しました。',now);}
export function eliminate(r:Room,p:Player){if(!p.alive)return;p.rank=r.players.filter(p=>p.alive).length;p.alive=false;}
export function drop(r:Room,now:number){assert(r.preview,'NO_PREVIEW','落とす駒がありません。');r.flight=simulate(r.pieces,r.preview,now,r.players[r.active].id);r.phase='falling';}
export function advance(r:Room,now:number){
  if(r.phase==='aiming'&&now>=r.deadline){const p=r.players[r.active];p.idleTurns=r.deadline-p.connectedAt>8000?p.idleTurns+1:0;drop(r,r.deadline);if(p.idleTurns>=2){r.flight!.safe=false;r.flight!.forfeit=true;r.flight!.reason='接続が戻らなかったため降参しました。';}return true;}
  if(r.phase==='falling'&&r.flight&&now>=r.flight.startedAt+r.flight.duration+900){
    const f=r.flight,p=r.players.find(p=>p.id===f.playerId)!;if(f.safe){r.pieces=f.final;p.successes++;r.maxHeight=Math.max(r.maxHeight,-Math.min(...r.pieces.flatMap(p=>p.character.points.map(v=>p.y+v.x*Math.sin(p.angle)+v.y*Math.cos(p.angle))))/82);}else eliminate(r,p);
    r.lastResult={safe:f.safe,text:f.safe?`${p.name}、セーフ！`:`${p.name}が脱落。${f.reason}`,playerId:p.id};emit(r,'turn.resolved',r.lastResult.text,now,p.id);
    if(r.players.filter(p=>p.alive).length<=1){finish(r,now);return true;}
    do{r.active=(r.active+1)%r.players.length;}while(!r.players[r.active].alive);
    nextTurn(r,now);return true;
  }return false;
}
export function act(r:Room,userId:string,turnId:string,actions:Action[],now:number){
  const p=member(r,userId);assert(r.phase==='aiming','NOT_AIMING','今は位置を変更できません。',409);assert(now>=(r.startedAt??0),'COUNTDOWN','開始カウントダウン中です。',409);assert(r.turnId===turnId,'STALE_TURN','手番が変わりました。最新の状態を取得してください。',409);assert(r.players[r.active].id===p.id&&p.alive,'NOT_YOUR_TURN','今はあなたの番ではありません。',403);assert(now<r.deadline,'TURN_EXPIRED','操作時間が終了しました。',409);assert(actions.length>0&&actions.length<=12,'BAD_ACTION','操作は1〜12個にしてください。');
  for(let i=0;i<actions.length;i++){const a=actions[i];if(a.type==='drop')assert(i===actions.length-1,'DROP_LAST','落下は最後の操作にしてください。');else if(a.type==='move')assert(Number.isFinite(a.amount)&&Math.abs(a.amount)<=492,'BAD_MOVE','移動量は-492〜492の数値です。');else if(a.type==='rotate')assert(Number.isFinite(a.degrees)&&Math.abs(a.degrees)<=360,'BAD_ROTATION','角度は-360〜360度です。');else assert(a.type==='center'||a.type==='reset_rotation','BAD_ACTION','不明な操作です。');}
  for(const a of actions){if(a.type==='move')r.preview!.x=Math.max(-328,Math.min(328,r.preview!.x+a.amount));if(a.type==='rotate')r.preview!.angle=(r.preview!.angle+a.degrees*Math.PI/180)%(Math.PI*2);if(a.type==='center')r.preview!.x=0;if(a.type==='reset_rotation')r.preview!.angle=0;if(a.type==='drop')drop(r,now);}
}
export function leave(r:Room,userId:string,now:number){const p=member(r,userId);if(r.phase==='lobby'){r.players=r.players.filter(x=>x!==p);if(r.hostId===userId&&r.players.length)r.hostId=r.players[0].userId;return;}assert(r.phase!=='falling','WAIT_FOR_LANDING','着地判定が終わってから降参してください。',409);if(r.phase==='finished')return;eliminate(r,p);if(r.players.filter(p=>p.alive).length<=1){finish(r,now);return;}if(r.players[r.active].id===p.id){do{r.active=(r.active+1)%r.players.length;}while(!r.players[r.active].alive);nextTurn(r,now);}}
export function rematch(r:Room,userId:string,now:number){assert(r.hostId===userId,'HOST_ONLY','ホストだけが再戦を準備できます。',403);assert(r.phase==='finished','NOT_FINISHED','試合終了後に再戦できます。');r.phase='lobby';r.players.forEach(p=>{p.ready=false;p.alive=true;p.rank=undefined;p.successes=0;p.pauseUsed=false;p.idleTurns=0;});r.pieces=[];r.preview=undefined;r.flight=undefined;r.startedAt=undefined;r.completedAt=undefined;r.deadline=0;r.turnNumber=0;r.queue=[];r.poseQueues={};r.maxHeight=0;r.lastResult=undefined;r.updatedAt=now;}
function withoutPoses(c:Profile['character']){const {poses,...rest}=c;void poses;return rest;}
function peek(r:Room){const copy=structuredClone(r);const index=copy.queue.shift();if(index===undefined)return undefined;refill(copy);return drawPose(copy,index);}
export function publicRoom(r:Room,userId:string,now:number):PublicRoom{const me=member(r,userId);const {passwordHash,hostId,rng,queue,poseQueues,commands,players,...rest}=r;void passwordHash;void rng;void poseQueues;void commands;return {...rest,players:players.map(({userId:uid,...p})=>({...p,character:withoutPoses(p.character),poseCount:p.character.poses?.length??1,self:uid===userId,host:uid===hostId})),myId:me.id,nextCharacter:r.phase==='aiming'?peek(r):undefined,serverTime:now};}
export const defaultProfile=(name='プレイヤー'):Profile=>({name,character:preset('mellow')});
