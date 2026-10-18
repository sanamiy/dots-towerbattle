import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {deliver,verifyCallback,CallbackEndpointError,destination} from '../lib/event-webhook';
const key=Buffer.alloc(32,7),secret='whsec_'+key.toString('base64');
const callback='https://chatgpt.com/mcp-events/test-callback';
test('webhook sends exactly the signed bytes with Worker-supported redirect handling',async()=>{
 const payload={eventId:'event-1',name:'turn.started',timestamp:new Date().toISOString(),data:{room_id:'TESTEVNT',turn_id:'turn-1',message:'あなたの番です。'},cursor:null};
 let calls=0;
 await deliver(callback,secret,'event-1','sub-1',payload,async(url,init)=>{
  calls++;assert.equal(String(url),callback);assert.equal(init!.redirect,'manual');
  const headers=new Headers(init!.headers),body=String(init!.body);
  assert.deepEqual(JSON.parse(body),payload);assert.equal(headers.get('webhook-id'),payload.eventId);
  assert.equal(headers.get('X-MCP-Subscription-Id'),'sub-1');
  const expected=createHmac('sha256',key).update(`event-1.${headers.get('webhook-timestamp')}.${body}`).digest('base64');
  assert.equal(headers.get('webhook-signature'),'v1,'+expected);
  return Response.json({});
 });
 assert.equal(calls,1);
});
test('callback verification requires a matching challenge and does not follow redirects',async()=>{
 await verifyCallback(callback,secret,'sub-1',async(_url,init)=>{
  const body=JSON.parse(String(init!.body));assert.equal(body.type,'verification');assert.ok(body.challenge);
  return Response.json({challenge:body.challenge});
 });
 for(const response of [Response.json({challenge:'wrong'}),new Response('not JSON'),new Response('',{status:403})])
  await assert.rejects(verifyCallback(callback,secret,'sub-1',async()=>response),e=>e instanceof CallbackEndpointError&&e.code===-32015&&e.reason==='challenge_failed');
 let calls=0;
 await assert.rejects(verifyCallback(callback,secret,'sub-1',async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://evil.example/steal'}})}),e=>e instanceof CallbackEndpointError&&e.reason==='redirect');
 assert.equal(calls,1);
});
test('callback connection failures have useful reasons without exposing callback URLs or secrets',async()=>{
 for(const [error,reason] of [[new DOMException('signed-url','TimeoutError'),'timeout'],[new Error(callback+secret),'unavailable']] as const)
  await assert.rejects(verifyCallback(callback,secret,'sub-1',async()=>{throw error}),e=>e instanceof CallbackEndpointError&&e.reason===reason&&!e.message.includes(callback)&&!e.message.includes(secret));
 for(const url of ['http://chatgpt.com/callback','https://chatgpt.com.evil.example/x','https://user:secret@chatgpt.com/x','https://127.0.0.1/x'])assert.throws(()=>destination(url));
});
