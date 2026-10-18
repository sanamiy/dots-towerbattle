import Matter from 'matter-js';
import decomp from 'poly-decomp';
import type { Piece, Flight, Frame } from './types';
Matter.Common.setDecomp(decomp);
const { Engine, Bodies, Body, Composite } = Matter;
export function simulate(existing: Piece[], preview: Piece, startedAt: number, playerId: string): Flight {
  const engine=Engine.create({enableSleeping:false,positionIterations:10,velocityIterations:10});
  engine.gravity.y=1;engine.gravity.scale=9.81*82/1_000_000;
  const platform=Bodies.rectangle(0,22,492,44,{isStatic:true,friction:.7,restitution:.05});
  Composite.add(engine.world,platform);
  const pieces=[...structuredClone(existing),structuredClone(preview)];
  const bodies=pieces.map(p=>{
    const b=Bodies.fromVertices(p.x,p.y,[p.character.points],{friction:.7,frictionStatic:1,restitution:.05,frictionAir:.005},true,.01,1,.01);
    Body.setMass(b,1);Body.setAngle(b,p.angle);return b;
  });
  Composite.add(engine.world,bodies);
  const frames:Frame[]=[{t:0,poses:bodies.map(b=>[b.position.x,b.position.y,b.angle])}];
  let stable=0,safe=false,reason='10秒以内に安定しませんでした。',step=0;
  for(step=1;step<=600;step++){
    Engine.update(engine,1000/120);Engine.update(engine,1000/120);
    if(step%4===0)frames.push({t:step/60*1000,poses:bodies.map(b=>[+b.position.x.toFixed(3),+b.position.y.toFixed(3),+b.angle.toFixed(4)])});
    if(bodies.some(b=>b.bounds.min.y>164||Math.abs(b.position.x)>820)){reason='台からキャラクターが落ちました。';break;}
    const supported=new Set<number>();let changed=true;
    const contacts=engine.pairs.list.filter((p:Matter.Pair)=>p.isActive);
    while(changed){changed=false;for(const p of contacts){const a=p.bodyA.parent,b=p.bodyB.parent;const ai=bodies.indexOf(a),bi=bodies.indexOf(b);if(a===platform||supported.has(ai)){if(bi>=0&&!supported.has(bi)){supported.add(bi);changed=true;}}if(b===platform||supported.has(bi)){if(ai>=0&&!supported.has(ai)){supported.add(ai);changed=true;}}}}
    const quiet=bodies.every(b=>b.speed<.075&&Math.abs(b.angularVelocity)<.00085)&&supported.size===bodies.length;
    stable=quiet?stable+1:0;
    if(stable>=90){safe=true;reason='1.5秒間、安定しました。';break;}
  }
  const duration=Math.min(step,600)/60*1000;
  frames.push({t:duration,poses:bodies.map(b=>[b.position.x,b.position.y,b.angle])});
  const final=pieces.map((p,i)=>({...p,x:bodies[i].position.x,y:bodies[i].position.y,angle:bodies[i].angle}));
  Engine.clear(engine);
  return {startedAt,duration,frames,pieces,safe,reason,final,playerId};
}
