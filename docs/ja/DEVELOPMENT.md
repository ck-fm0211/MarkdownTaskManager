# 開発ガイド

## 構成

```
src/index.html           画面の骨組み（/* build:css */・/* build:js */・<!-- build:meta --> に埋め込み）
src/styles/*.css         スタイル（番号順に連結）
src/scripts/*.js         スクリプト（番号順に連結し、1 つの <script> になる）
  00-theme.js            ダークモード
  01-state.js            画面全体の状態（tasks, config, archivedTasks …）
  02-i18n.js             翻訳（en / fr / de / zh_cn / ja）と表示言語
  03-storage.js          最近使ったプロジェクト（IndexedDB）、フォルダー選択、プロジェクト切替
  04-format.js           Markdown の解析・生成・欠落検査・ID 検索（DOM なしの純粋関数）
  04-io.js               プロジェクトの読み込み（openProject）、初期化、V1→V2 移行
  05-markdown.js         説明・メモの Markdown → HTML 表示（XSS 対策込み）
  06-filters.js          絞り込み・検索・オートコンプリート
  07-columns-form.js     列の管理、タスク作成・編集フォーム
  08-board.js            ボード描画、ドラッグ＆ドロップ
  09-task-detail.js      タスク詳細、サブタスク、フォーム送信
  10-archive.js          アーカイブ・復元・削除（2 ファイルをまたぐ処理）
  12-init.js             通知
  14-sync.js             安全な保存（基準内容の照合、直列化、競合、退避、外部変更の確認）
build.mjs                ビルド（構文チェック → 連結 → 最小化 → 出力検証 → 一時ファイル経由で書き込み）
scripts/                 配備・バックアップ・復元確認・設定確認・タスクデータ確認（依存なしの Node スクリプト）
tools/windows/*.cmd      上記を Windows でダブルクリック実行するためのラッパー
tests/unit               フォーマット層のテスト（Node のみ）
tests/scripts            配備・ビルド失敗・バックアップ・復元のテスト（一時フォルダーで実行）
tests/e2e                ビルド済み task-manager.html をブラウザーで動かすテスト（File System Access API のモック）
```

すべてのスクリプトは 1 つの `<script>` に連結される「クラシックスクリプト」なので、関数はファイルをまたいで呼べます。
モジュール化・フレームワーク導入はしていません（単一 HTML・オフライン動作を優先）。

## ビルド

```
npm ci              # 初回・package-lock.json 変更時
npm run build       # task-manager.html（最小化）
npm run build:dev   # 読みやすい（最小化しない）task-manager.html
npm run build:check # task-manager.html が現在のソースから作られたものか確認
```

- HTML には `<meta name="mtm-build" content="version=…;source=…">` と `BUILD_INFO` を埋め込みます。
  `source` はビルド入力（`src/`、`build.mjs`、`package.json`、`package-lock.json`。改行コードは正規化）のハッシュで、
  同じソースからは同じ HTML ができます。画面のタイトルにマウスを乗せると表示されます。
- 構文エラー・外部リソース参照・ビルド情報の欠落があるとビルドは失敗し、既存の `task-manager.html` は変更されません。
- `task-manager.html` は生成物ですが、利用者がダウンロードしてすぐ使えるようにリポジトリにも含めています。
  ソースを変更したら必ず再ビルドしてからコミットしてください（`npm run build:check` で確認）。

## テスト

```
npm test            # unit + scripts + e2e（e2e は先に npm run build が必要）
npm run test:unit   # ブラウザー不要のテストだけ
npm run test:e2e    # ブラウザーテストだけ
npm run check       # build → test
```

ブラウザーテストは `playwright-core`（devDependency。ブラウザー本体はダウンロードしない）で、次の順に起動を試みます:
環境変数 `MTM_BROWSER_PATH`（実行ファイル）→ `MTM_BROWSER_CHANNEL`（`msedge` / `chrome`）→ Playwright のブラウザー →
インストール済みの Microsoft Edge → Google Chrome。どれも起動できない場合、`npm test` ではスキップ（警告を表示）、
`npm run test:e2e` では**失敗**になります。会社 PC では通常そのまま Edge で動きます。
`file://` を開けない環境では、自動で `http://127.0.0.1` から配信して実行します（`MTM_TEST_HTTP=1` で常にこの方式）。

ブラウザーテストは実フォルダーではなく、File System Access API のモック（`tests/e2e/helpers.mjs`）を使います。
読み込み失敗・内容の読み取り失敗（`contentFail`）・書き込み失敗・遅延・外部編集・ファイル削除を注入でき、
`writeBytes()` / `readBytes()` で UTF-8 以外のバイト列（Shift_JIS など）のファイルも扱えます。
ネットワークなしの確認は、`file://` ではブラウザーをオフラインにし、`http://127.0.0.1` 配信のときはアプリの HTML だけを
テスト内で直接返して、それ以外の通信をすべて遮断・記録します（記録が空であることを確認）。実フォルダー・OneDrive での確認は [TESTING.md](TESTING.md) の手順で行います。

## 翻訳の追加・変更

- `src/scripts/02-i18n.js` の `translations` にキーを追加します。`en` は必須（他の言語にないキーは英語で表示）、`ja` も必ず追加してください。
- 画面に出す文字列は `t('キー', {引数})` で取得します。HTML に入れるときは `escapeHtml()` を通します。
- アイコンだけのボタンには `title` と `aria-label` を付けます（`updateStaticTexts()` 参照）。
- 日付の表示形式は `locale.dates` キー（`ja-JP` など）を使います。
- **翻訳しないもの**: Markdown のキー（`**Status**`、`**Priority**`、`## Tasks`、`## ⚙️ Configuration` など）、
  列 ID、既定の優先度の値（Critical/High/Medium/Low。表示だけ翻訳）、利用者が入力した列名・タグ等。

## 変更時の注意

- kanban.md の保存は `autoSave()` / `persistKanban()`、それ以外の書き込み（archive.md など）は `enqueueWrite()` の中で
  `writeFileChecked()` を使ってください（14-sync.js）。`createWritable()` を直接呼ばないこと。`writeFileChecked()` は
  読み取り専用（`session.blocked`）・競合中のファイルへの書き込みを拒否します。待ち行列に入れた処理は、実行を始める
  時点で前提（読み取り専用でない・競合がない）をもう一度確認してください（10-archive.js の `refusedAtStart()`）。
- ファイルを読むときは `file.text()` ではなく `decodeUtf8(await file.arrayBuffer())` を使ってください（UTF-8 以外を検出）。
- プロジェクトを開く処理を追加する場合は、`newProjectRequest()`（03-storage.js）で要求番号を**最初の `await` より前に**取り、
  `await` のたびに古い要求でないか確認してください（後から番号を取ると、その間に始まった利用者の操作を追い越します）。
- タスクのメタデータ行かどうかは `metaLineMask()`（04-format.js）で判定してください。解析（`parseTask`）と欠落検査
  （`blockTokens`）が同じ規則を使わないと、正常なファイルが読み取り専用になったり、説明の行が項目になったりします。
- 新しいタスクの ID を決める前に `canCreateNewTask()` を呼んでください（`archive.md` が読めない・UTF-8 でない間は作らない）。
- `scripts/` で、設定が壊れていても処理を続けるものは `loadConfig({ lenient: true })` を使い、`cfg.errors` を確認してください
  （環境変数で指定したフォルダーは有効なまま）。ZIP や記録ファイルに残す文言には、例外のメッセージをそのまま入れないこと
  （`JSON.parse` のメッセージは入力の一部を含みます。位置は `jsonErrorWhere()`）。
- 未保存の判定は `hasUnsavedWork()`（ボードの未保存 + フォームの入力）を使ってください。
- タスクのフォームから書く値は、保存前に `taskWriteProblems()`（04-format.js）で読み戻しを確認しています。
- データを変更する操作の先頭で `guardWritable()` を呼び、読み取り専用・競合中の編集を防いでください。
- 成功通知は保存の成功を確認してから出してください（`persistKanban(成功メッセージ)`）。
- 形式を変える場合は `tests/unit/format.test.mjs` に往復（解析 → 生成 → 解析）のテストを追加してください。
  レビュー指摘の回帰テストは `tests/unit/review.test.mjs`・`tests/e2e/review.test.mjs`・`tests/scripts/ops.test.mjs` にあります。
