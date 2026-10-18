import { test } from "node:test";
import assert from "node:assert/strict";
import type { RoomStore } from "../lib/game/store";
import type { Profile, Room } from "../lib/game/types";
import { GameService } from "../lib/game/service";
import {
  advance,
  defaultProfile,
  GameError,
  publicRoom,
} from "../lib/game/engine";
import { simulate } from "../lib/game/physics";
import { preset } from "../lib/game/characters";
import { schemaToJson } from "../lib/json-schema";
import { schemas } from "../lib/game/service";
class MemoryStore implements RoomStore {
  rooms = new Map<string, Room>();
  profiles = new Map<string, Profile>();
  keys = new Map<string, string>();
  async read(id: string) {
    return structuredClone(this.rooms.get(id) ?? null);
  }
  async findByPassphraseHash(hash: string) {
    return structuredClone([...this.rooms.values()].find(r=>r.passwordHash===hash)??null);
  }
  async create(r: Room, uid: string, key: string) {
    if (this.keys.has(uid + key)) throw new Error("duplicate");
    this.rooms.set(r.id, structuredClone(r));
    this.keys.set(uid + key, r.id);
  }
  async created(uid: string, key: string) {
    return this.keys.get(uid + key) ?? null;
  }
  async cas(r: Room, expected: number) {
    if (this.rooms.get(r.id)?.revision !== expected) return false;
    this.rooms.set(r.id, structuredClone(r));
    return true;
  }
  async profile(id: string) {
    return structuredClone(this.profiles.get(id) ?? null);
  }
  async saveProfile(id: string, p: Profile) {
    this.profiles.set(id, structuredClone(p));
  }
  async recent(id: string) {
    return [...this.rooms.values()]
      .filter((r) => r.players.some((p) => p.userId === id))
      .map((r) => structuredClone(r));
  }
}
const users = Array.from({ length: 6 }, (_, i) => ({
  userId: `user-${i}`,
  displayName: `dot-${i}`,
}));
const command = () => crypto.randomUUID();
async function setup(count = 4) {
  const store = new MemoryStore();
  let now = 1000000;
  for (let i=0;i<count;i++) await store.saveProfile(users[i].userId,{...defaultProfile(users[i].displayName),poseReadyAt:now+i});
  const service = new GameService(store, "https://test.example", () => now);
  const created = await service.call(
    "create_room",
    { command_id: command() },
    users[0],
  );
  const id = (created.room as any).id;
  for (let i = 1; i < count; i++)
    await service.call(
      "join_room",
      { passphrase: created.passphrase, command_id: command() },
      users[i],
    );
  return {
    store,
    service,
    id,
    pass: created.passphrase,
    now: () => now,
    setNow: (n: number) => {
      now = n;
    },
  };
}
const expectCode = (code: string) => (e: unknown) =>
  e instanceof GameError && e.code === code;
test("four independent users join one room; the fifth cannot take a seat", async () => {
  const { service, id, pass } = await setup();
  const view = await service.call("get_room", { room_id: id }, users[0]);
  assert.equal((view.room as any).players.length, 4);
  await assert.rejects(
    service.call(
      "join_room",
      { passphrase: pass, command_id: command() },
      users[4],
    ),
    expectCode("ROOM_FULL"),
  );
});
test("concurrent joins do not exceed four seats", async () => {
  const { service, id, pass, store } = await setup(1);
  const result = await Promise.allSettled(
    users
      .slice(1)
      .map((user) =>
        service.call(
          "join_room",
          { passphrase: pass, command_id: command() },
          user,
        ),
      ),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 3);
  assert.equal((await store.read(id))!.players.length, 4);
});
test("wrong passphrase, missing room, and nonmembers are rejected", async () => {
  const { service, id } = await setup(2);
  await assert.rejects(
    service.call(
      "join_room",
      { passphrase: "WRONGWRONGXX", command_id: command() },
      users[3],
    ),
    expectCode("WRONG_PASSPHRASE"),
  );
  await assert.rejects(
    service.call(
      "get_room",
      { room_id: "ZZZZZZZZ" },
      users[3],
    ),
    expectCode("ROOM_NOT_FOUND"),
  );
  await assert.rejects(
    service.call("get_game_state", { room_id: id }, users[3]),
    expectCode("NOT_MEMBER"),
  );
});
test("rejoining keeps the same seat; create requests are idempotent", async () => {
  const { service, id, pass, store } = await setup(2);
  const key = command();
  const [a, b] = await Promise.all([
    service.call(
      "join_room",
      { passphrase: pass, command_id: key },
      users[1],
    ),
    service.call(
      "join_room",
      { passphrase: pass, command_id: key },
      users[1],
    ),
  ]);
  assert.equal((a.room as any).myId, (b.room as any).myId);
  assert.equal((await store.read(id))!.players.length, 2);
  const k = command();
  const c = await service.call("create_room", { command_id: k }, users[0]),
    d = await service.call("create_room", { command_id: k }, users[0]);
  assert.equal((c.room as any).id, (d.room as any).id);
});
async function started() {
  const s = await setup();
  for (const u of users.slice(0, 4))
    await s.service.call(
      "set_ready",
      { room_id: s.id, ready: true, command_id: command() },
      u,
    );
  await s.service.call(
    "start_match",
    { room_id: s.id, command_id: command() },
    users[0],
  );
  s.setNow(s.now() + 3100);
  return s;
}
test("only host can start, and host must consent before starting", async () => {
  const { service, id } = await setup(2);
  await assert.rejects(
    service.call(
      "start_match",
      { room_id: id, command_id: command() },
      users[1],
    ),
    expectCode("HOST_ONLY"),
  );
  await assert.rejects(
    service.call(
      "start_match",
      { room_id: id, command_id: command() },
      users[0],
    ),
    expectCode("NOT_READY"),
  );
});
test("other players cannot move the active piece", async () => {
  const { service, store, id } = await started();
  const r = (await store.read(id))!;
  const other = users.find((u) => u.userId !== r.players[r.active].userId)!;
  await assert.rejects(
    service.call(
      "act",
      {
        room_id: id,
        turn_id: r.turnId,
        expected_revision: r.revision,
        command_id: command(),
        actions: [{ type: "move", amount: 24.6 }],
      },
      other,
    ),
    expectCode("NOT_YOUR_TURN"),
  );
});
test("movement is applied once on retry, and stale revisions are rejected", async () => {
  const { service, store, id } = await started();
  const r = (await store.read(id))!,
    u = users.find((u) => u.userId === r.players[r.active].userId)!;
  const args = {
    room_id: id,
    turn_id: r.turnId,
    expected_revision: r.revision,
    command_id: command(),
    actions: [{ type: "move", amount: 24.6 }],
  };
  await service.call("act", args, u);
  await service.call("act", args, u);
  assert.equal((await store.read(id))!.preview!.x, 24.6);
  await assert.rejects(
    service.call("act", { ...args, command_id: command() }, u),
    expectCode("STALE_REVISION"),
  );
});
test("malformed compound commands have no partial effects", async () => {
  const { service, store, id } = await started();
  const r = (await store.read(id))!,
    u = users.find((u) => u.userId === r.players[r.active].userId)!;
  await assert.rejects(
    service.call(
      "act",
      {
        room_id: id,
        turn_id: r.turnId,
        expected_revision: r.revision,
        command_id: command(),
        actions: [
          { type: "move", amount: 24.6 },
          { type: "drop" },
          { type: "rotate", degrees: 15 },
        ],
      },
      u,
    ),
    expectCode("DROP_LAST"),
  );
  assert.equal((await store.read(id))!.preview!.x, 0);
});
test("centered piece lands safely with recorded authoritative frames", () => {
  const f = simulate(
    [],
    { id: "p", character: preset("mellow"), x: 0, y: -225, angle: 0 },
    0,
    "a",
  );
  assert.equal(f.safe, true);
  assert.ok(f.frames.length > 10);
  assert.ok(f.duration >= 1500);
  assert.ok(Math.abs(f.final[0].y) < 70);
});
test("unsupported piece fails instead of sticking in mid-air", () => {
  const f = simulate(
    [],
    { id: "p", character: preset("mellow"), x: 328, y: -225, angle: 0 },
    0,
    "a",
  );
  assert.equal(f.safe, false);
  assert.ok(f.final[0].y > 160);
});
test("a failed turn eliminates its player and restores all earlier pieces", async () => {
  const { store, id, now } = await started();
  const r = (await store.read(id))!,
    original = structuredClone(r.pieces);
  r.preview!.x = 328;
  const { drop } = await import("../lib/game/engine");
  drop(r, now());
  const p = r.players[r.active];
  advance(r, now() + r.flight!.duration + 901);
  assert.equal(p.alive, false);
  assert.deepEqual(r.pieces, original);
  assert.equal(r.players.filter((p) => p.alive).length, 3);
  assert.equal(r.phase, "aiming");
});
test("three failures produce one winner in a four-player match", async () => {
  const { store, id, now } = await started();
  const r = (await store.read(id))!;
  const { drop } = await import("../lib/game/engine");
  let t = now();
  for (let n = 0; n < 3; n++) {
    r.preview!.x = 328;
    drop(r, t);
    t += r.flight!.duration + 901;
    advance(r, t);
  }
  assert.equal(r.phase, "finished");
  assert.equal(r.players.filter((p) => p.rank === 1).length, 1);
  assert.deepEqual(r.players.map((p) => p.rank).sort(), [1, 2, 3, 4]);
});
test("timeout automatically drops once, using server time", async () => {
  const { store, id } = await started();
  const r = (await store.read(id))!;
  advance(r, r.deadline + 1);
  assert.equal(r.phase, "falling");
  assert.equal(r.flight!.startedAt, r.deadline);
  assert.equal(r.flight!.trigger,"timeout");
  const f = r.flight;
  advance(r, r.deadline + 2);
  assert.equal(r.flight, f);
});
test("each player drops their own registered dot and next preview belongs to next player", async () => {
  const { store, id, now } = await started();
  const r = (await store.read(id))!;
  r.players.forEach(
    (p, i) => (p.character = preset(["mellow", "pebble", "sprout", "puff"][i])),
  );
  r.queue = [];
  r.turnOrder = [];
  const { nextTurn } = await import("../lib/game/engine");
  const seen = [];
  for (let i = 0; i < 4; i++) {
    r.active = i;
    nextTurn(r, now());
    assert.ok(r.preview!.character.kind.startsWith(r.players[i].character.kind));
    const view = publicRoom(r, users[0].userId, now());
    assert.ok(view.nextCharacter!.kind.startsWith(r.players[(i+1)%4].character.kind));
    seen.push(r.preview!.character.kind.split(":")[0]);
  }
  assert.equal(new Set(seen).size, 4);
});
test("private identities, passphrase hashes, and random queue are not exposed", async () => {
  const { store, id, now } = await setup();
  const r = (await store.read(id))!;
  const view = publicRoom(r, users[0].userId, now());
  assert.equal("passwordHash" in view, false);
  assert.equal("queue" in view, false);
  assert.equal("commands" in view, false);
  assert.equal(JSON.stringify(view).includes("user-0"), false);
  assert.equal(view.players.filter((p) => p.self).length, 1);
});
test("host can rotate invite; old password no longer joins", async () => {
  const { service, id, pass } = await setup(1);
  const d = await service.call(
    "rotate_invite",
    { room_id: id, command_id: command() },
    users[0],
  );
  assert.ok(d.passphrase);
  assert.notEqual(d.passphrase, pass);
  await assert.rejects(
    service.call(
      "join_room",
      { passphrase: pass, command_id: command() },
      users[1],
    ),
    expectCode("WRONG_PASSPHRASE"),
  );
  await service.call(
    "join_room",
    { passphrase: d.passphrase, command_id: command() },
    users[1],
  );
});
test("all MCP tools have object schemas and all mutations require stable command IDs", () => {
  for (const [name, s] of Object.entries(schemas)) {
    const json = schemaToJson(s);
    assert.equal(json.type, "object");
    if (
      ![
        "get_profile",
        "get_pose_prompt",
        "update_profile",
        "get_room",
        "get_game_state",
        "get_battle_view",
      ].includes(name)
    )
      assert.ok((json.required as string[]).includes("command_id"));
  }
});

test("sixteen poses are drawn without repetition before the pose bag refills", async () => {
  const { store, id } = await setup(2);
  const r = (await store.read(id))!;
  r.players[0].character.poses = Array.from({ length: 16 }, (_, i) => ({
    name: `pose ${i}`,
    image: `/avatar/${i}`,
    points: preset("mellow").points,
  }));
  const { drawPose } = await import("../lib/game/engine");
  const seen = [];
  for (let i = 0; i < 16; i++) seen.push(drawPose(r, 0).name);
  assert.equal(new Set(seen).size, 16);
  assert.equal(r.poseQueues[r.players[0].id].length, 0);
  assert.ok(drawPose(r, 0).name);
  assert.equal(r.poseQueues[r.players[0].id].length, 15);
});
test("starting a match uses the latest registered poses without mutating it on profile save", async () => {
  const { store, service, id } = await setup(2);
  const p = {...defaultProfile("new"),poseReadyAt:1000000};
  p.character.poses = Array.from({ length: 16 }, (_, i) => ({
    name: `pose ${i}`,
    image: `/avatar/${i}`,
    points: preset("mellow").points,
  }));
  await store.saveProfile(users[0].userId, p);
  for (const u of users.slice(0, 2))
    await service.call(
      "set_ready",
      { room_id: id, ready: true, command_id: command() },
      u,
    );
  await service.call(
    "start_match",
    { room_id: id, command_id: command() },
    users[0],
  );
  const r = (await store.read(id))!;
  assert.equal(
    r.players.find((p) => p.userId === users[0].userId)!.character.poses!
      .length,
    16,
  );
  await store.saveProfile(users[0].userId, defaultProfile("changed"));
  assert.equal(
    (await store.read(id))!.players.find((p) => p.userId === users[0].userId)!
      .character.poses!.length,
    16,
  );
});

test("one passphrase identifies the room without a room ID, with forgiving code formatting", async()=>{
 const {service,id,pass}=await setup(1);
 const formatted=String(pass).toLowerCase().match(/.{1,4}/g)!.join(' - ');
 const data=await service.call('join_room',{passphrase:` ${formatted} `,command_id:command()},users[1]);
 assert.equal((data.room as any).id,id);
 assert.equal(schemas.join_room.safeParse({passphrase:pass,command_id:command()}).success,true);
 assert.equal(schemas.join_room.safeParse({room_id:id,passphrase:pass,command_id:command()}).success,false);
 const created=await service.call('create_room',{command_id:command()},users[2]);
 const other=await service.call('join_room',{passphrase:created.passphrase,command_id:command()},users[3]);
 assert.equal((other.room as any).id,(created.room as any).id);
 assert.notEqual((other.room as any).id,id);
 assert.ok(!String(created.invitation).includes('部屋ID'));
});

test('newly prepared poses are adopted at the next turn boundary, leaving current and placed bodies fixed',async()=>{
 const {store,service,id,now,setNow}=await started();
 const before=(await store.read(id))!;
 const next=before.players[(before.active+1)%before.players.length];
 const profile={...defaultProfile(next.name),poseReadyAt:1000000};
 profile.character.poses=profile.character.poses!.map((p,i)=>({...p,name:`newly prepared ${i}`,image:`/generated/${i}`}));
 await store.saveProfile(next.userId,profile);
 const current=structuredClone(before.preview);
 await service.call('get_game_state',{room_id:id},users[0]);
 assert.deepEqual((await store.read(id))!.preview,current);
 const {drop}=await import('../lib/game/engine');
 before.preview!.x=328;drop(before,now());
 await store.cas(before,before.revision);
 setNow(now()+before.flight!.duration+1000);
 const data=await service.call('get_game_state',{room_id:id},users[0]);
 const updated=(await store.read(id))!;
 assert.equal(updated.players[updated.active].id,next.id);
 assert.match(updated.preview!.character.name,/newly prepared/);
 assert.deepEqual(updated.pieces,before.pieces);
 assert.ok(data.room);
});

test('one-player practice starts immediately, continues after success, and ends on a fall',async()=>{
 const {newRoom,start,drop}=await import('../lib/game/engine');
 const character=preset('mellow');
 const {poses,...base}=character;void poses;
 character.poses=Array.from({length:16},()=>({...base,name:'stable',image:base.image!}));
 const r=newRoom('ABCDEFGH','hash','solo',{name:'solo',character,poseReadyAt:1000},1000);
 r.players[0].ready=true;start(r,'solo',1000);
 assert.equal(r.phase,'aiming');assert.ok(r.preview);
 drop(r,4100);assert.equal(r.flight!.safe,true);
 let t=4100+r.flight!.duration+1000;advance(r,t);
 assert.equal(r.phase,'aiming');assert.equal(r.players[0].successes,1);
 r.preview!.x=328;drop(r,t);t+=r.flight!.duration+1000;advance(r,t);
 assert.equal(r.phase,'finished');assert.equal(r.players[0].alive,false);
});
for(const count of [2,3])test(`${count} players start without waiting for four and a match produces one winner`,async()=>{
 const s=await setup(count);
 for(const user of users.slice(0,count))await s.service.call('set_ready',{room_id:s.id,ready:true,command_id:command()},user);
 await s.service.call('start_match',{room_id:s.id,command_id:command()},users[0]);
 const r=(await s.store.read(s.id))!;
 assert.equal(r.phase,'aiming');assert.equal(r.players.length,count);
 const {drop}=await import('../lib/game/engine');let t=s.now()+3100;
 for(let i=0;i<count-1;i++){r.preview!.x=328;drop(r,t);t+=r.flight!.duration+1000;advance(r,t);}
 assert.equal(r.phase,'finished');assert.equal(r.players.filter(p=>p.alive&&p.rank===1).length,1);
});

test('sixteen generated poses are required, and sample presets do not count as personal completion',async()=>{
 const {posePreparation}=await import('../lib/game/pose-preparation');
 const sample=defaultProfile();assert.equal(sample.character.poses!.length,16);
 assert.equal(posePreparation(sample).status,'required');
 const own=structuredClone(sample);own.character.kind='custom';delete own.character.poses;
 assert.equal(posePreparation(own).registered_count,1);assert.equal(posePreparation(own).status,'required');
 own.character.poses=sample.character.poses;
 assert.equal(posePreparation(own).status,'complete');
 const {service}=await setup(1);
 const data=await service.call('get_profile',{},users[5]);
 assert.equal((data.pose_preparation as any).required_count,16);
 assert.equal((data.pose_preparation as any).status,'required');
});


test('initial turns follow sixteen-pose registration time, independent of join order',async()=>{
 const s=await setup(3);
 for(const [i,time] of [[0,300],[1,100],[2,200]]) {
  const profile=(await s.store.profile(users[i].userId))!;
  await s.store.saveProfile(users[i].userId,{...profile,poseReadyAt:time});
  await s.service.call('set_ready',{room_id:s.id,ready:true,command_id:command()},users[i]);
 }
 await s.service.call('start_match',{room_id:s.id,command_id:command()},users[0]);
 const r=(await s.store.read(s.id))!;
 assert.equal(r.players[r.active].userId,users[1].userId);
 const {nextTurn}=await import('../lib/game/engine');
 nextTurn(r,s.now()+4000);assert.equal(r.players[r.active].userId,users[2].userId);
 nextTurn(r,s.now()+4000);assert.equal(r.players[r.active].userId,users[0].userId);
 nextTurn(r,s.now()+4000);assert.equal(r.players[r.active].userId,users[1].userId);
});
test('no completed poses waits without an action timer, then newly completed players join in order',async()=>{
 const s=await setup(2);
 for(const u of users.slice(0,2)) {
  await s.store.saveProfile(u.userId,defaultProfile(u.displayName));
  await s.service.call('set_ready',{room_id:s.id,ready:true,command_id:command()},u);
 }
 const start=await s.service.call('start_match',{room_id:s.id,command_id:command()},users[0]);
 assert.equal((start.room as any).phase,'preparing');assert.equal((start.room as any).deadline,0);
 assert.equal((start.room as any).preview,undefined);
 s.setNow(s.now()+10000);
 await s.store.saveProfile(users[1].userId,{...defaultProfile('first finished'),poseReadyAt:s.now()});
 const view=await s.service.call('get_game_state',{room_id:s.id},users[0]);
 assert.equal((view.room as any).phase,'aiming');
 let r=(await s.store.read(s.id))!;assert.equal(r.players[r.active].userId,users[1].userId);
 const oldPreview=structuredClone(r.preview);
 await s.store.saveProfile(users[0].userId,{...defaultProfile('second finished'),poseReadyAt:s.now()+1});
 await s.service.call('get_game_state',{room_id:s.id},users[0]);
 assert.deepEqual((await s.store.read(s.id))!.preview,oldPreview);
 r=(await s.store.read(s.id))!;
 const {drop}=await import('../lib/game/engine');r.preview!.x=328;drop(r,s.now()+3100);
 await s.store.cas(r,r.revision);s.setNow(s.now()+r.flight!.duration+5000);
 await s.service.call('get_game_state',{room_id:s.id},users[0]);
 r=(await s.store.read(s.id))!;assert.equal(r.phase,'finished');assert.equal(r.players[0].rank,1);
});
test('a pending player cannot win by waiting while a prepared player falls',async()=>{
 const s=await setup(2);
 await s.store.saveProfile(users[1].userId,defaultProfile('pending'));
 for(const u of users.slice(0,2))await s.service.call('set_ready',{room_id:s.id,ready:true,command_id:command()},u);
 await s.service.call('start_match',{room_id:s.id,command_id:command()},users[0]);
 let r=(await s.store.read(s.id))!;const {drop}=await import('../lib/game/engine');
 r.preview!.x=328;drop(r,s.now()+3100);await s.store.cas(r,r.revision);s.setNow(s.now()+r.flight!.duration+5000);
 await s.service.call('get_game_state',{room_id:s.id},users[0]);r=(await s.store.read(s.id))!;
 assert.equal(r.phase,'preparing');assert.equal(r.players[1].rank,undefined);assert.equal(r.deadline,0);
});


test('voice movement and rotation use one turn-bound call without fetching a fresh revision',async()=>{
 const s=await started();const r=(await s.store.read(s.id))!;const actor=users.find(u=>u.userId===r.players[r.active].userId)!;
 // A poll increments the room revision after the dot last saw it.
 s.setNow(s.now()+6000);await s.service.call('get_game_state',{room_id:s.id},actor);
 const args={room_id:s.id,turn_id:r.turnId,command_id:command(),actions:[{type:'move',amount:24.6},{type:'rotate',degrees:15}]};
 const reply=await s.service.call('control_piece',args,actor);let actual=(await s.store.read(s.id))!;
 assert.equal(actual.phase,'aiming');assert.equal(actual.preview!.x,24.6);assert.ok(Math.abs(actual.preview!.angle-Math.PI/12)<1e-9);
 assert.equal((reply.command_ack as any).accepted,true);assert.equal(actual.flight,undefined);
 await s.service.call('control_piece',args,actor);actual=(await s.store.read(s.id))!;
 assert.equal(actual.preview!.x,24.6);assert.ok(Math.abs(actual.preview!.angle-Math.PI/12)<1e-9);
});
test('dedicated voice drop releases the latest server position once and acknowledges receipt',async()=>{
 const s=await started();const r=(await s.store.read(s.id))!;const actor=users.find(u=>u.userId===r.players[r.active].userId)!;
 await s.service.call('control_piece',{room_id:s.id,turn_id:r.turnId,command_id:command(),actions:[{type:'move',amount:73.8},{type:'rotate',degrees:15}]},actor);
 const args={room_id:s.id,turn_id:r.turnId,command_id:command()};
 const reply=await s.service.call('drop_piece',args,actor);const actual=(await s.store.read(s.id))!;
 assert.equal(actual.phase,'falling');assert.equal(actual.flight!.trigger,'command');assert.equal(actual.flight!.startedAt,s.now());
 assert.equal(actual.flight!.pieces.at(-1)!.x,73.8);assert.ok(Math.abs(actual.flight!.pieces.at(-1)!.angle-Math.PI/12)<1e-9);
 assert.equal((reply.command_ack as any).accepted,true);
 await s.service.call('drop_piece',args,actor);assert.deepEqual((await s.store.read(s.id))!.flight,actual.flight);
});
test('fast voice controls still reject other players, expired turns, and changed turns',async()=>{
 const s=await started();let r=(await s.store.read(s.id))!;const actor=users.find(u=>u.userId===r.players[r.active].userId)!,other=users.find(u=>u.userId!==actor.userId)!;
 for(const name of ['control_piece','drop_piece']){
  const args={room_id:s.id,turn_id:r.turnId,command_id:command(),...(name==='control_piece'?{actions:[{type:'move',amount:24.6}]}:{})};
  await assert.rejects(s.service.call(name,args,other),expectCode('NOT_YOUR_TURN'));
  await assert.rejects(s.service.call(name,{...args,turn_id:command()},actor),expectCode('STALE_TURN'));
 }
 s.setNow(r.deadline+1);
 await assert.rejects(s.service.call('drop_piece',{room_id:s.id,turn_id:r.turnId,command_id:command()},actor),expectCode('TURN_EXPIRED'));
 r=(await s.store.read(s.id))!;assert.equal(r.phase,'aiming');assert.equal(r.preview!.x,0);
});
