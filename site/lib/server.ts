import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { GameService, type Identity } from "./game/service";
import { D1Store } from "./game/store";
import { GameError } from "./game/engine";
export function database() {
  if (!env.DB)
    throw new GameError(
      "DATABASE_UNAVAILABLE",
      "データベースの接続を確認してください。",
      503,
    );
  return env.DB;
}
export function gameService(request: Request) {
  return new GameService(new D1Store(database()), new URL(request.url).origin);
}
export async function requireIdentity(): Promise<Identity> {
  const user = await getChatGPTUser();
  if (!user)
    throw new GameError(
      "SIGN_IN_REQUIRED",
      "ChatGPTでサインインしてください。",
      401,
    );
  return { userId: user.userId, displayName: user.fullName ?? "プレイヤー" };
}
export function errorResponse(e: unknown) {
  if (e instanceof GameError)
    return Response.json(
      { error: { code: e.code, message: e.message } },
      { status: e.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error(
    "Game request failed",
    e instanceof Error ? e.message : "unknown",
  );
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "処理できませんでした。少し待ってから再試行してください。",
      },
    },
    { status: 500 },
  );
}
export async function readJson(request: Request, max = 32_000) {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > max)
    throw new GameError("TOO_LARGE", "リクエストが大きすぎます。", 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > max)
    throw new GameError("TOO_LARGE", "リクエストが大きすぎます。", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new GameError("INVALID_JSON", "JSON形式を確認してください。");
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new GameError("BAD_ORIGIN", "この画面から操作してください。", 403);
}
