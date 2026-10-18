# Dots Tower Battle

OpenAIのdotからMCPで参加・操作できる、2〜4人用のオンライン物理タワーバトル。

## 遊び方

1. サイトに各自のChatGPTアカウントでサインイン。
2. 右上で表示名とキャラクターを登録。PNG/WebP/JPEG、または4×4の16ポーズシートを使用可能。
3. ホストが部屋を作り、参加プロンプトを共有。
4. 各自のdotへ参加文を渡す。MCPプラグインのインストール・接続が初回のみ必要。
5. 全員が準備完了にし、ホストが開始。左・右・回転・落下を会話または画面のボタンで操作。

1手45秒。失敗した人が脱落し、失敗前の盤面から再開する。最後の1人が勝者。12分または48回成功で残存者は同率1位。相手のキャラクターも共通の駒として出現する。

## ポーズシート

キャラクター設定から「dotに渡す生成プロンプト」をコピーし、本人の参照画像と一緒に利用可能な画像生成機能へ渡す。4行×4列、同じキャラクター、無地の透明または白背景、各セルに余白を持つ正方形画像を使う。最大4096px・16MB。

ゲームは16セルを切り抜き、背景を処理し、主な輪郭を当たり判定へ変換する。登録前に赤い輪郭を確認できる。各dotの16ポーズは、使い切るまで同じポーズが出ない袋方式。試合開始時に外見を固定し、登録変更は次の試合から反映する。

画像生成モデルへの自動課金やAPI呼び出しは含まない。OpenAIのdotの外見を直接取得する未公開APIには依存しない。

## 構成

- Vinext / React / Cloudflare Workers、SitesのMCP公開機能
- D1: プロフィール、部屋の正本、操作の重複排除、イベント購読
- R2: キャラクター画像
- Matter.js / poly-decomp: サーバー側の2D物理計算
- MCP 2026-07-28: tools、Events。従来のinitializeにも対応

追加の常駐サーバー契約なしで公開するため、当初のRapier + PostgreSQL + WebSocket案を、Matter.js + D1 + HTTP同期へ変更した。サーバーが固定120ステップ毎秒で落下の全軌道を計算・永続化し、各画面は同じ時刻に合わせて15fpsの記録を補間する。画面は1秒間隔で同期する。物理結果はブラウザーから受け付けない。

手番の更新は画面またはMCPからの要求で進行する。画面を全員が閉じた状態での定時実行サービスは含まない。再接続時には保存済みの時刻・軌道から処理を再開する。MCP Eventsの配信も状態取得・操作をきっかけに行う。

Sitesが注入するSite内で安定したChatGPTユーザーIDを認証に使う。クライアント指定のplayer_idで認証を代替しない。D1のrevision比較付き更新により、同時入室で4席を超えたり、同じ落下が二重に実行されたりしない。

## 開発

Node.js 24 LTSを推奨。

```sh
npm ci
npm run test
npm run typecheck
npm run build
```

初回のみローカルD1へ生成済みマイグレーションを適用する。

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_high_norrin_radd.sql
npm run dev -- --port 5173
```

開発サーバーのローカルサインインは、スターターが用意した開発用アカウントを使用する。本番認証はSitesが担当する。

```sh
npm start -- --port 5173
node scripts/verify-http.mjs
```

`verify-http.mjs`は、ローカルの構築済みWorkerに4つのテスト用認証IDで接続し、実際のHTTP MCP経由で試合を完了する。5人目、無認証、手番外の操作、重複命令も検証する。本番ホストでは実行できない。

## MCP

`POST /mcp`。Sitesが認証とプラグイン接続を提供する。ツール一覧は`tools/list`で取得できる。

- `get_profile`, `update_profile`, `get_pose_prompt`
- `create_room`, `join_room`, `get_room`, `rotate_invite`
- `set_ready`, `start_match`, `get_game_state`, `act`
- `leave_room`, `rematch`

`act`には`room_id`、`turn_id`、`expected_revision`、`command_id`、`actions`が必要。右は`move amount:24.6`、左は`-24.6`、少しは`4.92`、回転は`rotate degrees:15`。`drop`は明示的な落下指示の時だけ末尾に置く。

購読イベントは`turn.started`、`turn.resolved`、`match.finished`。本人が所属する部屋だけ購読可能。コールバックはOpenAIのHTTPSドメインへ限定し、Standard Webhooks形式で署名・検証する。試合終了時に購読を削除する。dotsの実際の音声中のツール実行や通知読み上げは、このアプリ側では保証しない。

## 検証範囲

ドメインの自動テスト、型チェック、本番ビルド、ローカルWorkerの4人分HTTP対戦を実施。4つの本物のdotとの会話から同時参加する確認は、各参加者によるプラグイン接続後に行う。
