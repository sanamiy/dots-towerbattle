import {after} from "next/server";
import {
  errorResponse,
  gameService,
  readJson,
  requireIdentity,
  sameOrigin,
} from "@/lib/server";
import { flushEvents } from "@/lib/events";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireIdentity(),
      service = gameService(request),
      room = new URL(request.url).searchParams.get("room");
    const result = await service.call(
      room ? "get_game_state" : "get_profile",
      room ? { room_id: room } : {},
      user,
    );
    if (room) after(() => flushEvents(room));
    if (result.room)
      (result.room as { serverTime: number }).serverTime = Date.now();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireIdentity(),
      body = await readJson(request);
    const service = gameService(request),
      result = await service.call(body.operation, body.arguments ?? {}, user);
    if (result.room) {const roomId=(result.room as {id:string}).id;after(() => flushEvents(roomId));}
    if (result.room)
      (result.room as { serverTime: number }).serverTime = Date.now();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
