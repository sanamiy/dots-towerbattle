import { PLUGIN_URL } from "@/lib/plugin-config";
export default function PluginPage() {
  return <main className="plugin-page">
    <a className="back-link" href="/">← ゲームへ戻る</a>
    <span className="eyebrow">FIRST CONNECTION</span>
    <h1>はじめての接続。</h1>
    <p>接続済みなら、部屋の参加文をいつものdotへ渡すだけです。</p>
    <ol>
      <li>ホストがゲーム画面で部屋をつくり、参加文をコピー。</li>
      <li>ホストも友だちも、各自のChatGPTで初回だけゲームを接続。</li>
      <li>同じ参加文を、それぞれのdotへ渡す。元画像の共有が必要なら一度だけ共有。</li>
      <li>dotが入室・16ポーズの生成と登録を担当。「準備できた」、ホストは「はじめよう」と伝える。</li>
      <li>16ポーズが完成した順に手番が開始。未完了の間は準備中。声で相談しながら操作。</li>
    </ol>
    <p><a href={PLUGIN_URL} target="_top">Dots Tower Battleの接続を確認 ↗</a></p>
    <p>友だちのアカウントでプラグインが表示されない場合は、ホスト側で共有・利用範囲の確認が必要です。サイトが公開されていることと、各自のdotへの接続は別の状態です。</p>
    <details><summary>「Unauthorized」と表示されたとき</summary>
      <p>/mcp は認証したdotが呼び出す接続先です。URLをブラウザで直接開くと401になることがあります。遊ぶときはゲーム画面へ戻り、参加文をdotに渡してください。プラグインからの呼び出しでも認証に失敗する場合は、接続状態を確認してください。</p>
    </details>
    <p>画像生成・背景処理・音声操作は利用中のdotの対応状況に依存します。生成できない場合は準備完了とせず、dotが理由を案内します。</p>
  </main>;
}
