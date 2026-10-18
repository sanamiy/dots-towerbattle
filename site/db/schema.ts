import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  data: text("data").notNull(),
});
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const creations = sqliteTable("creations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  roomId: text("room_id").notNull(),
}, (t) => [uniqueIndex("creation_owner_key").on(t.userId, t.id)]);
export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  roomId: text("room_id").notNull(),
  event: text("event").notNull(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  expiresAt: integer("expires_at").notNull(),
  cursor: integer("cursor").notNull(),
});
