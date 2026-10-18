import {assert, GameError} from "./game/engine";
export function destination(raw: unknown) {
  assert(
    typeof raw === "string",
    "INVALID_CALLBACK",
    "コールバックURLが必要です。",
  );
  const url = new URL(raw);
  assert(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["chatgpt.com", "openai.com"].some(
        (d) => url.hostname === d || url.hostname.endsWith("." + d),
      ),
    "INVALID_CALLBACK",
    "OpenAIのHTTPSコールバックURLだけ利用できます。",
  );
  return url.href;
}
export function decode(raw: string) {
  assert(
    typeof raw === "string" && raw.startsWith("whsec_"),
    "INVALID_SECRET",
    "署名キーの形式が不正です。",
  );
  try {
    const bytes = Uint8Array.from(atob(raw.slice(6)), (c) => c.charCodeAt(0));
    assert(
      bytes.length >= 24 && bytes.length <= 64,
      "INVALID_SECRET",
      "署名キーの長さが不正です。",
    );
    return bytes;
  } catch {
    throw new Error("署名キーを読み取れません。");
  }
}
export async function deliver(
  url: string,
  secret: string,
  id: string,
  subId: string,
  payload: unknown,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
) {
  const body = JSON.stringify(payload),
    stamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey(
    "raw",
    decode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${id}.${stamp}.${body}`),
    ),
  );
  const sig = btoa(String.fromCharCode(...mac));
  return fetcher(destination(url), {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "Content-Type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": stamp,
      "webhook-signature": `v1,${sig}`,
      "X-MCP-Subscription-Id": subId,
    },
    body,
  });
}

export class CallbackEndpointError extends Error {
  readonly code = -32015;
  constructor(public reason: "timeout" | "challenge_failed" | "unavailable" | "redirect", public status?: number) {
    super("通知先の確認に失敗しました。時間をおいて購読を再試行してください。");
  }
}
function sameChallenge(actual: unknown, expected: string) {
  if (typeof actual !== "string") return false;
  const a = new TextEncoder().encode(actual), b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length,b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
export async function verifyCallback(url: string, secret: string, subscriptionId: string, fetcher?: typeof fetch) {
  const challenge = crypto.randomUUID();
  let response: Response;
  try {
    response = await deliver(url,secret,crypto.randomUUID(),subscriptionId,{type:"verification",challenge},fetcher);
  } catch (error) {
    if (error instanceof GameError) throw error;
    const name = error instanceof Error ? error.name : "";
    throw new CallbackEndpointError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "unavailable");
  }
  if (!response.ok) throw new CallbackEndpointError(response.status >= 300 && response.status < 400 ? "redirect" : "challenge_failed",response.status);
  let result: {challenge?:unknown};
  try { result = await response.json(); }
  catch { throw new CallbackEndpointError("challenge_failed",response.status); }
  if (!result || !sameChallenge(result.challenge,challenge)) throw new CallbackEndpointError("challenge_failed",response.status);
}
