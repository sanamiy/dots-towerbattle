import {Resvg,initWasm} from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm?module';
let ready:Promise<void>|undefined;
export async function svgRenderer(svg:string) {
 await (ready??=initWasm(wasm).catch(error=>{if(!(error instanceof Error&&error.message.startsWith('Already initialized.')))throw error;}));
 return new Resvg(svg);
}
