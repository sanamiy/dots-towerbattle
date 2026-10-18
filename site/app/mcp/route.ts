import { agentState } from '@/lib/agent-state';
import type { PublicRoom } from '@/lib/game/types';
import { schemaToJson } from '@/lib/json-schema';
import { errorResponse, gameService, readJson, requireIdentity } from '@/lib/server';
import { schemas, toolDescriptions } from '@/lib/game/service';
import { eventMethod, flushEvents } from '@/lib/events';
import { GameError } from '@/lib/game/engine';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 let id:unknown=null;
 try{
  const user=await requireIdentity(),body=await readJson(request);id=body.id;
  const method=body.method,params=body.params??{};let result:unknown;
  if(method==='notifications/initialized'||method==='notifications/cancelled')return new Response(null,{status:202});
  if(method==='server/discover')result={resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{},events:{}},serverInfo:{name:'dots-tower-battle',version:'1.0.0'},instructions:'ユーザーが招待されたらjoin_roomを使い、見つからなくても部屋を作らない。自分の操作だけ行う。移動だけの指示では落とさない。状態を取得し、最新turn_idとrevisionをactに渡す。状態のyは下向き、角度はラジアン、回転入力は度。command_idは操作ごとにUUIDを作り、再送時は同じ値にする。試合終了後はイベント購読を解除する。'};
  else if(method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'dots-tower-battle',version:'1.0.0'}};
  else if(method==='ping')result={};
  else if(method==='tools/list')result={tools:Object.entries(schemas).map(([name,schema])=>({name,title:name,description:toolDescriptions[name],inputSchema:schemaToJson(schema),annotations:{readOnlyHint:['get_profile','get_pose_prompt','get_room','get_game_state'].includes(name),destructiveHint:name==='leave_room',idempotentHint:true,openWorldHint:false}}))};
  else if(method.startsWith('events/'))result=await eventMethod(method,params,user,new URL(request.url).origin);
  else if(method==='tools/call'){
   try{const data=await gameService(request).call(params.name,params.arguments??{},user);if(params.arguments?.room_id)await flushEvents(params.arguments.room_id);const compact={...data,...(data.room?{room:agentState(data.room as PublicRoom)}:{})};result={content:[{type:'text',text:JSON.stringify(compact)}],structuredContent:compact,isError:false};}
   catch(e){if(!(e instanceof GameError))throw e;result={content:[{type:'text',text:JSON.stringify({error:{code:e.code,message:e.message},recover:e.status===409?'get_game_stateで最新状態を取得してください。':undefined})}],isError:true};}
  }else return Response.json({jsonrpc:'2.0',id:id??null,error:{code:-32601,message:'Method not found'}});
  return Response.json({jsonrpc:'2.0',id:id??null,result},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof GameError&&e.status===401)return errorResponse(e);console.error('MCP request failed',e instanceof Error?e.message:'unknown');return Response.json({jsonrpc:'2.0',id:id??null,error:{code:-32602,message:e instanceof GameError?e.message:'リクエストを処理できませんでした。'}});}
}
export async function GET(){return new Response('Use POST for stateless MCP requests.',{status:405,headers:{Allow:'POST'}});}
