import {test} from 'node:test';
import assert from 'node:assert/strict';
import {battleScene,battleSvg,visiblePieces} from '../lib/battle-scene';
import {defaultProfile,newRoom,publicRoom} from '../lib/game/engine';
import {schemas} from '../lib/game/service';
import type {PublicRoom} from '../lib/game/types';
const room=():PublicRoom=>publicRoom(newRoom('ABCDEFGH','hash','one',defaultProfile('one'),1000),'one',1000);
test('PNG view and browser board share the current body positions and camera',()=>{
 const r=room(); r.phase='aiming';r.preview={id:'p',character:r.players[0].character,x:123.5,y:-300,angle:Math.PI/2};
 const scene=battleScene(r,1000);const svg=battleSvg(r,1000);
 assert.ok(svg.includes(scene.markup)); assert.ok(svg.includes(`viewBox="${scene.viewBox}"`));
 assert.ok(scene.markup.includes('translate(123.5 -300) rotate(90)'));
 assert.ok(scene.markup.includes('x1="123.5"'));
});
test('a falling snapshot interpolates the same recorded physics frames as the board',()=>{
 const r=room();const p={id:'fall',character:r.players[0].character,x:0,y:-300,angle:0};
 r.phase='falling';r.flight={startedAt:1000,duration:1000,frames:[{t:0,poses:[[0,-300,0]]},{t:1000,poses:[[100,0,Math.PI]]}],pieces:[p],safe:false,reason:'',final:[p],playerId:r.myId};
 const piece=visiblePieces(r,1500)[0];assert.equal(piece.x,50);assert.equal(piece.y,-150);assert.equal(piece.angle,Math.PI/2);
 assert.ok(battleScene(r,1500).markup.includes('translate(50 -150) rotate(90)'));
 assert.equal(visiblePieces(r,3000)[0].x,100);
});
test('custom sprite textures remain visible and arbitrary SVG content is rejected',()=>{
 const r=room();const c=r.players[0].character;c.image='/api/avatar/00000000-0000-4000-8000-000000000000';c.imageBounds={x:-50,y:-50,width:100,height:100};
 assert.ok(battleSvg(r,1000,{[c.image]:'data:image/png;base64,YWJj'}).includes('href="data:image/png;base64,YWJj"'));
 c.image='https://attacker.example/image.svg';c.color='"><script>alert(1)</script>';
 const svg=battleSvg(r,1000);assert.ok(!svg.includes('attacker'));assert.ok(!svg.includes('<script>'));
});
test('battle-view tool accepts only a room id and uses the game room schema',()=>{
 assert.ok(schemas.get_battle_view.safeParse({room_id:'ABCDEFGH'}).success);
 assert.ok(!schemas.get_battle_view.safeParse({room_id:'ABCDEFGH',url:'https://example.com'}).success);
});
