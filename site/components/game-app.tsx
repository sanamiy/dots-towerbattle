"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  RotateCw,
  RotateCcw,
  Plus,
  Copy,
  Check,
  X,
  Users,
  ArrowUpRight,
  Sparkles,
  LogOut,
  Play,
  Volume2,
  MessageCircle,
  Link2,
  LoaderCircle,
  Trophy,
  ChevronRight,
  ImagePlus,
  HelpCircle,
  RefreshCw,
} from "lucide-react";
import { PLUGIN_URL } from "@/lib/plugin-config";
import { battleScene, contour } from "@/lib/battle-scene";
import { CHARACTERS, preset } from "@/lib/game/characters";
import {
  processAvatar,
  processPoseSheet,
  posePrompt,
} from "@/lib/avatar-client";
import type {
  Character,
  Profile,
  PublicRoom,
  Action,
} from "@/lib/game/types";

type ApiResult = {
  room?: PublicRoom;
  profile?: Profile;
  rooms?: { id: string; phase: string }[];
  invitation?: string;
  left?: boolean;
  error?: { message: string; code: string };
};
export function Dot({
  character,
  outline = false,
}: {
  character: Character;
  outline?: boolean;
}) {
  const c = character,
    b = c.imageBounds;
  return (
    <g>
      {c.image && b ? (
        <image
          href={c.image}
          x={b.x}
          y={b.y}
          width={b.width}
          height={b.height}
        />
      ) : (
        <>
          <path
            d={contour(c)}
            fill={c.color}
            stroke="#394338"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d={contour(c)} fill="url(#dot-shine)" opacity=".32" />
          <ellipse cx="-14" cy="-2" rx="3.8" ry="6" fill="#344336" />
          <ellipse cx="14" cy="-2" rx="3.8" ry="6" fill="#344336" />
          <ellipse
            cx="-24"
            cy="10"
            rx="6.5"
            ry="3.3"
            fill="#fff"
            opacity=".3"
          />
          <ellipse cx="24" cy="10" rx="6.5" ry="3.3" fill="#fff" opacity=".3" />
          <path
            d="M-4 12 Q0 16 4 12"
            fill="none"
            stroke="#344336"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
      {outline && (
        <polygon
          points={c.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#e25958"
          strokeWidth="1.3"
          strokeDasharray="3 3"
        />
      )}
    </g>
  );
}
function Avatar({
  character,
  size = 56,
  outline = false,
}: {
  character: Character;
  size?: number;
  outline?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-75 -75 150 150"
      aria-hidden="true"
    >
      <Dot character={character} outline={outline} />
    </svg>
  );
}
const SAMPLE_SHEETS: Record<string,string> = {mellow:"/dots/felipe-16-poses-v2.png",pebble:"/dots/iggy-16-poses-v1.png",sprout:"/dots/todd-16-poses-v1.png",puff:"/dots/alfred-16-poses-v1.png"};
function HeroArt() {
  return <figure className="hero-game"><img src="/dots/gameplay-tower.png" alt="公式dotsのキャラクターが実際の物理演算で積み重なったゲーム画面" /><figcaption>ゲーム画面 · デモ対戦</figcaption></figure>;
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  error,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">DOTS TOWER BATTLE</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" aria-label="閉じる" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {error && (
        <div className="modal-error" role="alert">
          {error}
        </div>
      )}
      {children}
    </dialog>
  );
}
function Board({ room, now }: { room: PublicRoom; now: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(1.3);
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width && r.height) setAspect(r.width / r.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const scene = battleScene(room, now, aspect);
  return <svg ref={svgRef} className="game-board" viewBox={scene.viewBox} role="img" aria-label="全員で共有しているタワーの盤面" dangerouslySetInnerHTML={{__html:scene.markup}} />;
}
export default function GameApp({ signedIn }: { signedIn: boolean }) {
  const [profile, setProfile] = useState<Profile>({
      name: "プレイヤー",
      character: preset("mellow"),
    }),
    [room, setRoom] = useState<PublicRoom | null>(null),
    [pass, setPass] = useState(""),
    [invitationText, setInvitationText] = useState("");
  const [modal, setModal] = useState<
      "join" | "profile" | "invite" | "help" | null
    >(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connectionError, setConnectionError] = useState(""),
    [toast, setToast] = useState(""),
    [now, setNow] = useState(Date.now()),
    [offset, setOffset] = useState(0),
    [recent, setRecent] = useState<{ id: string; phase: string }[]>([]);
  const [editName, setEditName] = useState(""),
    [editKind, setEditKind] = useState("mellow"),
    [editColor, setEditColor] = useState("#a7c8ef"),
    [upload, setUpload] = useState<Awaited<
      ReturnType<typeof processAvatar>
    > | null>(null),
    [poseSheet, setPoseSheet] = useState<Awaited<
      ReturnType<typeof processPoseSheet>
    > | null>(null),
    [processing, setProcessing] = useState(false),
    [copied, setCopied] = useState(false);
  const pending = useRef(false);
  const roomRef = useRef(room);
  roomRef.current = room;
  const absorb = useCallback((data: ApiResult) => {
    if (data.room) {
      setRoom(data.room);
      setOffset(data.room.serverTime - Date.now());
      if (typeof window !== "undefined") {
        const u = new URL(window.location.href);
        u.searchParams.set("room", data.room.id);
        window.history.replaceState(null, "", u);
      }
    }
    if (data.profile) setProfile(data.profile);
    if (data.invitation) {
      setInvitationText(data.invitation);
      sessionStorage.setItem(`invite-${data.room?.id}`, data.invitation);
    }
    if (data.left) {
      setRoom(null);

      window.history.replaceState(null, "", "/");
    }
  }, []);
  const request = useCallback(
    async (operation: string, args: Record<string, unknown> = {}) => {
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation, arguments: args }),
        });
        const data = (await res.json()) as ApiResult;
        if (!res.ok)
          throw new Error(data.error?.message ?? "操作できませんでした。");
        absorb(data);
        return data;
      } catch (e) {
        setError(e instanceof Error ? e.message : "通信に失敗しました。");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [absorb],
  );
  useEffect(() => {
    if (!signedIn) return;
    let stop = false;
    const init = async () => {
      try {
        const r = await fetch("/api/game"),
          data = (await r.json()) as ApiResult;
        if (!r.ok) throw new Error(data.error?.message);
        if (stop) return;
        absorb(data);
        setRecent(data.rooms ?? []);
        // Explicit asset-import fallback only; character selection is not part of the normal play flow.
        if (new URL(window.location.href).searchParams.has("asset_import")) {
          setEditName(data.profile?.name ?? "プレイヤー");
          setEditKind(data.profile?.character.kind ?? "mellow");
          setModal("profile");
        }
        const id = new URL(window.location.href).searchParams.get("room");
        if (id) {

          const rr = await fetch(`/api/game?room=${encodeURIComponent(id)}`),
            d = (await rr.json()) as ApiResult;
          if (stop) return;
          if (rr.ok) {
            absorb(d);
            setInvitationText(sessionStorage.getItem(`invite-${id}`) ?? "");
          } else {
            setModal("join");
            if (d.error?.code !== "NOT_MEMBER")
              setError(d.error?.message ?? "部屋を確認してください。");
          }
        }
      } catch (e) {
        if (!stop)
          setError(e instanceof Error ? e.message : "接続できません。");
      }
    };
    init();
    return () => {
      stop = true;
    };
  }, [signedIn, absorb]);
  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    const poll = async () => {
      if (pending.current || document.hidden) return;
      pending.current = true;
      try {
        const res = await fetch(`/api/game?room=${room.id}`, {
            cache: "no-store",
          }),
          data = (await res.json()) as ApiResult;
        if (!cancelled && res.ok) {
          absorb(data);
          setConnectionError("");
        } else if (!cancelled && !res.ok)
          setConnectionError(
            data.error?.message ?? "部屋との接続を確認してください。",
          );
      } catch {
        if (!cancelled) setConnectionError("接続を再試行しています。");
      } finally {
        pending.current = false;
      }
    };
    const id = setInterval(poll, room.phase === "aiming" || room.phase === "falling" ? 300 : 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [room?.id, room?.phase, absorb]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 50);
    return () => clearInterval(id);
  }, [offset]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(id);
  }, [toast]);
  const signIn = () => {
    window.location.href = `/signin-with-chatgpt?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  };
  const needAuth = () => {
    if (!signedIn) {
      signIn();
      return false;
    }
    return true;
  };
  const create = async () => {
    if (!needAuth()) return;
    const data = await request("create_room", {
      command_id: crypto.randomUUID(),
    });
    if (data?.invitation) setModal("invite");
  };
  const roomCommand = (
    operation: string,
    extra: Record<string, unknown> = {},
  ) =>
    room &&
    request(operation, {
      room_id: room.id,
      command_id: crypto.randomUUID(),
      ...extra,
    });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setToast("コピーしました");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("コピーできませんでした。文章を選択してコピーしてください。");
    }
  };
  const openProfile = () => {
    setEditName(profile.name);
    setEditKind(profile.character.kind);
    setEditColor(profile.character.color);
    setUpload(null);
    setPoseSheet(null);
    setModal("profile");
  };
  const saveProfile = async () => {
    if (!needAuth()) return;
    if (upload || poseSheet) {
      setBusy(true);
      setError("");
      try {
        const res = await fetch(poseSheet ? "/api/pose-sheet" : "/api/avatar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              poseSheet
                ? { name: editName, poses: poseSheet }
                : {
                    name: editName,
                    image: upload!.image,
                    character: upload!.character,
                  },
            ),
          }),
          data = (await res.json()) as ApiResult;
        if (!res.ok) throw new Error(data.error?.message);
        absorb(data);
        setModal(null);
        setToast("マイdotを登録しました");
      } catch (e) {
        setError(e instanceof Error ? e.message : "登録できませんでした。");
      } finally {
        setBusy(false);
      }
    } else {
      const data = await request("update_profile", {
        name: editName,
        ...(editKind !== "custom" ? { kind: editKind, color: editColor } : {}),
      });
      if (data) {
        setModal(null);
        setToast("キャラクターを保存しました");
      }
    }
  };
  const me = room?.players.find((p) => p.self),
    active = room?.players[room.active],
    myTurn =
      room?.phase === "aiming" && active?.self && now >= (room.startedAt ?? 0),
    left = room
      ? Math.min(
          45,
          Math.max(
            0,
            Math.ceil(
              (room.deadline - Math.max(now, room.pauseUntil ?? 0)) / 1000,
            ),
          ),
        )
      : 45;
  const editingCharacter = poseSheet
    ? { ...poseSheet[0].character, image: poseSheet[0].image }
    : upload
      ? { ...upload.character, image: upload.image }
      : editKind === "custom"
        ? profile.character
        : preset(editKind, editColor);
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Dots Tower Battle ホーム">
          <span className="brand-glyph">
            <i />
            <i />
            <i />
          </span>
          <span>
            dots<span className="brand-divider">/</span>
            <span className="brand-sub">tower battle</span>
          </span>
        </a>
        <nav>
          <button className="nav-link" aria-label="あそびかた" onClick={() => setModal("help")}>
            <HelpCircle size={16} />
            <span>あそびかた</span>
          </button>
          {!signedIn && <button className="sign-in-button" onClick={signIn}>ChatGPTでサインイン <ArrowUpRight size={14} /></button>}
        </nav>
      </header>
      {(error || connectionError) && (
        <div className="notice error" role="alert">
          <span>{error || connectionError}</span>
          <button
            aria-label="エラーを閉じる"
            onClick={() => {
              setError("");
              setConnectionError("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {!room ? (
        <>
          <main className="home-main">
            <section className="hero-copy">
              <div className="edition">
                <span className="status-dot" /> 最大4人、声であそぶ。
              </div>
              <h1>
                DOTS<br /><span>タワーバトル</span>
              </h1>
              <p className="hero-description">
                「ちょっと右。そこで、落として！」
                <br />
                dotと話して、みんなで積み上げよう。

              </p>
              <div className="home-actions">
                <button
                  className="primary large"
                  onClick={create}
                  disabled={busy}
                >
                  <Plus size={20} /> 部屋をつくる <ArrowUpRight size={18} />
                </button>
                <button
                  className="secondary large"
                  onClick={() => {
                    if (needAuth()) setModal("join");
                  }}
                >
                  合言葉で参加 <ChevronRight size={17} />
                </button>
              </div>
              <p className="entry-note">
                {signedIn
                  ? "dotとの通話で、相談も操作も。"
                  : "ChatGPTアカウントで参加できます。"}
              </p>
              {recent.length > 0 && (
                <div className="recent-rooms">
                  <span>最近の部屋</span>
                  {recent.map((r) => (
                    <button
                      key={r.id}
                      onClick={async () => {
                        const res = await fetch(`/api/game?room=${r.id}`),
                          d = (await res.json()) as ApiResult;
                        if (res.ok) absorb(d);
                        else
                          setError(
                            d.error?.message ?? "接続できませんでした。",
                          );
                      }}
                    >
                      {r.id} <ArrowUpRight size={12} />
                    </button>
                  ))}
                </div>
              )}
            </section>
            <HeroArt />
          </main>
        </>
      ) : (
        <main className="room-main">
          <div className="room-toolbar">
            <div>
              <button
                className="back-link"
                disabled={busy}
                onClick={async () => {
                  if (
                    room.phase === "aiming" &&
                    !window.confirm("降参して部屋を退出しますか？")
                  )
                    return;
                  const d = await roomCommand("leave_room");
                  if (d) {
                    setRoom(null);

                    window.history.replaceState(null, "", "/");
                  }
                }}
              >
                <ArrowLeft size={14} /> 退出
              </button>
              <span className="toolbar-divider" />
                            <strong className="room-code">対戦ルーム</strong>
              <button
                className="icon-button"
                aria-label="参加文をコピーする"
                onClick={() => {
                  setInvitationText(
                    sessionStorage.getItem(`invite-${room.id}`) ??
                      invitationText,
                  );
                  setModal("invite");
                }}
              >
                <Copy size={15} />
              </button>
            </div>
            <span className="connection-state">
              <span className="status-dot" /> オンライン{" "}
              <span>{room.players.length}/4</span>
            </span>
          </div>
          <div className="play-layout">
            <section className="board-panel">
              <div className="board-title">
                <span className="eyebrow">
                  {room.phase === "lobby"
                    ? "THE WAITING ROOM"
                    : room.phase === "preparing" ? "GETTING READY" : room.phase === "finished"
                      ? "NICE TOWER!"
                      : `TURN ${String(room.turnNumber).padStart(2, "0")}`}
                </span>
                <span>
                  {room.phase === "lobby"
                    ? "まもなく、はじまる。"
                    : `最高 ${room.maxHeight.toFixed(1)} m`}
                </span>
              </div>
              <Board room={room} now={now} />
              {room.phase === "lobby" && (
                <div className="board-message">
                  <span>WELCOME TO THE TOWER</span>
                  <h2>
                    みんなが揃うまで、
                    <br />
                    ちょっとひとやすみ。
                  </h2>
                  <p>参加文を友だちのdotに渡して集まろう。</p>
                </div>
              )}
              {room.phase === "preparing" && (
                <div className="board-message" role="status" aria-live="polite">
                  <LoaderCircle size={28} className="animate-spin" />
                  <h2>16ポーズを準備中…</h2>
                  <p>準備が終わったdotから、順番にスタート。<br />相棒と話しながら、もう少し待とう。</p>
                </div>
              )}
              {room.phase === "aiming" && now < (room.startedAt ?? 0) && (
                <div className="countdown">
                  {Math.ceil(((room.startedAt ?? 0) - now) / 1000)}
                </div>
              )}
              {room.phase === "falling" && (
                <div className="flight-label" role="status" aria-live="polite">
                  <span className="status-dot" />
                  {now < room.flight!.startedAt + room.flight!.duration
                    ? room.flight!.trigger === "command" ? "落下指示を受付 · 落下中…" : room.flight!.trigger === "timeout" ? "時間切れで自動落下…" : "落下中…"
                    : room.flight!.safe
                      ? "セーフ！"
                      : "あっ…！"}
                </div>
              )}
              {room.phase === "finished" && (
                <div className="result-overlay">
                  <Trophy size={36} />
                  <span className="eyebrow">{room.players.length === 1 ? "PRACTICE END" : "GAME SET"}</span>
                  <h2>
                    {room.players.length === 1 ? "ひとりチャレンジ" : (room.players.filter((p) => p.rank === 1 && p.alive).map((p) => p.name).join("・") || "今回は勝者なし")}
                    <br />
                    <span>
                      {room.players.length === 1 ? `${room.players[0].successes}回成功！` : room.players.filter((p) => p.rank === 1).length > 1
                        ? "同率1位！"
                        : room.players.some(p => p.rank === 1 && p.alive) ? "の勝ち！" : "おつかれさま！"}
                    </span>
                  </h2>
                  <p>今日も、いいタワーでした。</p>
                  <p>もう一度なら、dotに「もう一回あそぼう」と話しかけて。</p>
                </div>
              )}
            </section>
            <aside className="room-sidebar">
              <section className="players-card">
                <div className="card-heading">
                  <h3>この部屋のdot</h3>
                  <span>{room.players.length} / 4</span>
                </div>
                <div className="player-list">
                  {Array.from({ length: 4 }, (_, i) => {
                    const p = room.players[i];
                    return p ? (
                      <div
                        key={p.id}
                        className={`player-row ${active?.id === p.id && (room.phase === "aiming" || room.phase === "falling") ? "active" : ""} ${!p.alive ? "eliminated" : ""}`}
                      >
                        <div
                          className="player-avatar"
                          style={{ background: p.character.color + "33" }}
                        >
                          <Avatar character={p.character} size={55} />
                        </div>
                        <div className="player-info">
                          <strong>
                            {p.name}
                            {p.self && <small>YOU</small>}
                          </strong>
                          <span>
                            {room.phase === "lobby"
                              ? p.ready
                                ? "準備OK"
                                : "dotを待っています"
                              : `${p.successes}回成功${p.rank ? ` · ${p.rank}位` : ""}`}
                          </span>
                          <span>{p.posePreparation === "complete" ? "16ポーズ準備OK" : "16ポーズを準備中…"}</span>
                        </div>
                        <span
                          className={`player-status ${p.ready ? "ready" : ""}`}
                        >
                          {room.phase === "lobby" ? (
                            p.ready ? (
                              <Check size={17} />
                            ) : p.host ? (
                              <span className="host-label">HOST</span>
                            ) : (
                              <span className="waiting-dot" />
                            )
                          ) : p.rank === 1 && p.alive ? (
                            <Trophy size={17} />
                          ) : !p.alive ? (
                            <span className="out-label">OUT</span>
                          ) : active?.id === p.id && (room.phase === "aiming" || room.phase === "falling") ? (
                            <Play size={15} />
                          ) : null}
                        </span>
                      </div>
                    ) : (
                      <div className="player-row vacant" key={i}>
                        <div className="empty-avatar">
                          <Plus size={18} />
                        </div>
                        <div className="player-info">
                          <strong>友だちのdotを待っています</strong>
                          <span>合言葉で参加できます</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {room.phase === "lobby" && (
                  <>
                    <button
                      className="secondary full"
                      onClick={() => setModal("invite")}
                    >
                      <Link2 size={15} /> 友だちを招待
                    </button>
                    <p className="voice-control">参加文を自分のdotへ渡そう。<br />「準備できた」「はじめよう」も、dotとの会話で。</p>
                    <p className="sidebar-note">
                      1人で練習、2〜4人で対戦。16ポーズが完成した人から順にスタート。
                    </p>
                  </>
                )}
              </section>
              {(room.phase === "aiming" || room.phase === "falling") && (
                <section className="control-card">
                  <div className="turn-heading">
                    <span>
                      {room.phase === "falling"
                        ? "着地判定中"
                        : room.pauseUntil && room.pauseUntil > now
                          ? "再接続を待っています"
                          : myTurn
                            ? "あなたの番です"
                            : `${active?.name}の番`}
                    </span>
                    <strong
                      className={
                        left <= 10 && room.phase === "aiming" ? "urgent" : ""
                      }
                    >
                      {room.phase === "aiming" ? `${left}s` : "…"}
                    </strong>
                  </div>
                  <div className="time-track">
                    <div
                      style={{
                        width: `${room.phase === "aiming" ? Math.min(100, (left / 45) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="voice-control">
                    <Volume2 size={25} />
                    <h3>{myTurn ? "相棒に、声をかけよう。" : "相棒と話しながら、待とう。"}</h3>
                    <p>「少し左」「15度回して」「そこで落として」</p>
                    {room.preview && <small>今回のサイズ {Math.round((room.preview.character.sizeScale ?? 1)*100)}%</small>}
                    <small>自分のdotとの通話で操作します。45秒で自動落下。</small>
                  </div>
                </section>
              )}
              {room.phase === "aiming" && room.nextCharacter && (
                <section className="next-card">
                  <div>
                    <span className="eyebrow">NEXT DOT</span>
                    <p>次に落ちてくる相棒</p>
                  </div>
                  <Avatar character={room.nextCharacter} size={64} />
                </section>
              )}
              {room.phase === "lobby" && <section className="dot-tip"><span><Volume2 size={16} /> VOICE PLAY</span><p>参加文を自分のdotに渡したら、dotとの会話の電話ボタンから通話を開始。「準備できた」も、そのまま声で伝えよう。</p></section>}
              {room.lastResult && (
                <div
                  className={`last-result ${room.lastResult.safe ? "" : "failed"}`}
                  role="status"
                >
                  {room.lastResult.safe ? <Check size={17} /> : <X size={17} />}
                  <span>{room.lastResult.trigger === "timeout" ? "時間切れで自動落下 · " : ""}{room.lastResult.text}</span>
                </div>
              )}
            </aside>
          </div>
        </main>
      )}
      <footer className="site-footer">
        <span>MADE FOR LITTLE MOMENTS TOGETHER.</span>
        <span>非公式のファンゲーム · OpenAIとは提携していません</span>
        <button onClick={() => setModal("help")}>
          あそびかた <ArrowUpRight size={12} />
        </button>
      </footer>
      {modal === "join" && (
        <Modal
          error={error}
          title="合言葉で、あつまろう。"
          subtitle="友だちから届いた合言葉をひとつ入力。"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const d = await request("join_room", {
                passphrase: pass.trim().toUpperCase(),
                command_id: crypto.randomUUID(),
              });
              if (d) {
                setModal(null);
                setPass("");
              }
            }}
          >
            <label className="field-label">
              合言葉
              <input
                value={pass}
                onChange={(e) => setPass(e.target.value.toUpperCase())}
                maxLength={64}
                placeholder="友だちから届いた合言葉"
                autoFocus
                autoComplete="off"
                required
              />
            </label>
            <button className="primary full" disabled={busy} type="submit">
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ArrowUpRight size={17} />
              )}{" "}
              この部屋に参加する
            </button>
          </form>
        </Modal>
      )}
      {modal === "invite" && room && (
        <Modal
          error={error}
          title="この参加文を、自分のdotへ。"
          subtitle="ホストも友だちも、それぞれのdotへ同じ参加文を渡します。"
          onClose={() => setModal(null)}
        >
          {invitationText ? (
            <>
              <textarea
                className="invite-text"
                value={invitationText}
                readOnly
                rows={9}
              />
              <button
                className="primary full"
                onClick={() => copy(invitationText)}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
                参加プロンプトをコピー
              </button>
            </>
          ) : (
            <div className="invite-empty">
              <Link2 size={28} />
              <p>
                合言葉は作成した端末だけに表示されます。
                <br />
                {me?.host
                  ? "再発行して、新しい参加文を共有できます。"
                  : "ホストから参加文を受け取ってください。"}
              </p>
            </div>
          )}
          {me?.host && room.phase === "lobby" && (
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                const d = await roomCommand("rotate_invite");
                if (d?.invitation) setToast("新しい合言葉を発行しました");
              }}
            >
              合言葉を再発行する
            </button>
          )}
          <details className="first-connection">
            <summary>初回だけ：dotにゲームが見つからないとき</summary>
            <p>各自のChatGPTで <a href={PLUGIN_URL} target="_blank" rel="noreferrer">Dots Tower Battleの接続を確認 ↗</a>。インストール・接続後、いつものdotへ上の参加文を渡してください。接続済みならこの操作は不要です。</p>
            <p>友だちのアカウントで表示されない場合は、プラグインの共有・利用範囲の確認が必要です。部屋への入室だけでは接続は完了しません。</p>
          </details>
        </Modal>
      )}
      {modal === "profile" && (
        <Modal
          error={error}
          title="あなたの、ちいさな相棒。"
          subtitle="公式dotsの見本を選ぶか、自分のdotの画像を登録。"
          onClose={() => setModal(null)}
        >
          <div className="avatar-preview">
            <Avatar
              character={editingCharacter}
              size={150}
              outline={!!upload}
            />
            {upload && <span>赤い線が当たり判定です</span>}
          </div>
          <label className="field-label">
            表示名
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={24}
              placeholder="あなたの名前"
            />
          </label>
          <div className="character-picker">
            {CHARACTERS.map((c) => (
              <button
                key={c.kind}
                className={
                  editKind === c.kind && !upload && !poseSheet ? "selected" : ""
                }
                aria-label={c.name}
                onClick={() => {
                  setEditKind(c.kind);
                  setEditColor(c.color);
                  setUpload(null);
                  setPoseSheet(null);
                }}
              >
                <Avatar character={c} size={60} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
          <label className="upload-button">
            <ImagePlus size={17} />
            {processing ? "画像を準備中…" : "自分のdotの画像を登録"}
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg"
              disabled={processing}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setProcessing(true);
                setError("");
                try {
                  setUpload(await processAvatar(file));
                  setPoseSheet(null);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "画像を読み込めません。",
                  );
                } finally {
                  setProcessing(false);
                }
              }}
            />
          </label>
          <p className="sidebar-note">
            正面向き・透明背景の画像がおすすめ。5MB、2048px以内。
            <br />
            追加ポーズは次の手番から使えます。
          </p>
          <div className="pose-section">
            <h3>もっと楽しく。16のポーズを連れていく。</h3>
            <p>
              dotに生成プロンプトと自分の画像を渡して、4×4のシートを作ろう。各ポーズの形が、そのまま積みやすさになります。
            </p>
            <button className="secondary full" onClick={() => copy(posePrompt)}>
              <Copy size={14} /> dotに渡す生成プロンプトをコピー
            </button>
            <p className="sample-origin">見本は選んだキャラクターのOpenAI公式画像を元に生成した16ポーズです。本人のdotの画像を使う場合は、下から登録できます。</p>
            <div className="sample-poses">
              <img
                src={SAMPLE_SHEETS[editKind]??SAMPLE_SHEETS.mellow}
                alt="選択したdotsキャラクターを元に生成した16ポーズの見本（公式ポーズ集ではありません）"
                loading="lazy"
              />
              <div>
                <button
                  className="secondary full"
                  disabled={processing || busy}
                  onClick={async () => {
                    setProcessing(true);
                    setError("");
                    try {
                      const response = await fetch(SAMPLE_SHEETS[editKind]??SAMPLE_SHEETS.mellow);
                      if (!response.ok)
                        throw new Error("サンプルを読み込めません。");
                      const blob = await response.blob();
                      setPoseSheet(
                        await processPoseSheet(
                          new File([blob], "dot-16-poses.png", {
                            type: "image/png",
                          }),
                        ),
                      );
                      setUpload(null);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "サンプルを読み込めません。",
                      );
                    } finally {
                      setProcessing(false);
                    }
                  }}
                >
                  {processing ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  サンプルの16ポーズを使う
                </button>
                <a href={SAMPLE_SHEETS[editKind]??SAMPLE_SHEETS.mellow} download>
                  PNGをダウンロード ↗
                </a>
              </div>
            </div>
            <label className="upload-button">
              <ImagePlus size={16} />
              {processing ? "16ポーズを準備中…" : "4×4ポーズシートを読み込む"}
              <input
                type="file"
                accept="image/png,image/webp,image/jpeg"
                disabled={processing}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setProcessing(true);
                  setError("");
                  try {
                    setPoseSheet(await processPoseSheet(file));
                    setUpload(null);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "ポーズシートを読み込めません。",
                    );
                  } finally {
                    setProcessing(false);
                  }
                }}
              />
            </label>
            {poseSheet ? (
              <>
                <div className="pose-preview">
                  {poseSheet.map((p, i) => (
                    <Avatar
                      key={i}
                      character={{ ...p.character, image: p.image }}
                      outline
                      size={85}
                    />
                  ))}
                </div>
                <span className="pose-count">
                  16 POSES READY · 赤い線が当たり判定
                </span>
              </>
            ) : (
              profile.character.poses && (
                <span className="pose-count">
                  {profile.character.poses.length} POSES REGISTERED
                </span>
              )
            )}
            <p className="sidebar-note">
              正方形の4×4シート、最大16MB・4096px。
              <br />
              透明か白の無地背景、マスの境界に余白を残してください。
            </p>
          </div>
          <button
            className="primary full"
            disabled={busy || processing || !editName.trim()}
            onClick={saveProfile}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}{" "}
            このキャラクターであそぶ
          </button>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          error={error}
          title="dotと一緒に、タワーバトル。"
          onClose={() => setModal(null)}
        >
          <div className="help-steps">
            <p><b>01</b><span><strong>ホストが部屋をつくる</strong>ChatGPTでサインインして「部屋をつくる」。表示された参加文をコピーします。</span></p>
            <p><b>02</b><span><strong>全員が、いつものdotへ参加文を渡す</strong>ホスト本人も友だちも同じ参加文を使います。名前の登録と入室は各自のdotが担当。初回の接続案内は参加文の下にあります。</span></p>
            <p><b>03</b><span><strong>ポーズを準備して、できた人からスタート</strong>最初の画像が届いたら、dotはすぐ16ポーズの生成を始めます。「準備できた」、ホストは「はじめよう」と伝えてください。16ポーズの登録が終わった順に手番が始まり、未完了の人には「準備中」と表示します。</span></p>
            <p><b>04</b><span><strong>声で相談して、積み上げる</strong>画面は盤面を眺める場所。操作は自分のdotとの通話で「少し右」「回転」「落として」。手番は45秒。落下したら脱落、最後まで残った人の勝ちです。1人でも練習できます。</span></p>
          </div>
          <p className="sidebar-note">
            自分の番には、自分のdotがポーズを変えて出現します。
            <br />
            12分または48回成功で、残った人が同率1位になります。
            <br />
            音声通話からの操作はクライアントの対応状況によります。
          </p>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
