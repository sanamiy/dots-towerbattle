import {contours} from 'd3-contour';
import simplify from 'simplify-js';
import {area,normalized} from './game/characters';
import {convexParts} from './game/collision-shape';
import type {Point} from './game/types';
/** Derive the same conservative silhouette on the client and server from actual PNG alpha. */
export function geometryFromPixels(rgba:ArrayLike<number>,width:number,height:number) {
 const size=256,mask=new Uint8Array(size*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const sx=Math.floor(x*width/size),sy=Math.floor(y*height/size);
  mask[y*size+x]=rgba[(sy*width+sx)*4+3]>=82?1:0;
 }
 // One pixel includes the fuzzy visible edge and closes tiny cracks between attached accessories.
 const dilated=mask.slice();
 for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++)if(mask[y*size+x])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)dilated[(y+dy)*size+x+dx]=1;
 const polygon=contours().size([size,size]).thresholds([.5])(Array.from(dilated))[0].coordinates
  .map(p=>p[0].slice(0,-1).map(([x,y])=>({x,y})))
  .sort((a,b)=>area(b)-area(a))[0];
 if(!polygon||area(polygon)<80)throw Error('体の輪郭を検出できません。透明背景の画像を使ってください。');
 let tolerance=.7,raw:Point[]=[];
 do {raw=simplify([...polygon,polygon[0]],tolerance,true);if(raw.length>1&&raw[0].x===raw[raw.length-1].x&&raw[0].y===raw[raw.length-1].y)raw.pop();tolerance*=1.2;}while(raw.length>80&&tolerance<8);
 while(raw.length<8){raw=raw.flatMap((p,i)=>{const q=raw[(i+1)%raw.length];return[p,{x:(p.x+q.x)/2,y:(p.y+q.y)/2}];});}
 if(raw.length>80)throw Error('輪郭が複雑すぎます。細かい飾りを減らしてください。');
 const points=normalized(raw),scale=82/Math.sqrt(area(raw));
 return {points,imageBounds:{x:points[0].x-raw[0].x*scale,y:points[0].y-raw[0].y*scale,width:size*scale,height:size*scale},collisionParts:convexParts(points),colliderVersion:'alpha-v1' as const};
}
