import { z } from "zod";
import {
  database,
  errorResponse,
  readJson,
  requireIdentity,
  sameOrigin,
} from "@/lib/server";
import { D1Store } from "@/lib/game/store";
import { assert } from "@/lib/game/engine";
import { avatarInput, saveAvatar } from "@/lib/avatar-server";
const input = avatarInput.extend({ name: z.string().trim().min(1).max(24) });
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireIdentity(),
      parsed = input.safeParse(await readJson(request, 1_600_000));
    assert(
      parsed.success,
      "INVALID_AVATAR",
      "画像または輪郭の形式を確認してください。",
    );
    const character = await saveAvatar(parsed.data);
    const profile = { name: parsed.data.name, character };
    await new D1Store(database()).saveProfile(user.userId, profile);
    return Response.json({ profile });
  } catch (e) {
    return errorResponse(e);
  }
}
