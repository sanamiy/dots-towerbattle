import {PLUGIN_URL} from "../plugin-config";
import {posePreparation} from "./pose-preparation";
import { POSE_PROMPT } from "./pose-prompt";
import { z } from "zod";
import type { Action, Profile, Room } from "./types";
import type { RoomStore } from "./store";
import {
  act,
  advance,
  assert,
  defaultProfile,
  GameError,
  join,
  leave,
  member,
  newRoom,
  publicRoom,
  rematch,
  start,
} from "./engine";
import { CHARACTERS, preset } from "./characters";
export type Identity = { userId: string; displayName: string };
const roomId = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{8}$/, "部屋IDは8文字の英数字です。");
export const normalizePassphrase = (value: string) => value.normalize("NFKC").trim().toUpperCase().replace(/[\s-]+/g, "");
const passphrase = z.string().trim().min(1).max(64);
const key = z.string().min(8).max(120);
const shape = z.enum(["mellow", "pebble", "sprout", "puff"]);
const common = { room_id: roomId, command_id: key };
export const actionSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("move"), amount: z.number().min(-492).max(492) })
    .strict(),
  z
    .object({
      type: z.literal("rotate"),
      degrees: z.number().min(-360).max(360),
    })
    .strict(),
  z.object({ type: z.literal("center") }).strict(),
  z.object({ type: z.literal("reset_rotation") }).strict(),
  z.object({ type: z.literal("drop") }).strict(),
]);
export const schemas = {
  get_profile: z.object({}).strict(),
  get_pose_prompt: z.object({}).strict(),
  update_profile: z
    .object({
      name: z.string().trim().min(1).max(24),
      kind: shape.optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    })
    .strict(),
  create_room: z.object({ command_id: key }).strict(),
  join_room: z
    .object({ command_id: key, passphrase })
    .strict(),
  get_room: z.object({ room_id: roomId }).strict(),
  get_game_state: z.object({ room_id: roomId }).strict(),
  get_battle_view: z.object({ room_id: roomId }).strict(),
  set_ready: z.object({ ...common, ready: z.boolean() }).strict(),
  start_match: z.object(common).strict(),
  leave_room: z.object(common).strict(),
  rematch: z.object(common).strict(),
  rotate_invite: z.object(common).strict(),
  control_piece: z.object({...common,turn_id:z.string().uuid(),actions:z.array(actionSchema).min(1).max(12)}).strict(),
  drop_piece: z.object({...common,turn_id:z.string().uuid()}).strict(),
  act: z
    .object({
      ...common,
      turn_id: z.string().uuid(),
      expected_revision: z.number().int().min(0),
      actions: z.array(actionSchema).min(1).max(12),
    })
    .strict(),
};
export const toolDescriptions: Record<string, string> = {
  get_pose_prompt:
    "同じdotの16ポーズを4×4画像で生成するための指示文を取得します。画像生成そのものはこのツールでは実行しません。利用可能な画像生成機能へ本人の参照画像と一緒に渡し、完成した実ファイルをregister_character_imageへ直接登録します。",
  get_profile:
    "自分の登録キャラクターと参加中の部屋を取得します。最初に呼んで既存の部屋を確認してください。",
  update_profile:
    "参加者本人のdotが自分の表示名と外見に一致する公式見本を登録します。kindはmellow=Felipe、pebble=Iggy、sprout=Todd、puff=Alfred。外見が確認できなければ勝手に別キャラクターと断定せず、本人に確認します。本人の元画像を取得する公開APIは確認できていません。共有・生成済みの実ファイルはregister_character_imageで登録できます。",
  create_room:
    "1人の練習または2〜4人の対戦用の部屋を作ります。明示的な部屋作成の指示がある場合だけ呼びます。同じcommand_idで再試行してください。",
  join_room:
    "合言葉だけで既存の部屋へ参加します。部屋IDの入力は不要です。部屋が見つからなくても新規作成しません。",
  get_room: "参加中の部屋のメンバーと準備状態を取得します。",
  get_battle_view:
    "参加中のゲームの現在の盤面をPNG画像で見ます。ブラウザを開いていなくても取得できます。自分の手番開始時や作戦を相談された時に呼び、いつものdotとして見えた特徴を短く話し、答えやすい質問を一つ添えて一緒に考えてください。安全は断定せず、相談だけでは操作しません。自動で連続取得せず、手番開始・相談・着地結果ごとに必要な時だけ使います。",
  get_game_state:
    "盤面、全キャラクターの輪郭座標、手番、位置、角度、次の駒、残り時間を取得します。座標は画面右が+x、下が+y、角度はラジアンです。手番の開始時にturnIdを確認します。手番中の声の移動・回転は既知のturnIdでcontrol_piece、落下はdrop_pieceを直接呼び、各指示の前に状態を取り直す必要はありません。",
  set_ready:
    "本人の準備完了状態を変更します。ユーザーが準備できたと言った時に呼びます。",
  start_match: "ホストの準備完了後、16ポーズの登録が終わった人から順に開始します。未完了の人は準備中となり、完成したら次の手番候補へ加わります。1人なら練習、2〜4人なら対戦です。",
  control_piece: "音声の移動・回転・複合指示を即実行するツールです。既知のroom_id・turn_id・新しいcommand_idとactionsだけで、サーバー上の現在位置に相対操作します。expected_revisionや各指示前の盤面・状態の取り直しは不要。右move:+24.6、左-24.6、少し±4.92、大きく±73.8、回転rotate degrees:+15、逆-15。複数操作は声で言われた順に1回の呼び出しにまとめ、直前の操作の成功を待ってから次を送ります。dropは本人が明示した場合だけ最後に追加。手番変更や時間切れは拒否し、古い指示を新しい手番に勝手に再適用しません。受付成功を確認してから実行済みと伝えます。",
  drop_piece: "本人が『落として』と明示したら、この落下専用ツールを直ちに呼びます。既知のroom_id・turn_id・新しいcommand_idだけで実行でき、expected_revisionや直前のget_game_state・画像取得は不要です。現在のサーバー上の位置・角度で落とします。手番変更や時間切れなら拒否します。同じcommand_idでの再送は一度だけ適用します。受付成功を確認してから『落としたよ』と伝え、相談や移動だけでは呼びません。",
  act: "音声の移動・回転はcontrol_piece、単独落下はdrop_pieceを優先してください。このactはrevision一致が必要な厳密な操作用です。自分の手番を操作します。右はmove amount:+24.6、左は-24.6、少しは±4.92、大きくは±73.8。回転はdegrees:+15、逆回転は-15。移動はピクセル、回転入力は度。dropは明示的な落下指示がある場合だけ、最後に追加します。相談だけでは操作しません。最新turn_idとexpected_revision、同じ再試行で変えないcommand_idが必要です。",
  leave_room: "部屋から退出します。試合中は本人の降参になります。",
  rematch:
    "終了した部屋をホストがロビーへ戻し、同じメンバーで再戦の準備をします。",
  rotate_invite:
    "ホストが入室用の合言葉を再発行します。以前の合言葉は使えなくなります。ロビー専用です。",
};
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function code(length: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(length)),
    (b) => chars[b % chars.length],
  ).join("");
}
export function invitation(origin: string, r: Room, pass: string) {
  return `Dots Tower Battleで遊ぼう！\nゲーム：${origin}/?room=${r.id}\n\nDots Tower Battleプラグインを使って、次の既存の部屋に参加して。\n合言葉：${pass}\n見つからない場合は新しい部屋を作らず教えて。\n未接続なら ${PLUGIN_URL} でゲームのプラグインをインストール・接続する手順を案内して。MCPのURLはブラウザで開く遊び場ではなく、認証付き接続先です。\nget_profileで登録を確認し、あなた自身の名前・確認できる外見に合わせてupdate_profileで登録して。既に本人の画像が登録されていれば、別の見本で上書きしないで。外見が不明なら想像で選ばず教えて。ゲーム画面のリンクを出して。私が「準備できた」と言ったら準備完了にして。私がホストなら、私の「はじめよう」で開始して。準備・開始・再戦もMCPで行い、画面の設定操作を求めないで。\nこのゲームでは16ポーズの生成と登録が必須です。get_profileのpose_preparationがcompleteでなければ、get_pose_promptで4×4画像の生成指示を必ず取得して。元画像ファイルがあればregister_character_imageのsingleで先に登録し、その直後に16ポーズの背景生成を必ず起動して。試合開始や相手の手番を待たないで。生成を起動したら、完成を待たず入室・準備を続けてよい。最初の手番は16ポーズの登録完了順で、未完了の間は準備中として待ち、完成したら参加できる。完成した実ファイルをsheet_4x4として直接登録して。背景生成が利用できなければ理由を伝え、開始したと偽らないで。APIキーや手動アップロードは求めないで。元画像がまだなければ一度だけ共有をお願いし、ファイルを捏造しないで。生成機能が使えない場合は未対応の理由を説明して。16枚の登録成功が確認できるまで生成済み・完了と言わないで。\n手番になったらget_battle_viewで実際の盤面画像を見て、いつもの私のdotとして、普段の口調や私との関係性を保って一緒に遊んで。今回のポーズやタワーの面白いところをひとつ拾い、短いひとこと＋答えやすい質問をひとつで作戦会議を始めて。例えば「今回はびよーんと長いね。寝かせてみる？」のように画像に合わせて話して。毎回同じ例文を読み上げず、私の返事に合わせて掛け合って。着地したら短く喜んだり励ましたりして。危険そうでも成功・失敗は断定せず、判定は物理演算に任せて。\ndotとの通話で声の指示を出すので、この試合中、私の「左」「右」「回転」「落として」を操作として実行して。移動・回転は既知のturn_idでcontrol_piece、単独の「落として」はdrop_pieceを直ちに呼び、直前の状態・画像の取り直しや確認の会話を挟まないで。成功した返答のcommand_ack.acceptedを確認してから受付済みと伝えて。相談だけでは動かさず、移動や回転だけの指示で落とさないで。\n手番と結果の通知をこの試合の間だけ購読して。終了したら解除して。`;
}
export class GameService {
  constructor(
    public store: RoomStore,
    public origin: string,
    public now: () => number = Date.now,
  ) {}
  async getProfile(user: Identity) {
    const profile=(await this.store.profile(user.userId)) ?? defaultProfile(user.displayName.slice(0,24)||"プレイヤー");
    if (!profile.character.poses?.length && CHARACTERS.some(c=>c.kind===profile.character.kind) && (!profile.character.image || profile.character.image.startsWith("/dots/official-"))) return {...profile,character:preset(profile.character.kind)};
    return profile;
  }
  async refreshCharacters(r: Room) {
    let changed = false;
    for (const player of r.players) {
      const profile = await this.store.profile(player.userId);
      if (!profile) continue;
      const readyAt = posePreparation(profile).status === "complete" ? (profile.poseReadyAt ?? player.poseReadyAt ?? this.now()) : undefined;
      if (JSON.stringify(profile.character) !== JSON.stringify(player.character)) {
        player.character = structuredClone(profile.character);
        r.poseQueues[player.id] = [];
        changed = true;
      }
      if (player.name !== profile.name || player.poseReadyAt !== readyAt) changed = true;
      player.name = profile.name;
      player.poseReadyAt = readyAt;
    }
    return changed;
  }
  async read(id: string, uid: string) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = await this.store.read(id);
      assert(
        r,
        "ROOM_NOT_FOUND",
        "部屋が見つかりません。",
        404,
      );
      const me = member(r, uid);
      const old = r.revision;
      let changed = false;
      const now = this.now();
      if (now - me.connectedAt >= 5000) {
        me.connectedAt = now;
        changed = true;
      }
      if (r.phase === "aiming") {
        const active = r.players[r.active];
        if (active.userId === uid && r.pauseUntil && r.pauseUntil > now) {
          r.deadline -= r.pauseUntil - now;
          r.pauseUntil = undefined;
          changed = true;
        } else if (
          active.userId !== uid &&
          now - active.connectedAt > 8000 &&
          !active.pauseUsed
        ) {
          active.pauseUsed = true;
          r.deadline = Math.max(r.deadline, now) + 15000;
          r.pauseUntil = now + 15000;
          changed = true;
        }
      }
      if (r.phase === "preparing" || (r.phase === "falling" && r.flight && now >= r.flight.startedAt + r.flight.duration + 900))
        changed = (await this.refreshCharacters(r)) || changed;
      for (let n = 0; n < 2; n++) changed = advance(r, this.now()) || changed;
      if (!changed) return r;
      r.revision++;
      r.updatedAt = this.now();
      if (await this.store.cas(r, old)) return r;
    }
    throw new GameError(
      "BUSY",
      "更新が重なりました。もう一度お試しください。",
      409,
    );
  }
  async mutate(
    id: string,
    uid: string,
    commandId: string,
    fingerprint: string,
    fn: (r: Room) => void,
    expected?: number,
  ) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = await this.store.read(id);
      assert(r, "ROOM_NOT_FOUND", "部屋が見つかりません。", 404);
      const previous = r.commands.find(
        (c) => c.id === commandId && c.userId === uid,
      );
      if (previous) {
        assert(
          previous.fingerprint === fingerprint,
          "COMMAND_REUSED",
          "同じ操作IDを別の操作には使えません。",
          409,
        );
        return r;
      }
      if (expected !== undefined)
        assert(
          r.revision === expected,
          "STALE_REVISION",
          "盤面が更新されました。最新状態を確認して再操作してください。",
          409,
        );
      const old = r.revision;
      fn(r);
      r.revision++;
      r.updatedAt = this.now();
      r.commands.push({ id: commandId, userId: uid, fingerprint });
      r.commands = r.commands.slice(-256);
      if (await this.store.cas(r, old)) return r;
    }
    throw new GameError(
      "BUSY",
      "更新が重なりました。もう一度お試しください。",
      409,
    );
  }
  async call(
    name: string,
    raw: unknown,
    user: Identity,
  ): Promise<Record<string, unknown>> {
    const schema = schemas[name as keyof typeof schemas];
    assert(schema, "UNKNOWN_TOOL", "不明な操作です。", 404);
    const parsed = schema.safeParse(raw);
    assert(
      parsed.success,
      "INVALID_INPUT",
      parsed.success
        ? ""
        : parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" / "),
    );
    const a = parsed.data as Record<string, unknown>,
      now = this.now();
    if (name === "get_pose_prompt")
      return {
        prompt: POSE_PROMPT,
        upload_url: `${this.origin}/?asset_import=1`,
        message:
          "本人の参照画像とこのプロンプトで透明PNGを生成し、実ファイルをregister_character_imageへlayout:sheet_4x4で渡してください。file_idや一時URLを文字列から捏造しません。最初の1枚だけならlayout:singleで先に登録し、そのまま参加できます。登録した追加ポーズは次の手番から反映されます。すでに落ちている駒の形状は変わりません。",
      };
    if (name === "get_profile") {
      const profile=await this.getProfile(user);
      return {
        profile,
        pose_preparation:posePreparation(profile),
        rooms: (await this.store.recent(user.userId))
          .filter((r) => r.players.some((p) => p.userId === user.userId))
          .map((r) => ({
            id: r.id,
            phase: r.phase,
            url: `${this.origin}/?room=${r.id}`,
          })),
        url: this.origin,
      };
    }
    if (name === "update_profile") {
      const old = await this.getProfile(user);
      const p: Profile = {
        name: a.name as string,
        poseReadyAt: a.kind ? undefined : old.poseReadyAt,
        character: a.kind
          ? preset(a.kind as string, a.color as string | undefined)
          : {
              ...old.character,
              ...(a.color ? { color: a.color as string } : {}),
            },
      };
      await this.store.saveProfile(user.userId, p);
      return { profile: p };
    }
    if (name === "create_room") {
      const ck = await hash(`${user.userId}:${a.command_id}`),
        prior = await this.store.created(user.userId, ck);
      if (prior) {
        const r = await this.read(prior, user.userId);
        return {
          room: publicRoom(r, user.userId, now),
          url: `${this.origin}/?room=${r.id}`,
          message:
            "既に作成済みです。合言葉を紛失した場合はホストが再発行してください。",
        };
      }
      const id = code(8),
        pass = code(12),
        r = newRoom(
          id,
          await hash(pass),
          user.userId,
          await this.getProfile(user),
          now,
        );
      try {
        await this.store.create(r, user.userId, ck);
      } catch (e) {
        const prior = await this.store.created(user.userId, ck);
        if (prior)
          return {
            room: publicRoom(
              await this.read(prior, user.userId),
              user.userId,
              now,
            ),
            url: `${this.origin}/?room=${prior}`,
          };
        throw e;
      }
      return {
        room: publicRoom(r, user.userId, now),
        passphrase: pass,
        pose_preparation:posePreparation(await this.getProfile(user)),
        invitation: invitation(this.origin, r, pass),
        url: `${this.origin}/?room=${id}`,
      };
    }
    const joinHash = name === "join_room" ? await hash(normalizePassphrase(a.passphrase as string)) : undefined;
    const inviteRoom = joinHash ? await this.store.findByPassphraseHash(joinHash) : undefined;
    if (name === "join_room") assert(inviteRoom,"WRONG_PASSPHRASE","合言葉が見つかりません。入力を確認してください。",403);
    const id = name === "join_room" ? inviteRoom!.id : a.room_id as string;
    if (name === "get_room" || name === "get_game_state" || name === "get_battle_view") {
      const r = await this.read(id, user.userId);
      return {
        room: publicRoom(r, user.userId, this.now()),
        url: `${this.origin}/?room=${id}`,
        controls: {
          left: -24.6,
          right: 24.6,
          small: 4.92,
          large: 73.8,
          rotationDegrees: 15,
        },
        message:
          r.phase === "aiming"
            ? `${r.players[r.active].name}の番。残り${Math.max(0, Math.ceil((r.deadline - now) / 1000))}秒。`
            : r.phase === "falling"
              ? "着地判定中です。"
              : r.phase === "finished"
                ? "試合終了。"
                : r.phase === "preparing" ? "16ポーズを準備中。完成した人からターンが始まります。" : "ロビーで参加者を待っています。",
      };
    }
    const fingerprint = await hash(name + JSON.stringify(a));
    let pass: string | undefined;
    if (name === "join_room") {
      const profile = await this.getProfile(user);
      const passHash = joinHash!;
      const r = await this.mutate(
        id,
        user.userId,
        a.command_id as string,
        fingerprint,
        (r) => {
          assert(
              r.passwordHash === passHash,
              "WRONG_PASSPHRASE",
              "合言葉が再発行されています。",
              403,
            );
          join(r, user.userId, profile, now);
        },
      );
      return {
        room: publicRoom(r, user.userId, now),
        url: `${this.origin}/?room=${id}`,
        pose_preparation:posePreparation(profile),
      };
    }
    const startProfiles: Record<string, Profile> = {};
    if (name === "start_match") {
      const snapshot = await this.store.read(id);
      for (const p of snapshot?.players ?? []) {
        const profile = await this.getProfile({userId:p.userId,displayName:p.name});
        if (profile) startProfiles[p.userId] = profile;
      }
    }
    pass = name === "rotate_invite" ? code(12) : undefined;
    const nextHash = pass ? await hash(pass) : undefined;
    const readyProfile = name === "set_ready" && a.ready ? await this.getProfile(user) : undefined;
    const r = await this.mutate(
      id,
      user.userId,
      a.command_id as string,
      fingerprint,
      (r) => {
        const p = member(r, user.userId);
        p.connectedAt = now;
        if ((name === "act" || name === "control_piece" || name === "drop_piece") && r.players[r.active].userId === user.userId) {
          if (r.pauseUntil && r.pauseUntil > now)
            r.deadline -= r.pauseUntil - now;
          r.pauseUntil = undefined;
          p.idleTurns = 0;
        }
        if (name === "set_ready") {
          assert(
            r.phase !== "finished" && (a.ready === true || r.phase === "lobby"),
            "NOT_LOBBY",
            "試合中は参加の準備完了だけ変更できます。",
          );
          assert(
            now - r.updatedAt < 30 * 60_000,
            "ROOM_EXPIRED",
            "この部屋は期限切れです。新しい部屋を作ってください。",
            410,
          );
          if (readyProfile) {p.name=readyProfile.name;p.character=structuredClone(readyProfile.character);p.poseReadyAt=posePreparation(readyProfile).status === "complete" ? (readyProfile.poseReadyAt ?? p.poseReadyAt ?? now) : undefined;}
          p.ready = a.ready as boolean;
        }
        if (name === "start_match") {
          for (const p of r.players) {
            const profile = startProfiles[p.userId];
            if (profile) {
              p.name = profile.name;
              p.character = structuredClone(profile.character);
              p.poseReadyAt = posePreparation(profile).status === "complete" ? (profile.poseReadyAt ?? p.poseReadyAt ?? now) : undefined;
            }
          }
          start(r, user.userId, now);
        }
        if (name === "drop_piece") act(r,user.userId,a.turn_id as string,[{type:"drop"}],now);
        if (name === "act" || name === "control_piece")
          act(r, user.userId, a.turn_id as string, a.actions as Action[], now);
        if (name === "leave_room") leave(r, user.userId, now);
        if (name === "rematch") rematch(r, user.userId, now);
        if (name === "rotate_invite") {
          assert(
            r.phase === "lobby" && r.hostId === user.userId,
            "HOST_ONLY",
            "ロビーでホストが再発行できます。",
            403,
          );
          assert(pass, "INTERNAL", "合言葉を生成できませんでした。");
          r.passwordHash = nextHash!;
        }
      },
      name === "act" ? (a.expected_revision as number) : undefined,
    );
    if (name === "leave_room" && r.phase === "lobby")
      return { left: true, url: this.origin };
    return {
      room: publicRoom(r, user.userId, now),
      url: `${this.origin}/?room=${id}`,
      applied: true,
      ...(["control_piece","drop_piece"].includes(name) ? {command_ack:{accepted:true,command_id:a.command_id,turn_id:a.turn_id},message:name === "drop_piece" ? "落下指示を受け付けました。" : "移動・回転の指示を受け付けました。"} : {}),
      ...(pass && r.passwordHash === nextHash
        ? { passphrase: pass, invitation: invitation(this.origin, r, pass) }
        : {}),
    };
  }
}
