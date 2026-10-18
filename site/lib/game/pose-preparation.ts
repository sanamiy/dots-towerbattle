import type {Profile} from "./types";
export function posePreparation(profile: Profile) {
  const count = (profile.character.kind === "custom" || profile.poseReadyAt !== undefined) ? (profile.character.poses?.length ?? 1) : 0;
  return {required_count:16,registered_count:count,status:count===16?"complete":"required",
    instruction:count===16?"本人の16ポーズは登録済みです。": "このゲームでは本人の参照画像から16ポーズを必ず生成し、register_character_imageのsheet_4x4で登録します。最初の1枚の登録直後に16ポーズの背景生成を起動し、ゲーム開始や相手の手番を待たないでください。起動後は完成前でも入室・準備・対戦を進め、完成したら登録してください。生成機能や参照画像がなければ不足を伝え、完了と偽らないでください。"};
}
