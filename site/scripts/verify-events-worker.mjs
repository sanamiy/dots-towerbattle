// Local-only Worker/D1 integration: callbacks are intercepted; no messages leave this test.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {Miniflare,Response as WorkerResponse} from 'miniflare';
const root=process.cwd(),dir=await mkdtemp(join(tmpdir(),'dots-events-'));
const key=Buffer.alloc(32,7),secret='whsec_'+key.toString('base64');
const received=[];let callbackMode='ok';
const code=`
import {env} from 'cloudflare:workers';
import {eventMethod,flushEvents} from ${JSON.stringify(resolve(root,'lib/events.ts'))};
import {after} from ${JSON.stringify(resolve(root,'node_modules/vinext/dist/shims/server.js'))};
import {runWithExecutionContext} from ${JSON.stringify(resolve(root,'node_modules/vinext/dist/shims/request-context.js'))};
import {newRoom,join,defaultProfile,emit,finish} from ${JSON.stringify(resolve(root,'lib/game/engine.ts'))};
import {D1Store} from ${JSON.stringify(resolve(root,'lib/game/store.ts'))};
export default {async fetch(request,env,ctx) {return runWithExecutionContext(ctx,async()=>{
 try {
  const a=await request.json(),store=new D1Store(env.DB),user={userId:a.user??'owner',displayName:'test dot'};
  if(a.action==='background'){after(async()=>{await new Promise(resolve=>setTimeout(resolve,2000));await env.DB.prepare("INSERT INTO profiles(user_id,data) VALUES ('after-proof','{}')").run();});return Response.json({queued:true});}
  if(a.action==='create') {const r=newRoom('TESTEVNT','hash','owner',defaultProfile('Owner'),Date.now());join(r,'other',defaultProfile('Other'),Date.now());await store.create(r,'owner','create-test');return Response.json({ok:true});}
  if(a.action==='emit'||a.action==='finish') {const r=await store.read('TESTEVNT'),rev=r.revision;
   if(a.action==='finish')finish(r,Date.now());
   else {emit(r,'turn.started','Owner turn',Date.now(),r.players[0].id);emit(r,'turn.started','Other turn',Date.now(),r.players[1].id);emit(r,'turn.resolved','Result',Date.now(),r.players[0].id);}
   r.revision++;await store.cas(r,rev);await flushEvents(r.id);return Response.json({ok:true});}
  if(a.action==='flush'){await flushEvents('TESTEVNT');return Response.json({ok:true});}
  const result=await eventMethod(a.method,a.params??{},user,'https://game.example');return Response.json({result});
 }catch(e){return Response.json({error:{code:e.code,reason:e.reason,message:e.message}});}
});}};`;
let mf;
try {
 await build({stdin:{contents:code,resolveDir:root,sourcefile:'events-worker-fixture.ts'},outfile:join(dir,'worker.mjs'),bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],plugins:[{name:'local-test-bindings',setup(b){b.onResolve({filter:/^\.\/server$/},a=>a.importer.endsWith('/lib/events.ts')?{path:'test-server',namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import {env} from 'cloudflare:workers';export function database(){return env.DB;}",loader:'js'}));}}]});
 mf=new Miniflare({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.mjs'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],outboundService:async(request)=>{
  const url=new URL(request.url);assert.equal(url.hostname,'chatgpt.com');
  const body=await request.text(),headers=request.headers,id=headers.get('webhook-id'),stamp=headers.get('webhook-timestamp');
  assert.equal(headers.get('webhook-signature'),'v1,'+createHmac('sha256',key).update(`${id}.${stamp}.${body}`).digest('base64'));
  assert.ok(headers.get('X-MCP-Subscription-Id'));
  const payload=JSON.parse(body);
  if(callbackMode==='redirect')return new WorkerResponse(null,{status:302,headers:{Location:'https://invalid.example/never-follow'}});
  if(payload.type==='verification')return WorkerResponse.json({challenge:payload.challenge});
  if(callbackMode==='unavailable')return new WorkerResponse(null,{status:503});
  assert.equal(id,payload.eventId);received.push({url:url.pathname,...payload});return new WorkerResponse(null,{status:204});
 }});
 const db=await mf.getD1Database('DB');
 for(const file of ['0000_high_norrin_radd.sql','0001_sad_susan_delgado.sql'])for(const sql of (await readFile(resolve(root,'drizzle',file),'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql.trim()).run();
 async function call(action,extra={}){const response=await mf.dispatchFetch('http://local.test/',{method:'POST',body:JSON.stringify({action,...extra})});assert.equal(response.status,200);return response.json();}
 assert.equal((await call('create')).ok,true);
 const backgroundStart=performance.now();assert.equal((await call('background')).queued,true);assert.ok(performance.now()-backgroundStart<1000,'Background work must not delay the HTTP response.');
 await new Promise(resolve=>setTimeout(resolve,2200));assert.ok(await db.prepare("SELECT user_id FROM profiles WHERE user_id='after-proof'").first(),'Background work must survive the response via waitUntil.');
 const params=(name,user='owner')=>({name,arguments:{room_id:'TESTEVNT'},delivery:{mode:'webhook',url:`https://chatgpt.com/mcp-events/${user}`,secret},ttlMs:60000});
 async function subscribe(name,user='owner'){return call('method',{user,method:'events/subscribe',params:params(name,user)});}
 const first=await subscribe('turn.started'),retry=await subscribe('turn.started');assert.ok(first.result?.id,JSON.stringify(first));assert.equal(retry.result.id,first.result.id);
 for(const name of ['turn.resolved','match.finished'])assert.ok((await subscribe(name)).result?.id);
 assert.ok((await subscribe('turn.started','other')).result?.id);
 assert.equal((await subscribe('turn.started','outsider')).error.code,'NOT_MEMBER');
 callbackMode='redirect';const rejected=await subscribe('turn.resolved','other');assert.equal(rejected.error.code,-32015);assert.equal(rejected.error.reason,'redirect');callbackMode='ok';
 assert.ok((await subscribe('turn.resolved','other')).result?.id);
 assert.deepEqual((await call('method',{user:'other',method:'events/unsubscribe',params:params('turn.resolved','other')})).result,{});
 assert.equal((await db.prepare('SELECT count(*) AS n FROM subscriptions').first()).n,4);
 callbackMode='unavailable';await call('emit');assert.equal(received.length,0);
 callbackMode='ok';await call('flush');assert.equal(received.length,3);
 assert.equal(received.filter(e=>e.url.endsWith('/owner')&&e.name==='turn.started').length,1);
 assert.equal(received.find(e=>e.url.endsWith('/owner')&&e.name==='turn.started').data.message,'Owner turn');
 assert.equal(received.find(e=>e.url.endsWith('/other')&&e.name==='turn.started').data.message,'Other turn');
 await call('flush');assert.equal(received.length,3,'Acknowledged events must not be sent again.');
 await call('finish');assert.equal(received.filter(e=>e.name==='match.finished').length,1);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM subscriptions').first()).n,0);
 console.log('Actual Cloudflare Worker runtime + D1: signed callback verification, idempotent subscription, member checks, redirect rejection, turn filtering, result delivery, transient failure recovery, non-blocking framework after()/waitUntil, unsubscribe, and match-end cleanup passed. Callbacks were local fixtures.');
} finally {await mf?.dispose();await rm(dir,{recursive:true,force:true});}
