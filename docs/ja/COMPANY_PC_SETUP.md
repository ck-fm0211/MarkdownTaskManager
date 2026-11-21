# GitHub から clone できない会社 PC でのセットアップ

Windows・WSL・macOS にソース ZIP を持ち込み、Edge または Chrome で使えるようにします。
配備・ソースバックアップには Node.js 20 以上と npm が必要です。同梱 HTML がソースと一致していれば、npm レジストリへの接続も不要です。

## Codex などに任せる場合

ZIP を展開したら、会社 PC 上でファイルとターミナルを操作できる AI ツールで、`package.json` があるフォルダーを開いて次のように依頼します。
Google Drive を使う場合は、依頼にマウント済みフォルダーのパスを添えます。

> `docs/ja/SETUP_PROMPT.md` を見て、この会社 PC に Markdown Task Manager をセットアップして。

ブラウザーのフォルダー選択・書き込み許可は、AI が操作できない場合に画面で行います。

## 1. ソースを持ち込む

1. GitHub にアクセスできる端末で、使うブランチまたはタグを選んで **Code → Download ZIP** を実行します。手元に配布用 ZIP がある場合はそれを使えます。配布用 ZIP の作り方は [運用ガイド](OPERATIONS.md) を参照してください。
2. 会社で認められた経路でソース ZIP を移し、同期対象外のフォルダーに展開します。このフォルダーを **A（開発）** とします。
   Windows のデスクトップやドキュメントは OneDrive の同期対象になっていることが多く、ダウンロードも設定次第で対象になります。
   展開先の実パスを確認し、同期対象のフォルダーは避けてください。`npm ci` で作る `node_modules` も同期されるためです。
   `npm run config:check` では A 自体が同期対象かどうかは判定できません。
3. `package.json`、`package-lock.json`、`src/`、`scripts/`、`task-manager.html` が同じ階層にあることを確認します。ZIP によっては展開先の中にもう一段フォルダーがあります。

## 2. 運用するフォルダーを決める

同期ドライブ上に `TaskManager` フォルダーを作り、その下に **B `app`（配備済み HTML）**、**C `data`（タスク）**、**D `backup`（ソース ZIP・旧 HTML）** を用意します。既存の設定やデータがある場合は、実際のフォルダーを使います。

| 環境 | A の例（同期対象外） | OneDrive 上の `TaskManager` の例 | Google Drive 上の `TaskManager` の例 |
|---|---|---|---|
| Windows（PowerShell / コマンドプロンプト） | `%USERPROFILE%\dev\MarkdownTaskManager` | `%OneDriveCommercial%\TaskManager` | `G:\My Drive\TaskManager` |
| WSL（Bash） | `~/dev/MarkdownTaskManager` | `/mnt/c/Users/<ユーザー名>/OneDrive - <組織名>/TaskManager` | `/mnt/g/My Drive/TaskManager`（WSL から書き込める場合） |
| macOS（ターミナル） | `~/Developer/MarkdownTaskManager` | `~/Library/CloudStorage/OneDrive-<組織名>/TaskManager` | `~/Library/CloudStorage/GoogleDrive-<アカウント>/My Drive/TaskManager` |

- **Windows / WSL** では、通常は Windows 側の会社用 OneDrive を使います。PowerShell で `$env:OneDriveCommercial` を確認し、未設定の場合はエクスプローラーで実際の同期ルートを確認します。
- **WSL** の `local.config.json` には Linux 形式の絶対パスを指定します。`wslpath -u 'C:\Users\...\OneDrive - ...\TaskManager'` で Windows のパスを変換できます。ブラウザーは Windows 側の Edge / Chrome を使うため、起動時に `wslpath -w` で B と C を Windows のパスに戻します。
- **Google Drive** はマウント済みのドライブを使います。ドライブ文字や `My Drive` の表示名は環境ごとに変わるので、エクスプローラーや Finder で実パスを確認します。WSL から仮想ドライブが見えない、または書き込めない場合は、Windows 側の同期対象外フォルダーに ZIP を展開し直し、配備とバックアップを Windows 側で実行します。
- A は同期対象外、B/C/D は互いに別のフォルダーに置きます。運用データは C に置き、リポジトリ直下や `examples/` のサンプルはコピーしません。既存データがない場合は空の C を用意します。
- D だけを同期ドライブに置くこともできます。その場合は B と C の実パスを個別に指定します。C をローカルに置く場合は、タスクデータ自体のバックアップも別途用意してください。

## 3. 設定・配備・初回バックアップを実行する

1. A でターミナルを開き、`node --version` と `npm --version` を確認します。WSL では WSL 内の Node.js と npm を使います。Windows の PowerShell で `npm.ps1` が実行ポリシーにより止まる場合は、以降の `npm` を `npm.cmd` に置き換えるか、コマンドプロンプトを使います。
2. B/C/D を作成し、A の `local.config.example.json` を参考に `local.config.json` を作成します。既存の設定は先に読み、参照先が意図どおりなら再利用します。`MTM_CONFIG` や `MTM_APP_DIR` / `MTM_DATA_DIR` / `MTM_BACKUP_DIR` を使っている場合は、有効になっている設定を確認します。

   Windows の OneDrive の設定例です。Google Drive では `G:\\My Drive\\TaskManager\\app` など、実際のフォルダーに置き換えます。

   ```json
   {
     "appDir": "%OneDriveCommercial%\\TaskManager\\app",
     "dataDir": "%OneDriveCommercial%\\TaskManager\\data",
     "backupDir": "%OneDriveCommercial%\\TaskManager\\backup"
   }
   ```

   WSL の例です。macOS でも同じキーで、Finder で確認した `/Users/...` から始まる絶対パスを指定します。

   ```json
   {
     "appDir": "/mnt/c/Users/your-user/OneDrive - YourOrg/TaskManager/app",
     "dataDir": "/mnt/c/Users/your-user/OneDrive - YourOrg/TaskManager/data",
     "backupDir": "/mnt/c/Users/your-user/OneDrive - YourOrg/TaskManager/backup"
   }
   ```

3. 設定と同梱 HTML を確認します。

   ```text
   npm run config:check
   npm run build:check
   ```

   `config:check` が `[OK]` で、表示された 3 パスが手順 2 の場所を指していることを確認します。
   `build:check` が `OK` なら、同梱 HTML をそのまま配備できます。HTML がない、ソースと一致しない、または再ビルドが必要な場合は `npm ci` → `npm run build` → `npm run build:check` を実行します。
   レジストリに接続できない場合は、社内レジストリ、用意済みの npm キャッシュ（`npm ci --offline`）、同じソース・OS・CPU アーキテクチャ・Node.js メジャーバージョンで `npm ci` 済みの依存関係、またはビルド済み HTML を含むソース ZIP を使います。
4. B に `task-manager.html` を配備し、D に最初のソースバックアップを作ります。

   ```text
   npm run deploy:dry
   npm run deploy
   npm run backup
   ```

   先に dry-run で配備先を確認します。配備後、B の `task-manager.html` と D の `source` 内に新しく作られた ZIP を確認します。配備先に別バージョンの HTML があれば、旧版は D の `html` に退避されます。
   ソース ZIP には同じ PC での復元に使う `local.config.json` があれば含まれます。PC 固有のパスを ZIP に含めたくない場合は `npm run backup -- --no-local-config` を使います。
   ソース ZIP には実際のタスクデータを含めません。C を同期ドライブに置いた場合は、C のファイルもそのドライブで保全します。ローカル保存が終わったら、OneDrive または Google Drive のクライアントで同期状態を確認してください。

## 4. ブラウザーで開いて確認する

1. **Windows** はエクスプローラーから B の `task-manager.html` を Edge / Chrome で開きます。**WSL** は B と C の Windows パスを確認し、同じく Windows 側のブラウザーで開きます。**macOS** は Finder の「このアプリケーションで開く」から Chrome / Edge を選びます。
2. 「フォルダーを選択して開始」で C を選び、ブラウザーに読み書きを許可します。新規の空フォルダーの場合は作成確認を承認すると `kanban.md` と `archive.md` が作成されます。既存の V1 データを使う場合は、ブラウザーで開く際の自動移行について [利用ガイド](USER_GUIDE.md#旧形式v1のファイルを開いたとき) を先に確認します。
3. ボード上で `✓ 保存済み` を確認し、A で `npm run tasks -- check` を実行します。テスト用のタスクを作成して保存まで試す場合は、実務とは別の空フォルダーを使います。

Node.js を使えない場合は、ZIP 同梱の `task-manager.html` を A から開いて C を選べばブラウザーで利用できます。配備とソース ZIP バックアップは Node.js を使えるようになってから手順 3 で行います。

### ローカル HTML を直接開けない場合

会社でループバック配信が許可されていて Python 3 が使える場合は、ブラウザーと同じ PC で運用アプリフォルダー B を配信できます。パスを実際の B に置き換えてください。

```powershell
py -3 -m http.server 8765 --bind 127.0.0.1 --directory 'C:\...\TaskManager\app'
```

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory '/実際のパス/TaskManager/app'
```

Edge / Chrome で `http://127.0.0.1:8765/task-manager.html` を開き、C を選びます。WSL から起動したサーバーに Windows のブラウザーから接続できない場合は、Windows 側でサーバーを起動します。
配信するのは HTML だけを置いたフォルダーです。利用中はターミナルを開いておき、終了時は `Ctrl+C` で止めます。フォルダーへの読み書きが会社のポリシーで制限されている場合は、許可されたブラウザーと保存先を確認してください。
