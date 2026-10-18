import {MCP_URL} from './plugin-config';
import {GameError} from './game/engine';
export const MAX_CHARACTER_FILE_BYTES=8_000_000;
/** Limit signed file downloads to supported file CDNs; never send account credentials. */
export function characterFileUrl(value:string) {
 let url:URL;try{url=new URL(value);}catch{throw new GameError('INVALID_FILE_URL','ChatGPTから渡された実ファイルを選んでください。');}
 const host=url.hostname.toLowerCase();
 const gameSample=url.origin===new URL(MCP_URL).origin&&/^\/dots\/[a-z0-9/-]+\.png$/.test(url.pathname);
 const trusted=gameSample||host==='oaiusercontent.com'||host.endsWith('.oaiusercontent.com')||host==='files.openai.com'||/^oai[a-z0-9-]*\.blob\.core\.windows\.net$/.test(host)||host==='images.ctfassets.net';
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!trusted)
  throw new GameError('UNSUPPORTED_FILE_HOST','対応するChatGPTファイルの一時URLを渡してください。任意のWebサイトやローカルURLは取得しません。');
 return url;
}
export async function downloadCharacterFile(value:string,fetcher:typeof fetch=(input,init)=>fetch(input,init)) {
 const url=characterFileUrl(value),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10_000);
 try {
  const response=await fetcher(url.href,{redirect:'manual',signal:abort.signal});
  if(response.status>=300&&response.status<400)throw new GameError('FILE_REDIRECT','画像の直接ダウンロードURLを更新して渡してください。転送先は自動取得しません。');
  if(!response.ok||!response.body)throw new GameError('FILE_UNAVAILABLE','画像ファイルを取得できません。一時リンクを更新して、同じファイルを渡し直してください。');
  if(Number(response.headers.get('content-length')??0)>MAX_CHARACTER_FILE_BYTES)throw new GameError('FILE_TOO_LARGE','PNGは8MB以下にしてください。',413);
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_CHARACTER_FILE_BYTES){await reader.cancel();throw new GameError('FILE_TOO_LARGE','PNGは8MB以下にしてください。',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
 }catch(error){if(error instanceof GameError)throw error;throw new GameError('FILE_UNAVAILABLE','画像の一時リンクが失効したか、取得が完了しませんでした。実ファイルを渡し直してください。');}
 finally{clearTimeout(timer);}
}
