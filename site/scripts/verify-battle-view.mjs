import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5173';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const headers=(i)=>({'Content-Type':'application/json','oai-authenticated-user-id':`vision-qa-${i}`,'oai-authenticated-user-email':`vision-qa-${i}@sites.test`});
async function call(i,name,args){const r=await fetch(`${origin}/mcp`,{method:'POST',headers:headers(i),body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}})});const d=await r.json();assert.ok(d.result,d.error?.message);return d.result;}
const created=await call(0,'create_room',{command_id:crypto.randomUUID()});const c=JSON.parse(created.content[0].text);const room_id=c.room.id;
const denied=await call(1,'get_battle_view',{room_id});assert.equal(denied.isError,true);
let view=await call(0,'get_battle_view',{room_id});assert.equal(view.isError,false);const png=view.content.find(c=>c.type==='image');assert.equal(png.mimeType,'image/png');
const bytes=Buffer.from(png.data,'base64');assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),720);
await writeFile('outputs/battle-view-mcp.png',bytes);
const anonymous=await fetch(`${origin}/api/battle-view?room=${room_id}`);assert.equal(anonymous.status,401);
const outside=await fetch(`${origin}/api/battle-view?room=${room_id}`,{headers:headers(1)});assert.equal(outside.status,403);
const image=await fetch(`${origin}/api/battle-view?room=${room_id}`,{headers:headers(0)});assert.equal(image.status,200);assert.match(image.headers.get('cache-control'),/private.*no-store/);
console.log('MCP returns a real 960x720 PNG; room membership and private HTTP access enforced.');
