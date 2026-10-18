import type { PublicRoom, Character } from './game/types';
export function agentState(room:PublicRoom){
 const shapes:Record<string,unknown>={};
 function shape(c:Character){const id=c.image??c.kind;shapes[id]={name:c.name,color:c.color,points:c.points,image:c.image};return id;}
 const {flight,players,pieces,preview,nextCharacter,...rest}=room;
 return {...rest,players:players.map(p=>({...p,character:{kind:p.character.kind,name:p.character.name,image:p.character.image}})),pieces:pieces.map(p=>({...p,character:shape(p.character)})),preview:preview?{...preview,character:shape(preview.character)}:undefined,nextCharacter:nextCharacter?shape(nextCharacter):undefined,flight:flight?{startedAt:flight.startedAt,duration:flight.duration,playerId:flight.playerId,status:'判定中'}:undefined,shapes};
}
