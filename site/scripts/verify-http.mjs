import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5173';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Synthetic identity testing is restricted to local previews.');
const headers=i=>({'Content-Type':'application/json','oai-authenticated-user-id':`qa-${i}`,'oai-authenticated-user-email':`qa-${i}@sites.test`});
async function mcp(i,name,args){const response=await fetch(`${origin}/mcp`,{method:'POST',headers:headers(i),body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}})});const json=await response.json();assert.equal(response.status,200);assert.ok(json.result,json.error?.message);return {error:json.result.isError,...JSON.parse(json.result.content[0].text)};}
const mutation=(room_id,extra={})=>({room_id,command_id:crypto.randomUUID(),...extra});
assert.equal((await fetch(`${origin}/api/game`)).status,401);
const discovery=await fetch(`${origin}/mcp`,{method:'POST',headers:headers(0),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'server/discover'})}).then(r=>r.json());assert.deepEqual(discovery.result.supportedVersions,['2026-07-28']);
for(let i=0;i<4;i++)assert.equal((await mcp(i,'update_profile',{name:`テストdot ${i+1}`,kind:['mellow','pebble','sprout','puff'][i]})).error,false);
const created=await mcp(0,'create_room',{command_id:crypto.randomUUID()}),id=created.room.id;
const joined=await Promise.all([1,2,3].map(i=>mcp(i,'join_room',mutation(id,{passphrase:created.passphrase}))));joined.forEach(r=>assert.equal(r.error,false));
assert.equal((await mcp(4,'join_room',mutation(id,{passphrase:created.passphrase}))).error.code,'ROOM_FULL');
for(let i=0;i<4;i++)assert.equal((await mcp(i,'set_ready',mutation(id,{ready:true}))).error,false);
assert.equal((await mcp(0,'start_match',mutation(id))).error,false);await sleep(3100);
let state=(await mcp(0,'get_game_state',{room_id:id})).room;assert.equal(state.players.length,4);
const uid=state.myId;
let actor=state.players[state.active],index=Number(actor.name.slice(-1))-1;
const args=mutation(id,{turn_id:state.turnId,expected_revision:state.revision,actions:[{type:'move',amount:4.92}]});
const intruder=await mcp((index+1)%4,'act',args);assert.equal(intruder.error.code,'NOT_YOUR_TURN');
const moved=await mcp(index,'act',args);assert.equal(moved.error,false);const replay=await mcp(index,'act',args);assert.equal(replay.room.preview.x,moved.room.preview.x);
for(let turn=0;turn<4;turn++){
 state=(await mcp(index,'get_game_state',{room_id:id})).room;
 actor=state.players[state.active];index=Number(actor.name.slice(-1))-1;
 const result=await mcp(index,'act',mutation(id,{turn_id:state.turnId,expected_revision:state.revision,actions:turn===0?[{type:'center'},{type:'drop'}]:[{type:'move',amount:492},{type:'drop'}]}));assert.equal(result.error,false);assert.equal(result.room.phase,'falling');
 await sleep(result.room.flight.duration+1000);
 state=(await mcp(index,'get_game_state',{room_id:id})).room;
 if(turn===0){assert.equal(state.pieces.length,1);assert.equal(state.lastResult.safe,true);}else{assert.equal(state.pieces.length,1);assert.equal(state.lastResult.safe,false);}
 console.log(`turn ${turn+1}: ${state.lastResult.text}`);
}
assert.equal(state.phase,'finished');assert.deepEqual(state.players.map(p=>p.rank).sort(),[1,2,3,4]);
console.log(JSON.stringify({result:'passed',transport:'actual HTTP MCP endpoint',players:4,room:id,unauthenticatedRejected:true,fifthRejected:true,otherPlayerRejected:true,duplicateAppliedOnce:true,completedMatch:true,oneWinner:true}));
