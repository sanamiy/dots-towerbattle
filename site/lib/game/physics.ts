import Matter from "matter-js";
import { PLATFORM_BOTTOM_POINTS } from "./platform";
import decomp from "poly-decomp";
import { convexParts } from "./collision-shape";
import type { Piece, Flight, Frame } from "./types";
Matter.Common.setDecomp(decomp);
const { Engine, Bodies, Body, Composite } = Matter;
export function characterBody(p:Piece) {
  const options={friction:.7,frictionStatic:1,restitution:.05,frictionAir:.005,slop:.01};
  const parts=(p.character.collisionParts ?? convexParts(p.character.points)).map(vertices=>{
    const center=Matter.Vertices.centre(vertices);
    return Bodies.fromVertices(center.x,center.y,[vertices],options,false,0,0,0);
  });
  const body=parts.length===1?parts[0]:Body.create({...options,parts});
  Body.setPosition(body,{x:p.x,y:p.y});
  Body.setMass(body,(p.character.sizeScale ?? 1)**2);
  Body.setAngle(body,p.angle);
  return body;
}
const collisionParts = (b:Matter.Body) => b.parts.length > 1 ? b.parts.slice(1) : [b];
/** Fresh SAT checks include every convex fixture, rather than cached contacts only. */
export function maxPenetration(bodies:readonly Matter.Body[]) {
  let worst=0;
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++) {
    const a=bodies[i],b=bodies[j];
    if((a.isStatic&&b.isStatic)||!Matter.Bounds.overlaps(a.bounds,b.bounds))continue;
    for(const pa of collisionParts(a))for(const pb of collisionParts(b)) {
      if(!Matter.Bounds.overlaps(pa.bounds,pb.bounds))continue;
      worst=Math.max(worst,Matter.Collision.collides(pa,pb)?.depth??0);
    }
  }
  return worst;
}
function solvePenetration(bodies:readonly Matter.Body[]) {
  for(let pass=0;pass<16;pass++) {
    let worst=0;
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++) {
      const a=bodies[i],b=bodies[j],total=a.inverseMass+b.inverseMass;
      if(!total||!Matter.Bounds.overlaps(a.bounds,b.bounds))continue;
      for(const pa of collisionParts(a))for(const pb of collisionParts(b)) {
        if(!Matter.Bounds.overlaps(pa.bounds,pb.bounds))continue;
        const c=Matter.Collision.collides(pa,pb);if(!c)continue;
        const depth=Math.max(0,c.depth-.005);worst=Math.max(worst,depth);
        if(depth<.005)continue;
        // SAT normals point towards bodyA; translate the rigid parents, preserving velocity.
        const ca=c.bodyA.parent,cb=c.bodyB.parent;
        if(!ca.isStatic)Body.translate(ca,{x:c.normal.x*depth*ca.inverseMass/total,y:c.normal.y*depth*ca.inverseMass/total});
        if(!cb.isStatic)Body.translate(cb,{x:-c.normal.x*depth*cb.inverseMass/total,y:-c.normal.y*depth*cb.inverseMass/total});
      }
    }
    if(worst<.02)break;
  }
  return maxPenetration(bodies);
}
export function simulate(
  existing: Piece[],
  preview: Piece,
  startedAt: number,
  playerId: string,
  inspect?: (bodies: readonly Matter.Body[]) => void,
): Flight {
  const engine = Engine.create({
    enableSleeping: false,
    positionIterations: 16,
    velocityIterations: 12,
  });
  engine.gravity.y = 1;
  engine.gravity.scale = (9.81 * 82) / 1_000_000;
  const platform = Bodies.rectangle(0, 3, 492, 6, {
    isStatic: true,
    friction: 0.7,
    restitution: 0.05,
  });
  const center = Matter.Vertices.centre(PLATFORM_BOTTOM_POINTS);
  const underside = Bodies.fromVertices(
    center.x,
    center.y,
    [PLATFORM_BOTTOM_POINTS],
    { friction: 0.7, restitution: 0.05 },
    true,
    0.01,
    1,
    0.01,
  );
  Body.setStatic(underside, true);
  Composite.add(engine.world, [platform, underside]);
  const pieces = [...structuredClone(existing), structuredClone(preview)];
  const bodies = pieces.map(characterBody);
  Composite.add(engine.world, bodies);
  const collisionBodies = [platform,underside,...bodies];
  const frames: Frame[] = [
    { t: 0, poses: bodies.map((b) => [b.position.x, b.position.y, b.angle]) },
  ];
  let stable = 0,
    safe = false,
    reason = "10秒以内に安定しませんでした。",
    step = 0;
  for (step = 1; step <= 600; step++) {
    Engine.update(engine, 1000 / 120);
    solvePenetration(collisionBodies);
    Engine.update(engine, 1000 / 120);
    const penetration=solvePenetration(collisionBodies);
    if (step % 4 === 0)
      frames.push({
        t: (step / 60) * 1000,
        poses: bodies.map((b) => [
          +b.position.x.toFixed(3),
          +b.position.y.toFixed(3),
          +b.angle.toFixed(4),
        ]),
      });
    if (
      bodies.some((b) => b.bounds.min.y > 164 || Math.abs(b.position.x) > 820)
    ) {
      reason = "台からキャラクターが落ちました。";
      break;
    }
    const supported = new Set<number>();
    let changed = true;
    const contacts = engine.pairs.list.filter((p: Matter.Pair) => p.isActive);
    while (changed) {
      changed = false;
      for (const p of contacts) {
        const a = p.bodyA.parent,
          b = p.bodyB.parent;
        const ai = bodies.indexOf(a),
          bi = bodies.indexOf(b);
        if (a === platform || a === underside || supported.has(ai)) {
          if (bi >= 0 && !supported.has(bi)) {
            supported.add(bi);
            changed = true;
          }
        }
        if (b === platform || b === underside || supported.has(bi)) {
          if (ai >= 0 && !supported.has(ai)) {
            supported.add(ai);
            changed = true;
          }
        }
      }
    }
    const quiet =
      bodies.every(
        (b) => b.speed < 0.075 && Math.abs(b.angularVelocity) < 0.00085,
      ) && supported.size === bodies.length && penetration < .04;
    stable = quiet ? stable + 1 : 0;
    if (stable >= 90) {
      safe = true;
      reason = "1.5秒間、安定しました。";
      break;
    }
  }
  const duration = (Math.min(step, 600) / 60) * 1000;
  frames.push({
    t: duration,
    poses: bodies.map((b) => [b.position.x, b.position.y, b.angle]),
  });
  const final = pieces.map((p, i) => ({
    ...p,
    x: bodies[i].position.x,
    y: bodies[i].position.y,
    angle: bodies[i].angle,
  }));
  inspect?.(bodies);
  Engine.clear(engine);
  return { startedAt, duration, frames, pieces, safe, reason, final, playerId };
}
