# AI ツール向け会社 PC セットアッププロンプト

会社 PC に展開したソースフォルダーで、Codex などローカルのファイルとターミナルを操作できるツールに次のように依頼してください。

> `docs/ja/SETUP_PROMPT.md` を見て、この会社 PC に Markdown Task Manager をセットアップして。

ファイルを参照できないチャットには、以下の指示と [セットアップ手順](COMPANY_PC_SETUP.md) を渡してください。

## AI への指示

1. `AGENTS.md` と [会社 PC でのセットアップ](COMPANY_PC_SETUP.md) を読み、会社 PC 上で実際にセットアップを進めてください。作業場所が `package.json` を含む展開済みソースルートであることと、シェルが Windows・WSL・macOS のどれで動いているかを確認してください。GitHub 接続・clone・Git 初期化は不要です。
2. 既存の `local.config.json` と `MTM_*` の上書き設定、利用者から指定された保存先を先に確認してください。新規の Windows / WSL では、確認できる会社用 OneDrive を既定の保存先にします。Google Drive の指定があればマウント済みの実パスを使います。macOS では利用者が指定した同期ドライブを使い、候補が一つに決まる場合はそのドライブを使ってください。同期先や既存データの場所を安全に特定できない場合は、そのパスだけ利用者に確認してください。
3. 同期対象外の A にソースを置き、B `app`・C `data`・D `backup` をそれぞれ用意し、必要に応じて `local.config.json` を UTF-8 で作成してください。既存設定を活用し、既存データの移動・上書きやサンプルの投入は行わないでください。WSL では Windows 側でも選べる保存先を使い、Linux の設定パスと Windows のブラウザー用パスを確認してください。Google Drive を WSL から書き込めない場合は、Windows 側の作業に切り替えてください。
4. Node.js 20 以上を確認して `npm run config:check` と `npm run build:check` を実行してください。HTML がソースと一致していれば依存関係のインストールは省けます。ビルドが必要な場合は手順書の方法で `npm ci` → `npm run build` → `npm run build:check` を実行し、成功を確認してください。Windows の PowerShell で `npm` が実行ポリシーにより止まる場合は `npm.cmd` を使ってください。
5. `npm run deploy:dry` で表示された配備先を確認し、`npm run deploy` と `npm run backup -- --no-local-config` を実行してください。B の HTML と今回作成した D の `source` 内の ZIP を確認してください。Node.js を利用できない場合は同梱 HTML での起動を進め、残る配備・バックアップの作業を伝えてください。
6. 配備した HTML を会社 PC 側の Edge / Chrome で開いて C を選び、読み書きが許可されてボードが表示されることを確認してください。ローカル HTML が開けない場合は、会社で許可されていれば手順書のループバック配信を使ってください。ブラウザーのフォルダー選択や許可を操作できない場合は、利用者に開く HTML または URL と選ぶフォルダーの実パスを示し、その操作だけ依頼してください。旧形式の実データは、利用者が [自動移行](USER_GUIDE.md#旧形式v1のファイルを開いたとき) を確認してから開いてください。
7. ブラウザーで確認でき、Node.js と npm も使える場合は `npm run tasks -- check` を実行してください。開く HTML、データフォルダー、作成した ZIP、確認できたこと、利用者側で残っている操作を報告してください。クラウドへの同期完了はドライブクライアントで確認できた場合に報告してください。
