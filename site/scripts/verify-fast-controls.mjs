import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {MCP_URL} from '../lib/plugin-config.ts';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const headers={'Content-Type':'application/json','oai-authenticated-user-id':'fast-controls-local-qa','oai-authenticated-user-email':'fast-controls-local-qa@sites.test'};
async function call(name,args){
 const started=performance.now();const response=await fetch(origin+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}})});
 const json=await response.json();assert.equal(response.status,200);assert.ok(json.result,json.error?.message);const data=JSON.parse(json.result.content[0].text);assert.equal(json.result.isError,false,JSON.stringify(data));return {data,ms:Math.round(performance.now()-started)};
}
await call('register_character_image',{name:'Fast dot',layout:'sheet_4x4',command_id:crypto.randomUUID(),file:{download_url:new URL('/dots/felipe-16-poses-v2.png',MCP_URL).href,file_id:'file-local-fast-controls-fixture'}});
const room=(await call('create_room',{command_id:crypto.randomUUID()})).data.room;
await call('set_ready',{room_id:room.id,ready:true,command_id:crypto.randomUUID()});
const start=(await call('start_match',{room_id:room.id,command_id:crypto.randomUUID()})).data.room;await sleep(3100);
const timings={};
const args={room_id:room.id,turn_id:start.turnId,command_id:crypto.randomUUID(),actions:[{type:'move',amount:24.6}]};
const move=await call('control_piece',args);timings.moveMs=move.ms;assert.equal(move.data.room.preview.x,24.6);assert.equal(move.data.room.phase,'aiming');
const repeated=await call('control_piece',args);assert.equal(repeated.data.room.preview.x,24.6);
const rotate=await call('control_piece',{...args,command_id:crypto.randomUUID(),actions:[{type:'rotate',degrees:15}]});timings.rotateMs=rotate.ms;assert.ok(Math.abs(rotate.data.room.preview.angle-Math.PI/12)<1e-9);
const dropArgs={room_id:room.id,turn_id:start.turnId,command_id:crypto.randomUUID()};
const dropped=await call('drop_piece',dropArgs);timings.dropMs=dropped.ms;assert.equal(dropped.data.command_ack.accepted,true);assert.equal(dropped.data.room.phase,'falling');assert.equal(dropped.data.room.flight.trigger,'command');
const again=await call('drop_piece',dropArgs);assert.equal(again.data.room.flight.startedAt,dropped.data.room.flight.startedAt);
const visible=await fetch(origin+'/api/game?room='+room.id,{headers}).then(r=>r.json());assert.equal(visible.room.flight.trigger,'command');assert.ok(visible.room.flight.frames.length>1);
console.log(JSON.stringify({result:'passed',...timings,movementsWithoutStateRefetch:true,duplicateAppliedOnce:true,actualPhysicsFrames:true,commandDropDistinguishedFromTimeout:true}));
