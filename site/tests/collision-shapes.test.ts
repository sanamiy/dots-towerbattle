import {test} from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import {CHARACTERS,area,validateCharacter} from '../lib/game/characters';
import {characterBody,maxPenetration,simulate} from '../lib/game/physics';
import type {Piece} from '../lib/game/types';

test('every sample pose has its own area-preserving collider centered on its mass',()=>{
 const images=new Set<string>();
 for(const character of CHARACTERS){
  assert.equal(character.poses?.length,16);
  for(const pose of character.poses!){
   const c={...character,...pose};delete c.poses;
   validateCharacter(c);
   assert.ok(c.image);images.add(c.image!);
   const p:Piece={id:'pose',character:c,x:37,y:-94,angle:.73};
   const body=characterBody(p);
   assert.ok(Math.abs(body.area-area(c.points))<1e-6,'convex decomposition must not drop parts');
   const center=Matter.Vertices.centre(c.points);
   assert.ok(Math.hypot(center.x,center.y)<1e-8,'uniform-density centroid must be the origin');
   assert.ok(c.imageBounds && c.collisionParts?.length);
   assert.ok(Math.abs(c.collisionParts!.reduce((s,p)=>s+area(p),0)-area(c.points))<1e-6);
  }
 }
 assert.equal(images.size,64,'four distinct character sets, each with sixteen images');
});
test('safe mixed-character stacks contain no penetration above the solver tolerance',()=>{
 let pieces:Piece[]=[];
 for(let i=0;i<4;i++){
  const c=CHARACTERS[i],pose=c.poses![0];
  const character={...c,...pose};delete character.poses;
  const top=Math.min(0,...pieces.flatMap(p=>p.character.points.map(v=>p.y+v.x*Math.sin(p.angle)+v.y*Math.cos(p.angle))));
  const previews=[0,-130,130,-65,65,-180,180].map(x=>({id:String(i),character,x,y:top-200,angle:0}));
  const flight=previews.map(p=>simulate(pieces,p,0,String(i))).find(f=>f.safe);
  assert.ok(flight,`${c.name} must have at least one stable placement`);
  pieces=flight.final;
  assert.ok(maxPenetration(pieces.map(characterBody))<.04,'check child fixtures, never the enclosing convex hull');
 }
});

test('each pose has a fixed size and its image, fixtures, and mass use the same scale',async()=>{
 const {newRoom,drawPose}=await import('../lib/game/engine');
 const {POSE_SCALES}=await import('../lib/game/characters');
 const room=newRoom('ABCDEFGH','test','p',{name:'dot',character:CHARACTERS[0]},0);
 const observed=new Map<string,number>();
 for(let n=0;n<32;n++){
  const c=drawPose(room,0),i=Number(c.kind.split(':pose-')[1]),base=CHARACTERS[0].poses![i],scale=POSE_SCALES[i];
  assert.equal(c.sizeScale,scale);
  assert.ok(Math.abs(area(c.points)-area(base.points)*scale**2)<1e-6);
  assert.ok(Math.abs(c.imageBounds!.width-base.imageBounds!.width*scale)<1e-8);
  const body=characterBody({id:'scaled',character:c,x:0,y:0,angle:0});
  assert.ok(Math.abs(body.mass-scale**2)<1e-8);
  assert.ok(Math.abs(body.area-area(c.points))<1e-6);
  if(observed.has(c.kind))assert.equal(observed.get(c.kind),scale);
  observed.set(c.kind,scale);
 }
 assert.equal(observed.size,16);
 assert.equal(Math.min(...observed.values()),.3);
 assert.equal(Math.max(...observed.values()),1.5);
});
