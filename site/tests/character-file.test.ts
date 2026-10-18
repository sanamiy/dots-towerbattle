import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterFileSchema} from '../lib/character-file-contract';
import {characterFileUrl,downloadCharacterFile,MAX_CHARACTER_FILE_BYTES} from '../lib/character-file-download';
import {schemaToJson} from '../lib/json-schema';
import {GameError} from '../lib/game/engine';

test('MCP file input declares all four host fields and requires only URL and file ID',()=>{
 const schema=schemaToJson(characterFileSchema) as any;
 assert.deepEqual(Object.keys(schema.properties.file.properties).sort(),['download_url','file_id','file_name','mime_type']);
 assert.deepEqual(schema.properties.file.required,['download_url','file_id']);
 assert.ok(characterFileSchema.safeParse({name:'dot',file:{download_url:'https://files.oaiusercontent.com/file',file_id:'file-123'},layout:'single',command_id:'import-123'}).success);
});
test('file download rejects arbitrary hosts, local URLs, credentials, ports and suffix tricks',()=>{
 for(const url of ['http://127.0.0.1/a','https://127.0.0.1/a','https://evil.example/a','https://files.oaiusercontent.com.evil.example/a','https://user:secret@files.oaiusercontent.com/a','https://files.oaiusercontent.com:444/a','file:///etc/passwd'])assert.throws(()=>characterFileUrl(url),GameError);
 assert.equal(characterFileUrl('https://files.oaiusercontent.com/a?temporary=signed').hostname,'files.oaiusercontent.com');
});
test('signed downloads use no account headers, disallow redirects, and preserve file bytes',async()=>{
 const bytes=Uint8Array.from([137,80,78,71]);
 const fetcher:typeof fetch=async(input,init)=>{
  assert.equal(new URL(String(input)).hostname,'files.oaiusercontent.com');
  assert.equal(init?.redirect,'manual');assert.equal(init?.headers,undefined);
  return new Response(bytes);
 };
 assert.deepEqual(await downloadCharacterFile('https://files.oaiusercontent.com/file',fetcher),bytes);
});
test('file download enforces both announced and streamed byte limits without echoing signed URLs',async()=>{
 const url='https://files.oaiusercontent.com/file?private-token=do-not-echo';
 await assert.rejects(downloadCharacterFile(url,async()=>new Response('x',{headers:{'Content-Length':String(MAX_CHARACTER_FILE_BYTES+1)}})),e=>e instanceof GameError&&e.code==='FILE_TOO_LARGE');
 await assert.rejects(downloadCharacterFile(url,async()=>new Response(new Uint8Array(MAX_CHARACTER_FILE_BYTES+1))),e=>e instanceof GameError&&e.code==='FILE_TOO_LARGE');
 await assert.rejects(downloadCharacterFile(url,async()=>{throw Error(url)}),e=>e instanceof GameError&&!e.message.includes('private-token'));
});


test('simultaneous image preparation runs in order, bounds peak work and releases failed jobs',async()=>{
 const {serialWork}=await import('../lib/serial-work');
 const run=serialWork();let active=0,peak=0;const order:number[]=[];
 const jobs=Array.from({length:4},(_,i)=>run(async()=>{
  active++;peak=Math.max(peak,active);order.push(i);
  try {await new Promise(resolve=>setTimeout(resolve,5));if(i===1)throw new Error('invalid image');return i;}
  finally {active--;}
 }));
 const results=await Promise.allSettled(jobs);
 assert.equal(peak,1);assert.deepEqual(order,[0,1,2,3]);
 assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected','fulfilled','fulfilled']);
});
