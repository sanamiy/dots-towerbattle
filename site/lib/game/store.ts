import type { Profile, Room } from './types';
export interface RoomStore {
  read(id:string):Promise<Room|null>;
  create(room:Room,userId:string,commandId:string):Promise<void>;
  created(userId:string,commandId:string):Promise<string|null>;
  cas(room:Room,expected:number):Promise<boolean>;
  profile(id:string):Promise<Profile|null>;
  saveProfile(id:string,p:Profile):Promise<void>;
  recent(userId:string):Promise<Room[]>;
}
export class D1Store implements RoomStore {
  constructor(public db:D1Database){}
  async read(id:string){const row=await this.db.prepare('SELECT data FROM rooms WHERE id = ?').bind(id).first<{data:string}>();return row?JSON.parse(row.data) as Room:null;}
  async create(r:Room,uid:string,key:string){await this.db.batch([this.db.prepare('INSERT INTO rooms (id, revision, data, updated_at) VALUES (?, ?, ?, ?)').bind(r.id,r.revision,JSON.stringify(r),r.updatedAt),this.db.prepare('INSERT INTO creations (id, user_id, room_id) VALUES (?, ?, ?)').bind(key,uid,r.id)]);}
  async created(uid:string,key:string){return (await this.db.prepare('SELECT room_id FROM creations WHERE id = ? AND user_id = ?').bind(key,uid).first<{room_id:string}>())?.room_id??null;}
  async cas(r:Room,expected:number){const q=await this.db.prepare('UPDATE rooms SET revision = ?, data = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(r.revision,JSON.stringify(r),r.updatedAt,r.id,expected).run();return q.meta.changes===1;}
  async profile(id:string){const row=await this.db.prepare('SELECT data FROM profiles WHERE user_id = ?').bind(id).first<{data:string}>();return row?JSON.parse(row.data) as Profile:null;}
  async saveProfile(id:string,p:Profile){await this.db.prepare('INSERT INTO profiles (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data').bind(id,JSON.stringify(p)).run();}
  async recent(userId:string){const result=await this.db.prepare("SELECT data FROM rooms WHERE EXISTS (SELECT 1 FROM json_each(rooms.data, '$.players') AS p WHERE json_extract(p.value, '$.userId') = ?) ORDER BY updated_at DESC LIMIT 5").bind(userId).all<{data:string}>();return result.results.map(r=>JSON.parse(r.data) as Room);}
}
