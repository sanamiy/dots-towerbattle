import GameApp from "@/components/game-app";
import { getChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getChatGPTUser();
  return <GameApp signedIn={!!user} />;
}
