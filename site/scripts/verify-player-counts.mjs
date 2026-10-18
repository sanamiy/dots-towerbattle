import {MCP_URL} from '../lib/plugin-config.ts';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
async function call(count,i,name,args){
 const response=await fetch(origin+'/mcp',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':`count-${count}-${i}`,'oai-authenticated-user-email':`count-${count}-${i}@sites.test`},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}})});
 const json=await response.json();assert.equal(response.status,200);assert.ok(json.result,json.error?.message);const data=JSON.parse(json.result.content[0].text);assert.equal(json.result.isError,false,JSON.stringify(data));return data;
}
await Promise.all([1,2,3].map(async count=>{
 const cmd=extra=>({command_id:crypto.randomUUID(),...extra});
 for(let i=0;i<count;i++)await call(count,i,'register_character_image',{name:`Player ${i}`,layout:'sheet_4x4',command_id:crypto.randomUUID(),file:{download_url:new URL('/dots/'+['felipe-16-poses-v2.png','iggy-16-poses-v1.png','todd-16-poses-v1.png'][i],MCP_URL).href,file_id:'file-local-count-fixture'}});
 const created=await call(count,0,'create_room',cmd({})),id=created.room.id;
 for(let i=1;i<count;i++)await call(count,i,'join_room',cmd({passphrase:created.passphrase}));
 for(let i=0;i<count;i++)await call(count,i,'set_ready',cmd({room_id:id,ready:true}));
 let state=(await call(count,0,'start_match',cmd({room_id:id}))).room;
 assert.equal(state.players.length,count);assert.equal(state.phase,'aiming');await sleep(3100);
 for(let turn=0;turn<Math.max(1,count-1);turn++){
  state=(await call(count,0,'get_game_state',{room_id:id})).room;
  const i=Number(state.players[state.active].name.split(' ')[1]);
  const dropped=(await call(count,i,'act',cmd({room_id:id,turn_id:state.turnId,expected_revision:state.revision,actions:[{type:'move',amount:492},{type:'drop'}]}))).room;
  assert.equal(dropped.phase,'falling');await sleep(dropped.flight.duration+1000);
  state=(await call(count,0,'get_game_state',{room_id:id})).room;
 }
 assert.equal(state.phase,'finished');
 assert.equal(state.players.filter(p=>p.alive).length,count===1?0:1);
 console.log(`${count} player(s): start without four, authoritative fall, and ${count===1?'practice completion':'one winner'} passed.`);
}));
