# Dots Tower Battle

OpenAIのdotからMCPで参加・操作できる、1人で練習、2〜4人で対戦できるオンライン物理タワーバトル。

## 遊び方

1. サイトに各自のChatGPTアカウントでサインイン。
2. 名前と外見はdotがMCPの`update_profile`で登録する。通常画面にプレイヤー設定は設けない。
3. ホストが部屋を作り、合言葉入りの参加プロンプトを共有。部屋IDの入力は不要。
4. 各自のdotへ参加文を渡す。MCPプラグインのインストール・接続が初回のみ必要。
5. dotに「準備できた」と伝え、ホストが「はじめよう」と伝えてMCPで開始。dotとの会話の電話ボタンから通話を開始。左・右・回転・落下を声で指示する。

1手45秒。失敗した人が脱落し、失敗前の盤面から再開する。最後の1人が勝者。12分または48回成功で残存者は同率1位。自分の手番では自分が登録したdotのポーズを落とす。

## ポーズシート

dotが`get_pose_prompt`を取得し、本人の参照画像と一緒に利用可能な画像生成機能へ渡す。完成した透明PNGの実ファイルを`register_character_image`へ渡す。最初の1枚は`layout:single`、4×4シートは`layout:sheet_4x4`。MCPのファイル入力は最大2048px・8MBで、利用者がダウンロードし直す必要はない。旧手動インポート画面は最大4096px・16MBのまま残す。

ゲームは16セルを切り抜き、背景を処理し、主な輪郭を当たり判定へ変換する。登録前に赤い輪郭を確認できる。各dotの16ポーズは、使い切るまで同じポーズが出ない袋方式。各手番の開始時に利用する外見を固定する。追加ポーズが届いたら次の手番から採用し、すでに落ちた駒と操作中の駒の見た目・当たり判定は変更しない。最初の1枚の登録成功直後に16ポーズの背景生成を起動する。ゲーム開始・相手の手番を待たずに生成を開始し、全員の完了前でもゲームを開始・続行してよい。本人の最初の手番は16ポーズ登録後に始まる。

LPの16ポーズ展示は外し、公式4体を参照して生成した各16ポーズを使ったデモ対戦の実盤面を掲載。キャラクター設定の16ポーズ見本は公式Felipe・Iggy・Todd・Alfred画像を参照した生成物で、公式ポーズ集ではないことを明記する。元画像と取得URLは`assets/references/dots-sources.json`。各キャラクター・各ポーズを別々にPNGの透明度から輪郭抽出し、重心と画像の原点をそろえる。

画像生成モデルへの自動課金やAPI呼び出しは含まない。OpenAIのdotの外見を直接取得する未公開APIには依存しない。

## dotと盤面を見ながら作戦会議

`get_battle_view`は参加者に限って、最新のサーバー盤面を960×720のPNGとしてMCPのimage contentに返す。画面と同じ`lib/battle-scene.ts`を使い、現在のポーズ・位置・角度・積まれた駒・落下中の記録フレームを描く。登録済みPNGはR2から内部で読み込み、外部画像URLの取得は行わない。ブラウザ画面を閉じていても取得できる。HTTP版`/api/battle-view`も同じ参加認証とprivate/no-storeで保護する。

参加プロンプトでは、本人の手番の通知を受けたdotが盤面画像を取得し、ポーズやタワーの特徴を一つ拾って、短いひとことと質問一つで会話を始めるよう依頼する。作戦相談だけでは動かさず、落下は本人の明示指示時だけ。画面には作戦の選択肢や移動・回転・落下ボタンを設けず、会話そのものと操作の指示は本人のdotとの通話で行う。

この方式は接続中のdot自身に画像を渡すため、別のモデル呼び出し・Decisions API・追加APIキーを使わない。イベントからの自発的な会話は、dotsまたはChatGPT Work（デスクトップはCloud）のMCP Events購読が有効な環境で利用する。イベントは事実だけを送り、会話の指示は本人が渡す参加文とツール説明に含める。

```sh
node scripts/verify-battle-view.mjs
```

`verify-battle-view.mjs`はローカル限定で、MCPの実PNG・960×720寸法・非参加者拒否・匿名拒否・HTTP画像のキャッシュ禁止を検証する。

## 構成

- Vinext / React / Cloudflare Workers、SitesのMCP公開機能
- D1: プロフィール、部屋の正本、操作の重複排除、イベント購読
- R2: キャラクター画像
- Matter.js / Earcut: サーバー側の2D物理計算
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
- `set_ready`, `start_match`, `get_game_state`, `get_battle_view`, `act`
- `leave_room`, `rematch`

`act`には`room_id`、`turn_id`、`expected_revision`、`command_id`、`actions`が必要。右は`move amount:24.6`、左は`-24.6`、少しは`4.92`、回転は`rotate degrees:15`。`drop`は明示的な落下指示の時だけ末尾に置く。

購読イベントは`turn.started`、`turn.resolved`、`match.finished`。本人が所属する部屋だけ購読可能。コールバックはOpenAIのHTTPSドメインへ限定し、Standard Webhooks形式で署名・検証する。試合終了時に購読を削除する。dotsの実際の音声中のツール実行や通知読み上げは、このアプリ側では保証しない。

## 検証範囲

ドメインの自動テスト、型チェック、本番ビルド、ローカルWorkerの4人分HTTP対戦を実施。4つの本物のdotとの会話から同時参加する確認は、各参加者によるプラグイン接続後に行う。

## 画像登録時の衝突形状の自動設定

```sh
npm run colliders -- --input my-dot-16.png --sheet --output outputs/my-dot
# 単体画像なら --sheet を省略
npm run colliders -- --refresh-samples
```

`prepare-colliders.ts`はPNGのアルファからd3-contourで輪郭を抽出し、simplify-jsで頂点を削減、Earcutで三角形に分割してから面積を保つ凸多角形へまとめる。画像、輪郭、重心、凸形状を各ポーズごとに保存する。輪郭内は一様密度。登録時は基準面積にそろえ、実際の駒はポーズ番号ごとに固定した30〜150%の倍率で生成する。画像・輪郭・凸形状に同じ倍率を適用し、質量は倍率の2乗とする。細かい毛先は許容幅にまとめ、閉じた穴は塗りつぶす。主な体がつながった透明PNGを使う。

Web登録も同じ処理をサーバー側で画像から再計算し、クライアントが送った形状は採用しない。手番開始時に4人それぞれの利用可能な形状を読み込み、全員へ同じ物理計算の記録を配信する。見本64ポーズの形状・重心・面積保存と着地後の貫通許容値は自動テストで確認する。

通常画面は部屋作成・合言葉参加・招待共有・観戦に絞る。準備、開始、再戦もdotとの会話で行う。本人のdotの外見を直接取得する公開APIは確認できていない。本人の参照画像を一度共有し、以後はdotが生成した実ファイルをMCP経由で直接登録する。見た目を確認できないdotに別キャラクターを推測させない。

## dotからの画像ファイル直接登録

公式の[ファイル入力仕様](https://developers.openai.com/plugins/reference#define-file-inputs)に沿って、`register_character_image`の`_meta["openai/fileParams"]`へ`["file"]`を指定する。`file`は`download_url`・`file_id`が必須、`mime_type`・`file_name`を任意のプロパティとして公開する。モデルにBase64やURLを推測させない。

サーバーは対応するファイルCDN（またはこのゲームの公開サンプルPNG）から、認証ヘッダーを転送せず、リダイレクトなし・10秒・8MB上限で取得する。一時URLは保存も結果への返却もしない。PNGヘッダー、解像度、透明背景、全16セルの輪郭を確認してからR2へ保存し、本人のプロフィールだけ更新する。同じ画像・同じ利用者では保存キーが同じになり、再取得で一時URLが変わっても画像は重複しない。

画像生成自体はdot側で利用可能な機能が担当し、ゲームはモデルAPIを呼ばない。`fileParams`のサーバー契約と画像登録は検証するが、実際のdotで生成したファイルを渡す一連の動作は接続環境で確認が必要。

16ポーズは任意の追加要素ではなく必須の準備手順。`get_profile`・入室・作成の結果の`pose_preparation`が、本人の16ポーズ登録までは`required`、登録後は`complete`になる。デモ用の公式見本16枚は本人の生成完了として数えない。singleの登録結果に`next_action:start_pose_generation_now`と生成プロンプトを返し、dotは直ちに背景生成を起動してから入室・準備を続ける。全員の生成完了前にゲームを始めてよい。最初の手番は本人の16ポーズ登録完了順。未完了の人は「16ポーズを準備中」と表示し、操作タイマーは動かさない。完成した人は次の手番候補へ入り、全員が初回を終えた後はその順で巡回する。生成機能が使えない時は理由を伝え、未完了を完了と偽らない。

通知購読はMCP Eventsの署名付きコールバックで検証する。Cloudflare Workersではfetchのredirect:errorを利用できないためmanualを使い、3xxは失敗として扱って転送先を取得しない。通知先検証の失敗はJSON-RPC -32015とreasonを返す。配信が一時的に失敗した場合はカーソルを進めず、次回の状態取得・操作時に同じイベントIDで再送する。

`node scripts/verify-events-worker.mjs`はNode 24で実行する。実際のWorkersランタイムと一時D1で購読・署名検証・本人の手番フィルター・結果配信・一時失敗後の再送・解除・試合終了時の削除を確認する。通知先はローカルで差し替え、実際のdotには配信しない。

音声の操作は手番開始時に取得したturn_idを使い、control_pieceで移動・回転、drop_pieceで単独落下を実行する。各発話の前の画像・状態再取得やrevision取得は不要。現在位置への相対操作をCASで保存し、手番・本人・時間切れの検査とcommand_idの重複防止は維持する。指示順を守り、手番が変わった場合は古い指示を次の手番へ勝手に再適用しない。

通知配信はnext/serverのafterで応答後に継続し、盤面取得や操作の返答をコールバック通信で待たせない。プレイ中の画面は300ms間隔で更新する。Flight.triggerで声の指示による落下と時間切れの自動落下を識別し、受付表示と直近の結果に反映する。音声認識とdot側の判断にかかる時間はサーバーの操作応答時間とは別。
