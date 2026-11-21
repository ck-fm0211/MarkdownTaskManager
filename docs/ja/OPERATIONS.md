# 運用ガイド（会社 PC・OneDrive）

## 1. フォルダー構成

| | 名前 | OneDrive | 置くもの | 更新するもの |
|---|---|---|---|---|
| A | 開発フォルダー | **同期対象外**（例: `C:\dev\MarkdownTaskManager`） | ソース一式、`node_modules`、AI 用指示、スクリプト、`local.config.json` | 開発者・AI |
| B | 運用アプリフォルダー | 同期対象（例: `OneDrive - 会社\TaskManager\app`） | `task-manager.html` だけ | `npm run deploy` のみ |
| C | 運用データフォルダー | 同期対象（例: `…\TaskManager\data`） | `kanban.md`、`archive.md` | ブラウザー、AI、エディター |
| D | バックアップフォルダー | 同期対象（例: `…\TaskManager\backup`） | `source\` ソース ZIP、`html\` 旧 HTML、`deploy-log.jsonl` | `npm run backup` / `deploy` |

- A を同期対象外にするのは、`node_modules` の大量ファイルやビルド中の一時ファイルを OneDrive に流さないためです。
  その代わり、ソースは `npm run backup` で D に ZIP として残します。
- B と C は分けます。配備は B の `task-manager.html` 1 ファイルだけを置き換え、C には触れません。
- シンボリックリンクやフォルダー全体の同期・ミラーリングは使いません。A からは設定ファイルで B/C/D を参照します。
- **ソース ZIP（D）とタスクデータ（C）の OneDrive 同期は別の役割です。** ZIP はソースの世代保存、
  C の同期はタスクデータそのものの共有・保全です。タスクデータの世代管理は OneDrive のバージョン履歴を使ってください。
- スクリプトの「完了」は **OneDrive フォルダーへのローカル保存の完了**です。クラウドへの同期完了ではありません。
  同期状態はエクスプローラー／タスクバーの OneDrive アイコンで確認してください。

## 2. 初期設定（会社 PC で 1 回）

前提: Node.js 20 以上（ビルド・配備・バックアップ用。通常利用には不要）。

1. ソースの ZIP（GitHub の「Download ZIP」、または `npm run release` で作ったもの）を A に展開します。
2. A でターミナル（PowerShell / コマンドプロンプト）を開きます。
   ```
   npm ci
   npm run build
   npm run test:unit
   ```
   `npm ci` には npm レジストリへの接続が必要です。社内で接続できない場合は、接続できる環境で
   `npm ci` 済みのフォルダーごと（`node_modules` を含めて）持ち込むか、社内のレジストリ／プロキシ設定を使ってください。
3. B・C・D のフォルダーを OneDrive 内に作ります。
4. `local.config.example.json` を `local.config.json` にコピーして編集します（Git 管理外）。
   ```json
   {
     "appDir": "%OneDriveCommercial%\\TaskManager\\app",
     "dataDir": "%OneDriveCommercial%\\TaskManager\\data",
     "backupDir": "%OneDriveCommercial%\\TaskManager\\backup"
   }
   ```
   `%OneDriveCommercial%`（会社の OneDrive）、`%OneDrive%`、`%USERPROFILE%` などの環境変数が使えるので、
   個人名を書かずに済みます。環境変数 `MTM_APP_DIR` / `MTM_DATA_DIR` / `MTM_BACKUP_DIR` でも指定できます。
5. `npm run config:check` で各フォルダーが ✓ になることを確認します。
6. `npm run deploy:dry` で配備内容を確認し、`npm run deploy` で B に配備します。
7. B の `task-manager.html` を Edge で開き、C を選択します（既存データがあれば C に置いておく）。

サンプルデータ（リポジトリの `kanban.md` / `archive.md` / `examples/`）は運用データにコピーしないでください。
配備・バックアップのスクリプトも運用データへは何もコピーしません。

## 3. 日常のコマンド

Windows では `tools\windows\*.cmd` をダブルクリックしても実行できます（終了時に一時停止します。
`set MTM_NO_PAUSE=1` で停止しません）。引数はそのまま渡されます（例: `deploy.cmd --allow-stale`）。

| 目的 | コマンド | .cmd |
|---|---|---|
| ビルド | `npm run build` | `build.cmd` |
| 配備前の確認（何も書かない） | `npm run deploy:dry` | `deploy-dry-run.cmd` |
| 配備（ビルド済み HTML を B へ） | `npm run deploy` | `deploy.cmd` |
| ビルドが成功したときだけ配備 | `npm run build-deploy` | `build-deploy.cmd` |
| ソース ZIP バックアップ | `npm run backup` | `backup.cmd` |
| 設定の確認 | `npm run config:check` | `check-config.cmd` |
| 運用データの形式チェック | `npm run tasks -- check` | `check-tasks.cmd` |
| テスト（ブラウザーなし） | `npm run test:unit` | `test-unit.cmd` |

### 配備（deploy）の動き

- 配備元 `A\task-manager.html` が**現在のソースからビルドされたもの**か確認します（HTML に埋め込んだ
  ソースハッシュで判定）。ビルド失敗・未ビルドなら配備しません（`--allow-stale` で強制可）。
- 配備先が未設定・存在しない・C と同じ・`kanban.md` を含む場合、また既存の HTML があるのに `backupDir` が未設定の場合は、
  何もせずに停止して理由を表示します（配備先には `task-manager.html` 以外のファイルを作りません）。
- 既存の `B\task-manager.html` を `D\html\task-manager.<日時>.<旧ハッシュ>.html` に**コピーして内容を確認してから**、
  一時ファイル経由で置き換え、置き換え後の内容を読み戻して一致を確認します。どこかで失敗したら「配備失敗／中止」と表示し、
  成功とは表示しません。
- `D\deploy-log.jsonl` に日時・版・退避ファイル名を追記します（フォルダー名のみでフルパスは書きません）。
- ブラウザーで開いている場合は F5 で新しい版になります。旧版に戻すには、`D\html\` の退避ファイルを
  `B\task-manager.html` としてコピーし直します。

### バックアップ（backup）の動き

- 作業途中（ビルドが通らない状態）でも作成できます。ファイル名は
  `markdown-task-manager-src-<日時>[-ラベル][-dirty].zip`（`-dirty` は未コミットの変更あり）。
- `package.json`・`FORK_INFO.json`・設定ファイルが編集途中で JSON として読めなくても作成できます（固定名
  `markdown-task-manager` で作り、読めなかったことを `README-RESTORE.md` と manifest の `metadataErrors` に記録します。
  記録するのは「JSON として読めません（3 行目 15 列目）」のような決まった文言と位置だけで、ファイルの内容の一部を含む
  エラーメッセージは ZIP に残しません。画面には詳しいメッセージを表示します）。
  設定ファイルが読めない場合も、環境変数（`MTM_DATA_DIR` など）で指定したフォルダーは除外します。設定ファイルにしか
  書かれていない運用データフォルダーはわからないため、次のどれかを含むフォルダー（開発フォルダー直下と `examples/` を除く）を
  運用データとみなして除外し、注意を表示します（大文字・小文字は区別しません）。
  - `kanban.md` / `archive.md`、その退避・書き出し（`kanban.v1-backup.md`、`kanban.unsaved-….md` など。名前だけで判定）
  - 名前が `kanban` / `archive` で始まる `.md` で、中身がタスクのファイルのもの（`### TASK-<番号>` の行、`<!-- Format: v2 -->`・
    `<!-- Config: Last Task ID: … -->`、`## ⚙️ Configuration`、`**Columns**:` の行のどれかがある。先頭 64 KB を、NUL を除いて
    調べるので UTF-16 のコピーも含みます）。「kanban - コピー.md」「kanban (2).md」や OneDrive の競合コピー
    （「kanban-PC名.md」）など。中身で判定するため、`kanban-ideas.md` のようなメモや `docs/images/kanban-board.jpg` のある
    フォルダーは除外しません。タスクが 1 件もなく、上の行もないコピー（中身が空に近いもの）は除外されません`--out` も `backupDir`（環境変数）もなければ
  開発フォルダー内の `backups/` に出力します。
  `package.json` が壊れていると **npm 自体が起動しない**ため、そのときは `node scripts/backup.mjs`（オプションは同じ）
  を直接実行します。`tools\windows\backup.cmd` は最初から Node を直接実行します。
- 含めるもの: `src/`、`build.mjs`、`package.json`、`package-lock.json`、`task-manager.html`、ドキュメント、LICENSE、
  テスト、`AGENTS.md`、`AI_WORKFLOW.md`、`.claude/` などの AI 用設定、`scripts/`、`tools/`、`.gitignore` などの隠しファイル。
- 除外するもの: `node_modules`、キャッシュ・ログ・一時ファイル、過去の ZIP（`backups/`・`dist/`・出力先自身）、
  `.env`・鍵ファイル・`.npmrc`・`.claude/settings.local.json`（許可コマンドにトークンが含まれ得る）・`service-account*.json`
  などの秘密情報らしきファイル、`secrets/`・`credentials/`・`.ssh/`・`.aws/`・`.azure/`・`.gnupg/`・`.kube/`・`.docker/`
  など秘密情報らしきフォルダー（中のファイル名にかかわらずフォルダーごと。ローカル保管用にも含めません）、
  設定された運用データフォルダー、復元した ZIP に入っていた `_backup_info/`（新しいものを作り直します）、
  Git worktree の `.git` ファイル。
- **Git 履歴（`.git`）は既定で含めません。** この ZIP はソースの復元用で、Git 履歴は含みません。
  履歴も残したいときは `npm run backup -- --include-git`。
- `local.config.json`（個別 PC 設定。フォルダーのパスのみ）は、**ローカル保管用のバックアップには含めます**（同じ PC で
  復元しやすくするため）。含めたくないときは `--no-local-config`。公開用の `npm run release` には決して含めません。
  環境変数 `MTM_CONFIG` で別名の設定ファイル（開発フォルダー内）を使っている場合は、そのファイルも同じ扱いです。
- `npm run release`（公開用 ZIP）は、Git 管理下のファイルだけを対象にし、**Git 管理下のファイルに未コミットの変更があると
  作成を拒否します**（作業中の内容が公開されるのを防ぐため。確認のうえ強制する場合のみ `--allow-dirty`）。
  未追跡のファイル（メモなど）は ZIP に入らないため作成を妨げず、ZIP 内の情報（manifest）にもファイル名は残しません
  （除外した件数だけを記録します）。
  **Git のないフォルダー**（展開した ZIP など）から作る場合は、Git に聞けないため、決められたプロジェクトのファイル
  （`src/`・`scripts/`・`tests/`・`tools/`・`docs/`・`examples/`・`.claude/skills/`、ルートの既知のファイル）だけを入れます。
  それ以外のファイル（メモ・設定・鍵など）は名前にかかわらず入れません。`package.json` や設定ファイルが読めない場合は
  作成しません。
- ZIP は `.partial` として書き、全エントリーを読み戻して内容を照合してから正式な名前に変えます。
  失敗したら `.partial` は削除され、有効なバックアップと誤認されるファイルは残りません。同名がある場合は `-2` などを付け、上書きしません。
- 古い世代は自動削除しません。D の容量を見て手動で整理してください。
- ZIP 内の `_backup_info/README-RESTORE.md` に、作成日時・fork 元と基準コミット・Git の状態・作業途中の変更の有無・
  実行環境・ビルド確認状況・復元手順を記録します（`--check-build` で一時フォルダーへの試しビルドの結果も記録。
  出力中の一時フォルダー・開発フォルダー・ホームフォルダーのパスは、開発フォルダーからの相対パス（空白を含むもの）と
  `file:///…` の URL 形式（空白や日本語が `%20` などになったもの）も含めて伏せて記録します。それ以外の `file://` の絶対パスも、最後の部分だけにします）。

### 復元

1. ZIP を **OneDrive 同期対象外**のフォルダーに展開します。
2. そのフォルダーで `npm ci`（ロックファイルどおりに依存を再取得）→ `npm run build` → `npm run build:check`。
3. 自動で確認する場合は、元の開発フォルダーで:
   ```
   npm run restore:verify -- "D:\…\backup\source\markdown-task-manager-src-20261117-101500.zip"
   ```
   一時フォルダーに展開 → 全ファイルの SHA-256 照合 → `npm ci` → ビルドまで行い、元のフォルダーは変更しません。
   `npm ci` には npm レジストリへの接続か、npm のキャッシュが必要です。どちらもない PC では
   `--reuse-node-modules` を付けると、開発フォルダーの `node_modules` をリンクして（`npm ci` なしで）展開・照合・ビルドを
   確認します（ロックファイルからインストールできることは確認しません。リンクは終了時に外し、元の `node_modules` は
   変更しません。途中のエラーや Ctrl+C で終わった場合もリンクを外します。このスクリプトだけに中断の合図が送られた場合
   （`kill` など）も、実行中の `npm ci` / ビルドを止めてすぐに終わり、終了コードは 128 ＋ シグナル番号です）。`--skip-install` だけでは、展開先に `node_modules` がないためビルドできません。

   中断（Ctrl+C・`kill` など、スクリプトが受け取れる合図）の扱い:
   - 実行中の `npm ci` / ビルドには終了の合図（POSIX は SIGTERM、Windows は `taskkill /T /F`）を送り、3 秒たっても終わらなければ
     POSIX では SIGKILL で止めます。それでも終わらない場合は、その処理の PID を表示します（タスクマネージャーや `kill -9` で
     終了させてください）。
   - ビルドの後の確認・一時フォルダーの削除の間に届いた合図でも、「OK」を出さずに 128 ＋ シグナル番号で終わります（npm ci の前、
     ビルドの前後、「OK」の直前に合図を確認します）。一時フォルダーの削除中に中断すると、一時フォルダーの一部が残ることがあります。
     ZIP の展開・照合の最中に届いた合図は、次の確認の時点（npm ci / ビルドの開始前）で処理します。
   - 失敗の表示に出す `npm ci` / ビルドの出力は、最後の行（最大 4000 文字）だけです（出力は UTF-8 として読み、末尾 64K 文字だけを
     保持します）。
   - **Windows の強制終了**（タスクマネージャーの「タスクの終了」、`taskkill /F`、Node の `child.kill()` など）は、スクリプトが
     処理できません。この場合、展開先の `node_modules` のリンク（ジャンクション）が残ることがあります（残るのはリンクだけで、
     開発フォルダーの `node_modules` は消えません）。残ったら展開先のフォルダーごと削除してください（エクスプローラーで
     ジャンクションを削除しても、リンク先は削除されません）。POSIX の SIGKILL（`kill -9`）も同じです。
   - Windows の `taskkill`・SIGBREAK / SIGHUP（コンソールを閉じた場合）・ジャンクションの作成と削除は、実機では未確認です。

## 4. 会社 PC へ持ち込むもの

- 必須: ソース一式の ZIP（GitHub の「Download ZIP」または `npm run release` の出力）。
  `node_modules`・実データ・個別 PC 設定・秘密情報は含みません。
- 社内で npm レジストリに接続できない場合のみ: `npm ci` 済みの `node_modules` も（同じ OS・同じ Node.js メジャーバージョンで作ったもの）。
- 持ち込み後は GitHub への接続なしで、ビルド・配備・バックアップが動きます。`npm ci`（初回と、復元確認の既定の動作）だけは
  npm レジストリか npm のキャッシュが必要です。どちらもない場合、復元確認は `--reuse-node-modules` を付けて実行します。
- 本家・fork との自動同期は行いません。必要な機能が揃った版を固定して使ってください。

## 5. OneDrive 利用時の注意

- OneDrive が `kanban.md` を同期・更新した場合も「外部の変更」として扱われます。未保存の変更がなければ自動で読み込み、
  あれば競合として止まります。
- 2 台の PC で同じデータを同時に編集すると、OneDrive が「kanban-PC名.md」のような競合コピーを作ることがあります。
  これはこのアプリでは統合しません。編集する PC は同時に 1 台にしてください。
- 「ファイル オンデマンド」でクラウドのみのファイルは、開くときにダウンロードされます。オフラインで開けない場合は
  「このデバイス上に常に保持する」を設定してください。

## 6. 将来拡張（今回は未実装）

- **Teams メッセージからの自動起票**: 取得・認証・起票は実装していません。追加する場合は、開発フォルダー内に
  スキル（例: `.claude/skills/teams-intake/SKILL.md`）やスクリプトを置き、書き込み先は `local.config.json` の `dataDir`、
  ID は `npm run tasks -- next-id`、書き込み後に `npm run tasks -- check` を実行する、という AGENTS.md の手順に乗せる想定です。
- **月次・経過日数による自動アーカイブ**: 実装していません（新しいスケジューラーや常駐処理は追加していません）。
  実装する場合も、アーカイブは「archive.md へ追加 → 確認 → kanban.md から削除」の順で、ブラウザーと同時に動かさないこと。
