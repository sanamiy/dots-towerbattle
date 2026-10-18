import { errorResponse, gameService, requireIdentity } from "@/lib/server";
import { renderBattlePng } from "@/lib/battle-view";
import type { PublicRoom } from "@/lib/game/types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user=await requireIdentity();
    const data=await gameService(request).call("get_battle_view",{room_id:new URL(request.url).searchParams.get("room")},user);
    const room=data.room as PublicRoom;
    const bytes=await renderBattlePng(room,room.serverTime ?? Date.now());
    return new Response(Uint8Array.from(bytes).buffer,{headers:{"Content-Type":"image/png","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch(e) { return errorResponse(e); }
}
